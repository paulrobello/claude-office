"""EventProcessor: routes incoming hook events to focused handler modules.

This module is intentionally kept thin.  All substantive logic lives in the
sub-modules under ``app.core.handlers``.

Public surface (unchanged from before the refactor):
- ``EventProcessor`` class with the same methods and singleton ``event_processor``
- ``derive_git_root`` utility function
"""

import asyncio
import contextlib
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select

from app.config import get_settings
from app.core.beads_poller import get_beads_poller, has_beads, init_beads_poller
from app.core.broadcast_service import broadcast_error, broadcast_event, broadcast_state
from app.core.handlers import (
    enrich_agent_from_transcript,
    ensure_task_poller_running,
    handle_agent_update,
    handle_pre_tool_use,
    handle_session_end,
    handle_session_start,
    handle_stop,
    handle_subagent_info,
    handle_subagent_start,
    handle_subagent_stop,
    handle_user_prompt_submit,
)
from app.core.jsonl_parser import get_last_assistant_response
from app.core.project_registry import ProjectRegistry
from app.core.state_machine import StateMachine
from app.core.task_file_poller import init_task_file_poller
from app.core.task_persistence import load_tasks, save_tasks
from app.core.transcript_poller import init_transcript_poller
from app.db.database import AsyncSessionLocal
from app.db.models import EventRecord, SessionRecord
from app.models.agents import (
    Agent,
    AgentState,
    Boss,
    BossState,
    ElevatorState,
    OfficeState,
    PhoneState,
)
from app.models.common import TodoItem
from app.models.events import Event, EventData, EventType
from app.models.sessions import ConversationEntry, GameState, HistoryEntry
from app.services.git_service import git_service

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

        for parent in [path, *path.parents]:
            git_dir = parent / ".git"
            if git_dir.exists():
                return str(parent)

            if parent == parent.parent:
                break

    except (OSError, ValueError) as e:
        logger.warning(f"Error deriving git root from {working_dir}: {e}")

    return None


class EventProcessor:
    """Routes Claude Code hook events to focused handler modules.

    Maintains the in-memory session registry (``StateMachine`` per session)
    and orchestrates:
    - DB persistence
    - History entry building
    - Task-file and transcript poller lifecycle
    - Delegation to typed handler functions
    - WebSocket broadcasting
    """

    def __init__(self) -> None:
        self.sessions: dict[str, StateMachine] = {}
        self.project_registry = ProjectRegistry()
        self._sessions_lock = asyncio.Lock()
        self._transcript_poller_initialized = False
        self._task_poller_initialized = False
        self._beads_poller_initialized = False
        self._beads_sessions: set[str] = set()  # Sessions with active beads polling

    # ------------------------------------------------------------------
    # Poller lifecycle helpers
    # ------------------------------------------------------------------

    def _ensure_transcript_poller(self) -> None:
        """Initialise the transcript poller if not already done."""
        if not self._transcript_poller_initialized:
            init_transcript_poller(self._handle_polled_event)
            self._transcript_poller_initialized = True

    def _ensure_task_file_poller(self) -> None:
        """Initialise the task file poller if not already done."""
        if not self._task_poller_initialized:
            init_task_file_poller(self._handle_task_file_update)
            self._task_poller_initialized = True

    def _ensure_beads_poller(self) -> None:
        """Initialise the beads poller if not already done."""
        if not self._beads_poller_initialized:
            init_beads_poller(self._handle_beads_update)
            self._beads_poller_initialized = True

    # ------------------------------------------------------------------
    # Callbacks for pollers
    # ------------------------------------------------------------------

    async def _handle_task_file_update(self, session_id: str, todos: list[TodoItem]) -> None:
        """Handle task-file updates: update SM, persist to DB, broadcast."""
        sm = self.sessions.get(session_id)
        if not sm:
            return

        sm.todos = todos
        logger.debug(f"Updated todos for session {session_id}: {len(todos)} items")

        await save_tasks(session_id, todos)
        await broadcast_state(session_id, sm)

    async def _handle_beads_update(self, session_id: str, todos: list[TodoItem]) -> None:
        """Handle beads issue updates: update SM and broadcast."""
        sm = self.sessions.get(session_id)
        if not sm:
            return

        sm.todos = todos
        logger.debug(f"Updated beads todos for session {session_id}: {len(todos)} items")

        await save_tasks(session_id, todos)
        await broadcast_state(session_id, sm)

    async def _handle_polled_event(self, event: Event) -> None:
        """Handle events extracted from polled subagent transcripts."""
        logger.debug(
            f"Polled event: {event.event_type} agent={event.data.agent_id} "
            f"tool={event.data.tool_name}"
        )
        await self._process_event_internal(event)

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    async def remove_session(self, session_id: str) -> None:
        """Remove a session's in-memory state.

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
        """Retrieve current game state for a session, restoring from DB if needed."""
        if session_id not in self.sessions:
            await self._restore_session(session_id)

        sm = self.sessions.get(session_id)
        if sm:
            return sm.to_game_state(session_id)
        return None

    async def get_merged_state(self) -> GameState | None:
        """Build a merged GameState from all active sessions.

        Each session's boss becomes a regular agent (prefixed with session ID).
        All agent IDs are namespaced as "{session_short}:{agent_id}" to avoid collisions.
        The merged state uses a synthetic idle boss.
        """
        if not self.sessions:
            return None

        all_agents: list[Agent] = []
        all_arrival_queue: list[str] = []
        all_departure_queue: list[str] = []
        next_desk = 1  # Global compact desk counter
        latest_updated: datetime | None = None
        all_todos: list[TodoItem] = []
        all_conversation: list[ConversationEntry] = []
        active_session_ids: list[str] = []

        colors = [
            "#3B82F6", "#22C55E", "#A855F7", "#F97316",
            "#EC4899", "#06B6D4", "#EAB308", "#EF4444",
        ]

        for idx, (session_id, sm) in enumerate(self.sessions.items()):
            state = sm.to_game_state(session_id)
            short_id = session_id[:8]
            active_session_ids.append(session_id)

            # Map BossState to AgentState for the boss-as-agent
            boss_agent_state = AgentState.WORKING
            if state.boss.state in (BossState.IDLE,):
                boss_agent_state = AgentState.WAITING
            elif state.boss.state in (BossState.WAITING_PERMISSION,):
                boss_agent_state = AgentState.WAITING_PERMISSION

            # Convert this session's boss into a regular agent
            boss_as_agent = Agent(
                id=f"{short_id}:boss",
                name=state.boss.current_task or short_id,
                color=colors[idx % len(colors)],
                number=next_desk,
                state=boss_agent_state,
                desk=next_desk,
                current_task=state.boss.current_task,
                bubble=state.boss.bubble,
            )
            all_agents.append(boss_as_agent)
            next_desk += 1

            # Namespace all agents from this session with compact desk numbers
            for agent in state.agents:
                namespaced = agent.model_copy(update={
                    "id": f"{short_id}:{agent.id}",
                    "desk": next_desk,
                    "number": next_desk,
                })
                all_agents.append(namespaced)
                next_desk += 1

            # Only carry over agents that are actually arriving/departing
            arriving_agents = {a.id for a in state.agents if a.state == AgentState.ARRIVING}
            departing_agents = {a.id for a in state.agents if a.state == AgentState.COMPLETED}
            for aid in state.arrival_queue:
                if aid in arriving_agents:
                    all_arrival_queue.append(f"{short_id}:{aid}")
            for aid in state.departure_queue:
                if aid in departing_agents:
                    all_departure_queue.append(f"{short_id}:{aid}")

            if latest_updated is None or state.last_updated > latest_updated:
                latest_updated = state.last_updated

            all_todos.extend(state.todos)
            all_conversation.extend(state.conversation)

        # Synthetic boss for the merged view
        merged_boss = Boss(
            state=BossState.IDLE,
            current_task=f"{len(active_session_ids)} active sessions",
            bubble=None,
        )

        merged_office = OfficeState(
            desk_count=max(8, ((next_desk - 1 + 3) // 4) * 4),
            elevator_state=ElevatorState.CLOSED,
            phone_state=PhoneState.IDLE,
            context_utilization=0.0,
            tool_uses_since_compaction=0,
            print_report=False,
        )

        return GameState(
            session_id="__all__",
            boss=merged_boss,
            agents=all_agents,
            office=merged_office,
            last_updated=latest_updated or datetime.now(UTC),
            todos=all_todos,
            arrival_queue=all_arrival_queue,
            departure_queue=all_departure_queue,
            conversation=all_conversation,
        )

    async def get_project_grouped_state(self) -> "MultiProjectGameState | None":
        """Build a MultiProjectGameState grouped by project."""
        from app.models.projects import MultiProjectGameState, ProjectGroup

        if not self.sessions:
            return None

        # Group sessions by project
        project_sessions: dict[str, list[tuple[str, StateMachine]]] = {}
        for session_id, sm in self.sessions.items():
            project = self.project_registry.get_project_for_session(session_id)
            key = project.key if project else "unknown"
            if key not in project_sessions:
                project_sessions[key] = []
            project_sessions[key].append((session_id, sm))

        groups: list[ProjectGroup] = []
        latest_updated: datetime | None = None

        for key, sessions in project_sessions.items():
            project = self.project_registry.get_project(key)
            color = project.color if project else "#888888"
            name = project.name if project else "Unknown"
            root = project.root if project else None

            all_agents: list[Agent] = []
            desk_num = 1
            group_boss = Boss(state=BossState.IDLE)
            all_todos: list[TodoItem] = []

            for sid, sm in sessions:
                state = sm.to_game_state(sid)

                # First non-idle boss becomes the room boss
                if group_boss.state == BossState.IDLE and state.boss.state != BossState.IDLE:
                    group_boss = state.boss

                for agent in state.agents:
                    updated = agent.model_copy(update={
                        "project_key": key,
                        "session_id": sid,
                        "desk": desk_num,
                        "number": desk_num,
                    })
                    all_agents.append(updated)
                    desk_num += 1

                all_todos.extend(state.todos)

                if latest_updated is None or state.last_updated > latest_updated:
                    latest_updated = state.last_updated

            groups.append(ProjectGroup(
                key=key,
                name=name,
                color=color,
                root=root,
                agents=all_agents,
                boss=group_boss,
                session_count=len(sessions),
                todos=all_todos,
            ))

        return MultiProjectGameState(
            projects=groups,
            office=OfficeState(),
            last_updated=latest_updated or datetime.now(UTC),
        )

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

    # ------------------------------------------------------------------
    # Public event ingestion
    # ------------------------------------------------------------------

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
            with contextlib.suppress(Exception):
                await broadcast_error(
                    event.session_id,
                    f"Error processing {event.event_type}: {e!s}",
                    event.timestamp.isoformat(),
                )

    # ------------------------------------------------------------------
    # Internal routing
    # ------------------------------------------------------------------

    async def _process_event_internal(self, event: Event) -> None:
        """Persist, update state machine, build history entry, delegate to handlers."""
        await self._persist_event(event)

        if event.session_id not in self.sessions:
            await self._restore_session(event.session_id)

        if event.session_id not in self.sessions:
            self.sessions[event.session_id] = StateMachine()

        sm = self.sessions[event.session_id]

        sm.transition(event)

        agent_id = event.data.agent_id if event.data and event.data.agent_id else "main"

        # Build detail dict from event data fields for frontend inspection.
        detail: dict[str, Any] = {}
        if event.data:
            for src, dst in [
                ("tool_name", "toolName"),
                ("tool_input", "toolInput"),
                ("result_summary", "resultSummary"),
                ("message", "message"),
                ("thinking", "thinking"),
                ("error_type", "errorType"),
                ("task_description", "taskDescription"),
                ("agent_name", "agentName"),
                ("prompt", "prompt"),
            ]:
                val = getattr(event.data, src, None)
                if val is not None:
                    detail[dst] = val

        event_dict: HistoryEntry = {
            "id": str(event.timestamp.timestamp()),
            "type": str(event.event_type),
            "agentId": agent_id,
            "summary": self._get_event_summary(event),
            "timestamp": event.timestamp.isoformat(),
            "detail": detail,
        }
        sm.history.append(event_dict)
        if len(sm.history) > 500:
            sm.history = sm.history[-500:]

        # ------------------------------------------------------------------
        # SESSION_START – start task-file polling + beads polling
        # ------------------------------------------------------------------
        if event.event_type == EventType.SESSION_START:
            await handle_session_start(sm, event, self._ensure_task_file_poller)
            await self._start_beads_if_available(event.session_id)
            # Register session with project registry
            project_name = event.data.project_name if event.data else None
            project_root = await self.get_project_root(event.session_id)
            if project_name:
                self.project_registry.register_session(
                    event.session_id, project_name, project_root
                )
            # Configure git service immediately so polling starts without waiting
            # for a WebSocket reconnect (avoids race condition where WS connects
            # before the session_start event is persisted to the DB).
            if project_root:
                git_service.configure(
                    session_id=event.session_id,
                    project_root=project_root,
                )

        # ------------------------------------------------------------------
        # Auto-start task polling for missed SESSION_START (backend restart)
        # ------------------------------------------------------------------
        await ensure_task_poller_running(
            sm,
            event,
            self._ensure_task_file_poller,
            self._derive_task_list_id,
        )
        await self._start_beads_if_available(event.session_id)

        # ------------------------------------------------------------------
        # SESSION_END – stop task-file polling + beads polling
        # ------------------------------------------------------------------
        if event.event_type == EventType.SESSION_END:
            await handle_session_end(sm, event)
            self.project_registry.unregister_session(event.session_id)
            beads = get_beads_poller()
            if beads:
                await beads.stop_polling(event.session_id)
            self._beads_sessions.discard(event.session_id)

        # ------------------------------------------------------------------
        # Default state broadcast + history event notification
        # ------------------------------------------------------------------
        await broadcast_state(event.session_id, sm)
        await broadcast_event(event.session_id, event_dict)

        # ------------------------------------------------------------------
        # SUBAGENT_START
        # ------------------------------------------------------------------
        if event.event_type == EventType.SUBAGENT_START:
            await handle_subagent_start(
                sm,
                event,
                self._ensure_transcript_poller,
                self._update_agent_state,
            )

        # ------------------------------------------------------------------
        # SUBAGENT_INFO
        # ------------------------------------------------------------------
        if event.event_type == EventType.SUBAGENT_INFO:
            await handle_subagent_info(sm, event, self._ensure_transcript_poller)

        # ------------------------------------------------------------------
        # AGENT_UPDATE
        # ------------------------------------------------------------------
        if event.event_type == EventType.AGENT_UPDATE:
            await handle_agent_update(sm, event)

        # ------------------------------------------------------------------
        # SUBAGENT_STOP
        # ------------------------------------------------------------------
        if event.event_type == EventType.SUBAGENT_STOP:
            await handle_subagent_stop(sm, event, self._persist_synthetic_event)

        # ------------------------------------------------------------------
        # STOP
        # ------------------------------------------------------------------
        if event.event_type == EventType.STOP:
            await handle_stop(sm, event, agent_id)

        # ------------------------------------------------------------------
        # USER_PROMPT_SUBMIT
        # ------------------------------------------------------------------
        if event.event_type == EventType.USER_PROMPT_SUBMIT:
            await handle_user_prompt_submit(sm, event, agent_id)

        # ------------------------------------------------------------------
        # PRE_TOOL_USE
        # ------------------------------------------------------------------
        if event.event_type == EventType.PRE_TOOL_USE:
            await handle_pre_tool_use(sm, event, agent_id, self._get_event_summary(event))

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _persist_synthetic_event(
        self, session_id: str, event_type: EventType, data: EventData | dict[str, Any] | None
    ) -> None:
        """Save an intermediate lifecycle state to the DB for perfect replay."""
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
        """Reconstruct a StateMachine from DB events."""
        async with AsyncSessionLocal() as db:
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
                    evt = Event(
                        event_type=EventType(rec.event_type),
                        session_id=rec.session_id,
                        timestamp=rec.timestamp,
                        data=EventData.model_validate(rec.data) if rec.data else EventData(),
                    )
                    sm.transition(evt)

                    agent_id = evt.data.agent_id if evt.data and evt.data.agent_id else "main"
                    history_entry: HistoryEntry = {
                        "id": str(evt.timestamp.timestamp()),
                        "type": str(evt.event_type),
                        "agentId": agent_id,
                        "summary": self._get_event_summary(evt),
                        "timestamp": evt.timestamp.isoformat(),
                        "detail": {},
                    }
                    sm.history.append(history_entry)

                    # Rebuild conversation from stored events.
                    if (
                        evt.event_type == EventType.USER_PROMPT_SUBMIT
                        and evt.data
                        and evt.data.prompt
                        and "<task-notification>" not in evt.data.prompt
                    ):
                        conv_entry: ConversationEntry = {
                            "id": str(evt.timestamp.timestamp()),
                            "role": "user",
                            "agentId": agent_id,
                            "text": evt.data.prompt,
                            "timestamp": evt.timestamp.isoformat(),
                        }
                        sm.conversation.append(conv_entry)
                    elif evt.event_type == EventType.PRE_TOOL_USE and evt.data:
                        if evt.data.thinking:
                            thinking_entry: ConversationEntry = {
                                "id": f"{evt.timestamp.timestamp()}_thinking",
                                "role": "thinking",
                                "agentId": agent_id,
                                "text": evt.data.thinking,
                                "timestamp": evt.timestamp.isoformat(),
                            }
                            sm.conversation.append(thinking_entry)
                        if evt.data.tool_name:
                            tool_entry: ConversationEntry = {
                                "id": f"{evt.timestamp.timestamp()}_tool",
                                "role": "tool",
                                "agentId": agent_id,
                                "text": self._get_event_summary(evt),
                                "timestamp": evt.timestamp.isoformat(),
                                "toolName": evt.data.tool_name,
                            }
                            sm.conversation.append(tool_entry)
                    elif evt.event_type == EventType.STOP and evt.data and evt.data.transcript_path:
                        settings = get_settings()
                        translated_path = settings.translate_path(evt.data.transcript_path)
                        response = get_last_assistant_response(translated_path)
                        if response:
                            assistant_entry: ConversationEntry = {
                                "id": str(evt.timestamp.timestamp()),
                                "role": "assistant",
                                "agentId": agent_id,
                                "text": response,
                                "timestamp": evt.timestamp.isoformat(),
                            }
                            sm.conversation.append(assistant_entry)
                    elif (
                        evt.event_type == EventType.SUBAGENT_INFO
                        and evt.data
                        and evt.data.agent_transcript_path
                    ):
                        native_agent_id = evt.data.native_agent_id
                        transcript_path = evt.data.agent_transcript_path
                        for agent in sm.agents.values():
                            if agent.native_id == native_agent_id or agent.native_id is None:
                                if native_agent_id and agent.native_id is None:
                                    agent.native_id = native_agent_id
                                if (
                                    not agent.current_task
                                    or agent.current_task == "Resumed mid-session"
                                ):
                                    await enrich_agent_from_transcript(
                                        agent, transcript_path, evt.data.agent_type
                                    )
                                break
                except Exception as e:
                    skipped_count += 1
                    logger.warning(
                        f"Skipping malformed event {rec.id} (type={rec.event_type}): {e}"
                    )
                    continue

            if skipped_count > 0:
                logger.warning(f"Skipped {skipped_count} malformed events during restoration")

            if len(sm.history) > 500:
                sm.history = sm.history[-500:]

            sm.todos = await load_tasks(session_id)
            logger.debug(f"Restored {len(sm.todos)} tasks for session {session_id}")

            self.sessions[session_id] = sm

    async def _persist_event(self, event: Event) -> None:
        """Save event to database and manage session records.

        Uses ``session.merge()`` for dialect-agnostic upsert that avoids
        UNIQUE constraint race conditions when multiple events arrive
        concurrently for the same session.
        """
        async with AsyncSessionLocal() as db:
            project_name = event.data.project_name if event.data else None
            project_dir = event.data.project_dir if event.data else None
            working_dir = event.data.working_dir if event.data else None

            source_dir = project_dir or working_dir
            project_root = derive_git_root(source_dir) if source_dir else None

            # Check for existing session first.
            result = await db.execute(
                select(SessionRecord).where(SessionRecord.id == event.session_id)
            )
            session_rec = result.scalar_one_or_none()

            if session_rec is None:
                # First event for this session — create record with merge
                # to handle any concurrent insert race gracefully.
                now = datetime.now(UTC)
                session_rec = SessionRecord(
                    id=event.session_id,
                    project_name=project_name,
                    project_root=project_root,
                    status="active",
                    created_at=now,
                    updated_at=now,
                )
                session_rec = await db.merge(session_rec)

            # Update project info if not yet set.
            if project_name and not session_rec.project_name:
                session_rec.project_name = project_name
            if project_root and not session_rec.project_root:
                session_rec.project_root = project_root
                logger.info(f"Cached project_root for session {event.session_id}: {project_root}")

            if event.event_type == EventType.SESSION_START:
                await db.execute(
                    delete(EventRecord).where(EventRecord.session_id == event.session_id)
                )
                session_rec.status = "active"
                session_rec.updated_at = datetime.now(UTC)
                # SESSION_START always reflects the freshest metadata.
                if project_name:
                    session_rec.project_name = project_name
                if project_root:
                    session_rec.project_root = project_root
            elif event.event_type == EventType.SESSION_END:
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

    # ------------------------------------------------------------------
    # State update helpers
    # ------------------------------------------------------------------

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
            await broadcast_state(session_id, sm)

    async def _start_beads_if_available(self, session_id: str) -> None:
        """Start beads polling if the session's project has a .beads/ directory."""
        if session_id in self._beads_sessions:
            return
        project_root = await self.get_project_root(session_id)
        if not project_root:
            return
        if has_beads(project_root):
            self._ensure_beads_poller()
            beads = get_beads_poller()
            if beads and not await beads.is_polling(session_id):
                await beads.start_polling(session_id, project_root)
                self._beads_sessions.add(session_id)
        else:
            # Only log once per session to avoid spam
            self._beads_sessions.add(session_id)

    async def _derive_task_list_id(self, session_id: str) -> str | None:
        """Derive the task_list_id from the session's project root.

        Args:
            session_id: The session identifier.

        Returns:
            Named task folder identifier, or None.
        """
        from app.core.handlers.session_handler import (
            derive_task_list_id_from_root,
        )

        project_root = await self.get_project_root(session_id)
        result = derive_task_list_id_from_root(project_root)
        if result:
            logger.debug(f"Derived task_list_id '{result}' for session {session_id}")
        return result

    # ------------------------------------------------------------------
    # Event summary (used by replay endpoint and history building)
    # ------------------------------------------------------------------

    def get_event_summary(self, event: Event) -> str:
        """Public wrapper for generating event summaries."""
        return self._get_event_summary(event)

    def _get_event_summary(self, event: Event) -> str:
        """Generate a human-readable summary for the event log."""
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
            case EventType.BACKGROUND_TASK_NOTIFICATION:
                task_id = data.background_task_id or "unknown"
                status = data.background_task_status or "completed"
                summary = data.background_task_summary or ""
                task_id_short = task_id[:7] if len(task_id) > 7 else task_id
                summary_short = (summary[:40] + "...") if len(summary) > 40 else summary
                return f"Background task {task_id_short} {status}: {summary_short}"
            case _:
                return f"Event: {event.event_type}"


event_processor = EventProcessor()
