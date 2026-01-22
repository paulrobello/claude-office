import asyncio
import contextlib
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select

from app.api.websocket import manager
from app.config import get_settings
from app.core.jsonl_parser import get_last_assistant_response
from app.core.state_machine import StateMachine
from app.core.summary_service import get_summary_service
from app.core.transcript_poller import get_transcript_poller, init_transcript_poller
from app.db.database import AsyncSessionLocal
from app.db.models import EventRecord, SessionRecord
from app.models.agents import Agent, AgentState, BossState
from app.models.common import BubbleContent, BubbleType
from app.models.events import Event, EventData, EventType
from app.models.sessions import GameState, HistoryEntry

logger = logging.getLogger(__name__)


def derive_git_root(working_dir: str) -> str | None:
    """Derive the git project root from a working directory.

    Walks up the directory tree looking for a .git directory.
    Returns the path containing .git, or None if not found.

    Args:
        working_dir: Starting directory path

    Returns:
        The git project root path, or None if not a git repository
    """
    if not working_dir:
        return None

    try:
        path = Path(working_dir).resolve()

        # Walk up looking for .git
        for parent in [path, *path.parents]:
            git_dir = parent / ".git"
            if git_dir.exists():
                return str(parent)

            # Stop at filesystem root
            if parent == parent.parent:
                break

        # No .git found - the working_dir might still be valid,
        # just not a git repo. Return it as-is.
        if path.exists() and path.is_dir():
            return str(path)

    except (OSError, ValueError) as e:
        logger.warning(f"Error deriving git root from {working_dir}: {e}")

    return None


class EventProcessor:
    """Processes Claude Code hook events and manages session state."""

    def __init__(self) -> None:
        self.sessions: dict[str, StateMachine] = {}
        self._sessions_lock = asyncio.Lock()
        self._poller_initialized = False

    def _ensure_poller(self) -> None:
        """Initialize the transcript poller if not already done."""
        if not self._poller_initialized:
            init_transcript_poller(self._handle_polled_event)
            self._poller_initialized = True

    async def _handle_polled_event(self, event: Event) -> None:
        """Handle events extracted from polled subagent transcripts."""
        logger.debug(
            f"Polled event: {event.event_type} agent={event.data.agent_id} "
            f"tool={event.data.tool_name}"
        )
        # Process through the normal event pipeline
        await self._process_event_internal(event)

    async def remove_session(self, session_id: str) -> None:
        """Remove a session's in-memory state and locks.

        Args:
            session_id: Identifier for the session to purge.
        """
        async with self._sessions_lock:
            self.sessions.pop(session_id, None)

    async def clear_all_sessions(self) -> None:
        """Clear all in-memory session state."""
        async with self._sessions_lock:
            self.sessions.clear()

    async def get_current_state(self, session_id: str) -> GameState | None:
        """Retrieve current game state for a session if it exists."""
        if session_id not in self.sessions:
            await self._restore_session(session_id)

        sm = self.sessions.get(session_id)
        if sm:
            return sm.to_game_state(session_id)
        return None

    async def get_project_root(self, session_id: str) -> str | None:
        """Get the cached project_root for a session from the database.

        Args:
            session_id: The session identifier

        Returns:
            The project root path if cached, None otherwise
        """
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SessionRecord.project_root).where(SessionRecord.id == session_id)
            )
            row = result.scalar_one_or_none()
            return row

    async def process_event(self, event: Event) -> None:
        """Process an incoming event and update session state."""
        logger.info(
            f"Processing event: {event.event_type} "
            f"Session: {event.session_id} "
            f"Agent: {event.data.agent_id if event.data else 'N/A'}"
        )

        try:
            await self._process_event_internal(event)
        except Exception as e:
            logger.exception(f"Error processing event {event.event_type}: {e}")
            # Broadcast error to clients so they know something went wrong
            with contextlib.suppress(Exception):
                await manager.broadcast(
                    {
                        "type": "error",
                        "message": f"Error processing {event.event_type}: {e!s}",
                        "timestamp": event.timestamp.isoformat(),
                    },
                    event.session_id,
                )

    async def _process_event_internal(self, event: Event) -> None:
        """Process event, update state, and broadcast to clients."""
        await self._persist_event(event)

        if event.session_id not in self.sessions:
            await self._restore_session(event.session_id)

        if event.session_id not in self.sessions:
            self.sessions[event.session_id] = StateMachine()

        sm = self.sessions[event.session_id]

        sm.transition(event)

        agent_id = event.data.agent_id if event.data and event.data.agent_id else "main"
        event_dict: HistoryEntry = {
            "id": str(event.timestamp.timestamp()),
            "type": str(event.event_type),
            "agentId": agent_id,
            "summary": self._get_event_summary(event),
            "timestamp": event.timestamp.isoformat(),
        }
        sm.history.append(event_dict)
        if len(sm.history) > 500:
            sm.history = sm.history[-500:]

        if event.event_type == EventType.SUBAGENT_START and event.data and event.data.agent_id:
            agent_id = event.data.agent_id
            if agent_id in sm.agents:
                await self._enrich_agent_with_summaries(sm.agents[agent_id], event.data)
                # Update lifespan with enriched short name
                enriched_name = sm.agents[agent_id].name
                if enriched_name:
                    for lifespan in sm.agent_lifespans:
                        if lifespan.agent_id == agent_id:
                            lifespan.agent_name = enriched_name
                            break

        await self._broadcast_state(event.session_id)

        await manager.broadcast(
            {
                "type": "event",
                "timestamp": event.timestamp.isoformat(),
                "event": event_dict,
            },
            event.session_id,
        )

        if event.event_type == EventType.SUBAGENT_START and event.data and event.data.agent_id:
            agent_id = event.data.agent_id
            sm.boss_state = BossState.DELEGATING

            transcript_path = event.data.agent_transcript_path
            if transcript_path:
                self._ensure_poller()
                poller = get_transcript_poller()
                if poller:
                    await poller.start_polling(agent_id, event.session_id, transcript_path)

            await self._update_agent_state(event.session_id, agent_id, AgentState.WALKING_TO_DESK)
            sm.boss_state = BossState.IDLE
            await self._broadcast_state(event.session_id)

        if event.event_type == EventType.SUBAGENT_INFO and event.data:
            transcript_path = event.data.agent_transcript_path
            native_agent_id = event.data.native_agent_id

            if transcript_path and native_agent_id:
                self._ensure_poller()
                poller = get_transcript_poller()
                if poller:
                    for agent_id in sm.agents:
                        agent = sm.agents[agent_id]
                        # Store native_id for agents that don't have it yet
                        if agent.native_id is None:
                            agent.native_id = native_agent_id
                            logger.info(f"Linked agent {agent_id} to native ID {native_agent_id}")
                        if not await poller.is_polling(agent_id):
                            logger.info(
                                f"Starting transcript polling for {agent_id} "
                                f"(native: {native_agent_id}) at {transcript_path}"
                            )
                            await poller.start_polling(agent_id, event.session_id, transcript_path)
                            break

        if event.event_type == EventType.AGENT_UPDATE and event.data and event.data.agent_id:
            agent_id = event.data.agent_id
            if agent_id in sm.agents and event.data.bubble_content:
                sm.agents[agent_id].bubble = event.data.bubble_content
                logger.debug(
                    f"Updated agent {agent_id} bubble: {event.data.bubble_content.text[:50]}..."
                )
                await self._broadcast_state(event.session_id)

        if event.event_type == EventType.SUBAGENT_STOP and event.data:
            agent_id = event.data.agent_id
            native_agent_id = event.data.native_agent_id

            # Try to find the agent by agent_id first, then by native_id
            if agent_id and agent_id in sm.agents:
                resolved_agent_id = agent_id
            elif native_agent_id:
                # Look up by native_id
                resolved_agent_id = None
                for aid, agent in sm.agents.items():
                    if agent.native_id == native_agent_id:
                        resolved_agent_id = aid
                        logger.info(f"Resolved native agent {native_agent_id} to {aid}")
                        break
                if not resolved_agent_id:
                    logger.warning(
                        f"SUBAGENT_STOP for unknown native agent {native_agent_id}, skipping"
                    )
                    return
            else:
                logger.warning("SUBAGENT_STOP with no agent_id or native_agent_id, skipping")
                return

            poller = get_transcript_poller()
            if poller:
                await poller.stop_polling(resolved_agent_id)

            await self._extract_and_set_agent_speech(
                sm, resolved_agent_id, event.data.agent_transcript_path
            )

            await self._broadcast_state(event.session_id)

            sm.remove_agent(resolved_agent_id)
            await self._persist_synthetic_event(event.session_id, EventType.CLEANUP, event.data)
            await self._broadcast_state(event.session_id)

        if event.event_type == EventType.STOP and event.data:
            logger.info(
                f"STOP event: boss_bubble before extract = "
                f"{sm.boss_bubble.text[:50] if sm.boss_bubble else 'None'}..."
            )
            await self._extract_and_set_boss_speech(sm, event.data.transcript_path)
            logger.info(
                f"STOP event: boss_bubble after extract = "
                f"{sm.boss_bubble.text[:50] if sm.boss_bubble else 'None'}..."
            )
            await self._detect_and_set_print_report(sm)
            logger.info(f"STOP event: print_report = {sm.print_report}")
            await self._broadcast_state(event.session_id)

        if event.event_type == EventType.USER_PROMPT_SUBMIT and event.data and event.data.prompt:
            summary_service = get_summary_service()
            sm.boss_current_task = await summary_service.summarize_user_prompt(event.data.prompt)
            logger.debug(f"Boss current task set to: {sm.boss_current_task}")
            await self._broadcast_state(event.session_id)

    async def _persist_synthetic_event(
        self, session_id: str, event_type: EventType, data: EventData | dict[str, Any] | None
    ) -> None:
        """Helper to save intermediate lifecycle states to DB for perfect replay."""
        payload: dict[str, Any]
        if data is None:
            payload = {}
        elif isinstance(data, EventData):
            payload = data.model_dump()
        else:
            payload = data
        async with AsyncSessionLocal() as db:
            event_rec = EventRecord(
                session_id=session_id,
                timestamp=datetime.now(UTC),
                event_type=event_type.value,
                data=payload,
            )
            db.add(event_rec)
            await db.commit()

    async def _restore_session(self, session_id: str) -> None:
        """Attempt to reconstruct a StateMachine from DB events."""
        async with AsyncSessionLocal() as db:
            # Get all events for this session, sorted by time
            result = await db.execute(
                select(EventRecord)
                .where(EventRecord.session_id == session_id)
                .order_by(EventRecord.timestamp.asc())
            )
            events = result.scalars().all()

            if not events:
                return

            logger.info(f"Restoring session {session_id} from {len(events)} events in DB")

            sm = StateMachine()
            skipped_count = 0
            for rec in events:
                try:
                    # Convert DB record back to Pydantic Event
                    evt = Event(
                        event_type=EventType(rec.event_type),
                        session_id=rec.session_id,
                        timestamp=rec.timestamp,
                        data=EventData.model_validate(rec.data) if rec.data else EventData(),
                    )
                    # Replay the transition to restore state
                    sm.transition(evt)

                    # Add to history for UI sync
                    agent_id = evt.data.agent_id if evt.data and evt.data.agent_id else "main"
                    history_entry: HistoryEntry = {
                        "id": str(evt.timestamp.timestamp()),
                        "type": str(evt.event_type),
                        "agentId": agent_id,
                        "summary": self._get_event_summary(evt),
                        "timestamp": evt.timestamp.isoformat(),
                    }
                    sm.history.append(history_entry)
                except Exception as e:
                    skipped_count += 1
                    logger.warning(
                        f"Skipping malformed event {rec.id} (type={rec.event_type}): {e}"
                    )
                    continue

            if skipped_count > 0:
                logger.warning(f"Skipped {skipped_count} malformed events during restoration")

            # Keep only last 500
            if len(sm.history) > 500:
                sm.history = sm.history[-500:]

            self.sessions[session_id] = sm

    async def _persist_event(self, event: Event) -> None:
        """Save event to database and manage session records."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SessionRecord).where(SessionRecord.id == event.session_id)
            )
            session_rec = result.scalar_one_or_none()

            project_name = event.data.project_name if event.data else None
            project_dir = event.data.project_dir if event.data else None
            working_dir = event.data.working_dir if event.data else None

            source_dir = project_dir or working_dir
            project_root = derive_git_root(source_dir) if source_dir else None

            if not session_rec:
                session_rec = SessionRecord(
                    id=event.session_id,
                    project_name=project_name,
                    project_root=project_root,
                )
                db.add(session_rec)
            else:
                if project_name and not session_rec.project_name:
                    session_rec.project_name = project_name

                if project_root and not session_rec.project_root:
                    session_rec.project_root = project_root
                    logger.info(
                        f"Cached project_root for session {event.session_id}: {project_root}"
                    )

                if event.event_type == EventType.SESSION_START:
                    await db.execute(
                        delete(EventRecord).where(EventRecord.session_id == event.session_id)
                    )
                    session_rec.status = "active"
                    session_rec.updated_at = datetime.now(UTC)
                    if project_name:
                        session_rec.project_name = project_name
                    if project_root:
                        session_rec.project_root = project_root

            if event.event_type == EventType.SESSION_END:
                session_rec.status = "completed"
                session_rec.updated_at = datetime.now(UTC)

            event_rec = EventRecord(
                session_id=event.session_id,
                timestamp=event.timestamp,
                event_type=event.event_type,
                data=event.data.model_dump() if event.data else {},
            )
            db.add(event_rec)
            await db.commit()

    async def _update_agent_state(self, session_id: str, agent_id: str, state: AgentState) -> None:
        """Update an agent's state and broadcast to clients."""
        sm = self.sessions.get(session_id)
        if sm and agent_id in sm.agents:
            sm.agents[agent_id].state = state
            if state in [
                AgentState.WALKING_TO_DESK,
                AgentState.LEAVING,
                AgentState.COMPLETED,
                AgentState.WAITING,
            ]:
                sm.agents[agent_id].bubble = None
            await self._broadcast_state(session_id)

    async def _broadcast_state(self, session_id: str) -> None:
        """Helper to broadcast current state to all session clients."""
        sm = self.sessions.get(session_id)
        if not sm:
            return

        game_state = sm.to_game_state(session_id)
        await manager.broadcast(
            {
                "type": "state_update",
                "timestamp": game_state.last_updated.isoformat(),
                "state": game_state.model_dump(mode="json", by_alias=True),
            },
            session_id,
        )

    async def _enrich_agent_with_summaries(self, agent: Agent, event_data: EventData) -> None:
        """Generate short agent name and task summary using AI."""
        summary_service = get_summary_service()

        name_source = event_data.agent_name or event_data.task_description or ""
        task_source = event_data.task_description or event_data.agent_name or ""

        if name_source:
            agent.name = await summary_service.generate_agent_name(name_source)

        if task_source:
            agent.current_task = await summary_service.summarize_agent_task(task_source)

        logger.debug(f"Enriched agent {agent.id}: name='{agent.name}', task='{agent.current_task}'")

    async def _extract_and_set_boss_speech(
        self, sm: StateMachine, transcript_path: str | None
    ) -> None:
        """Extract Claude's response from transcript and set boss speech bubble."""
        if not transcript_path:
            return

        settings = get_settings()
        translated_path = settings.translate_path(transcript_path)

        response = get_last_assistant_response(translated_path)
        if not response:
            return

        # Generate a summary of the response
        summary_service = get_summary_service()
        summary = await summary_service.summarize_response(response)

        if summary:
            sm.boss_bubble = BubbleContent(
                type=BubbleType.SPEECH,
                text=summary,
                icon="💬",
                persistent=True,
            )
            logger.debug(f"Set boss speech: {summary[:50]}...")

    async def _detect_and_set_print_report(self, sm: StateMachine) -> None:
        """Detect if user's prompt requested a report and set print_report flag."""
        if not sm.last_user_prompt:
            return

        summary_service = get_summary_service()
        sm.print_report = await summary_service.detect_report_request(sm.last_user_prompt)
        if sm.print_report:
            logger.debug(f"Report request detected in prompt: {sm.last_user_prompt[:50]}...")

    async def _extract_and_set_agent_speech(
        self, sm: StateMachine, agent_id: str, transcript_path: str | None
    ) -> None:
        """Extract agent's response from transcript and set agent speech bubble."""
        if not transcript_path:
            return

        if agent_id not in sm.agents:
            return

        settings = get_settings()
        translated_path = settings.translate_path(transcript_path)

        response = get_last_assistant_response(translated_path)
        if not response:
            return

        summary_service = get_summary_service()
        summary = await summary_service.summarize_response(response)

        if summary:
            sm.agents[agent_id].bubble = BubbleContent(
                type=BubbleType.SPEECH,
                text=summary,
                icon="✅",
            )
            logger.debug(f"Set agent {agent_id} completion summary: {summary[:50]}...")

    def get_event_summary(self, event: Event) -> str:
        """Public wrapper for generating event summaries."""
        return self._get_event_summary(event)

    def _get_event_summary(self, event: Event) -> str:
        """Generate a human readable summary for the event log."""
        if not event.data:
            return f"{event.event_type} event received"

        data = event.data
        match event.event_type:
            case EventType.SESSION_START:
                return "Claude Office session started"
            case EventType.SESSION_END:
                return "Claude Office session ended"
            case EventType.PRE_TOOL_USE:
                tool = data.tool_name or "Unknown tool"
                target = ""
                if data.tool_input:
                    target = (
                        data.tool_input.get("file_path") or data.tool_input.get("command") or ""
                    )
                    if len(target) > 30:
                        target = f"...{target[-27:]}"
                return f"Using {tool} {target}".strip()
            case EventType.POST_TOOL_USE:
                return f"Completed {data.tool_name or 'tool'}"
            case EventType.USER_PROMPT_SUBMIT:
                prompt = data.prompt or ""
                if len(prompt) > 40:
                    prompt = f"{prompt[:37]}..."
                return f"User: {prompt}" if prompt else "User submitted prompt"
            case EventType.PERMISSION_REQUEST:
                tool = data.tool_name or "tool"
                return f"Waiting for permission: {tool}"
            case EventType.SUBAGENT_START:
                return f"Spawned subagent: {data.agent_name or data.agent_id}"
            case EventType.SUBAGENT_STOP:
                status = "successfully" if data.success else "with errors"
                return f"Subagent {data.agent_id} finished {status}"
            case EventType.STOP:
                return "Main agent task complete"
            case EventType.CLEANUP:
                return f"Agent {data.agent_id} left the building"
            case EventType.NOTIFICATION:
                return f"Notification: {data.message or data.notification_type or 'info'}"
            case EventType.REPORTING:
                return f"Agent {data.agent_id or 'unknown'} reporting"
            case EventType.WALKING_TO_DESK:
                return f"Agent {data.agent_id or 'unknown'} walking to desk"
            case EventType.WAITING:
                return f"Agent {data.agent_id or 'unknown'} waiting in queue"
            case EventType.LEAVING:
                return f"Agent {data.agent_id or 'unknown'} leaving"
            case EventType.ERROR:
                return f"Error: {data.message or 'unknown error'}"
            case _:
                return f"Event: {event.event_type}"


event_processor = EventProcessor()
