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
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.config import get_settings
from app.core.beads_poller import get_beads_poller, has_beads, init_beads_poller
from app.core.broadcast_service import (
    broadcast_error,
    broadcast_event,
    broadcast_overview_state,
    broadcast_room_state,
    broadcast_state,
)
from app.core.connection_manager import get_manager
from app.core.floor_config import get_cached_building_config
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
    handle_task_completed,
    handle_task_created,
    handle_teammate_idle,
    handle_user_prompt_submit,
)
from app.core.jsonl_parser import get_last_assistant_response
from app.core.product_mapper import get_product_mapper
from app.core.room_orchestrator import RoomOrchestrator
from app.core.state_machine import StateMachine
from app.core.task_file_poller import init_task_file_poller
from app.core.task_persistence import load_tasks, save_tasks
from app.core.transcript_poller import init_transcript_poller
from app.db.database import AsyncSessionLocal
from app.db.models import EventRecord, SessionRecord
from app.models.agents import AgentState
from app.models.common import TodoItem
from app.models.events import (
    AgentEvent,
    AnyEvent,
    BackgroundTaskEvent,
    EventAdapter,
    EventDataBase,
    EventType,
    LifecycleEvent,
    PromptEvent,
    SessionEvent,
    SessionEventData,
    TaskEvent,
    ToolEvent,
)
from app.models.overview import OverviewState
from app.models.sessions import ConversationEntry, GameState, HistoryEntry
from app.services.git_service import git_service

logger = logging.getLogger(__name__)

# Prefixes stripped from paths when deriving display names.
_DISPLAY_NAME_STRIP_PREFIXES = ("repos", "projects", "src", "work", "code", "github")

# Maximum number of history entries retained on a StateMachine. Keep in sync
# with backend StateMachine.MAX_CONVERSATION_ENTRIES (the conversation-entry
# cap) and frontend gameStore MAX_EVENT_LOG (the event-log cap) — those are
# already named; this names the third `sm.history` cap site.
MAX_HISTORY_ENTRIES = 500


def _todos_unchanged(old_todos: list[TodoItem], new_todos: list[TodoItem]) -> bool:
    """Return True if two todo lists are semantically identical.

    Avoids serializing and broadcasting when a poller re-reads the same file.
    Compares by length, then by content/status pairs.
    """
    if len(old_todos) != len(new_todos):
        return False
    return all(
        o.content == n.content and o.status == n.status
        for o, n in zip(old_todos, new_todos, strict=True)
    )


def derive_display_name(working_dir: str | None, project_name: str | None = None) -> str | None:
    """Derive a human-friendly display name from working directory or project name.

    Priority:
    1. ``project_name`` if provided
    2. Last non-generic path segment of ``working_dir``

    Args:
        working_dir: The working directory path.
        project_name: Explicit project name (takes priority).

    Returns:
        A display name string, or None if nothing useful could be derived.
    """
    if project_name:
        return project_name

    if not working_dir:
        return None

    try:
        path = Path(working_dir).resolve()
        # Walk from the deepest segment upward, skipping generic directory names.
        parts = path.parts
        for part in reversed(parts):
            lower = part.lower()
            if lower in _DISPLAY_NAME_STRIP_PREFIXES or lower.startswith("."):
                continue
            return part
    except (OSError, ValueError):
        pass

    return None


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
        """Initialize the EventProcessor with empty session and orchestrator registries."""
        self.sessions: dict[str, StateMachine] = {}
        self.orchestrators: dict[str, RoomOrchestrator] = {}
        self._sessions_lock = asyncio.Lock()
        self._transcript_poller_initialized = False
        self._task_poller_initialized = False
        self._beads_poller_initialized = False
        self._beads_sessions: set[str] = set()  # Sessions with active beads polling
        # Sessions whose session_start-presence has been checked for recovery
        # (see ``_process_event_internal``). Cleared whenever the DB is wiped
        # so wiped sessions are re-checked on their next event.
        self._recovery_checked: set[str] = set()
        # Coalesces Command Center overview broadcasts: bursts of events schedule
        # a single deferred flush instead of rebuilding the full peer-merge once
        # per event (O(N x events/sec)). See ``_schedule_overview_broadcast``.
        self._overview_flush_task: asyncio.Task[None] | None = None
        self._overview_flush_interval = 0.05  # 50 ms debounce window
        # Single source of truth for post-broadcast async enrichment.
        #
        # The sync mutation of every event type runs through
        # ``StateMachine._DISPATCH_TABLE`` (in state_machine.py) via
        # ``sm.transition(event)``. This table is its async counterpart: each
        # event type that needs *additional* async enrichment after the
        # state broadcast maps to exactly one ``_enrich_*`` method here.
        #
        # To add a new event type:
        #   1) add the member to ``EventType`` (models/events.py);
        #   2) add a sync handler to ``state_machine._DISPATCH_TABLE`` if it
        #      mutates session/agent state (needed by deterministic replay);
        #   3) add an ``_enrich_*`` entry here if it needs async enrichment
        #      (transcript reads, AI summaries, poller bootstrap, broadcasts).
        # All post-broadcast enrichment runs AFTER ``broadcast_state`` /
        # ``broadcast_event`` and BEFORE ``_schedule_overview_broadcast()``;
        # only one entry fires per event (events have a single type), so the
        # relative order of entries here is not behaviourally significant.
        self._post_broadcast_enrichers: dict[
            EventType, Callable[[StateMachine, AnyEvent, str], Awaitable[None]]
        ] = {
            EventType.SUBAGENT_START: self._enrich_subagent_start,
            EventType.SUBAGENT_INFO: self._enrich_subagent_info,
            EventType.AGENT_UPDATE: self._enrich_agent_update,
            EventType.SUBAGENT_STOP: self._enrich_subagent_stop,
            EventType.STOP: self._enrich_stop,
            EventType.USER_PROMPT_SUBMIT: self._enrich_user_prompt_submit,
            EventType.PRE_TOOL_USE: self._enrich_pre_tool_use,
            EventType.TASK_CREATED: self._enrich_task_created,
            EventType.TASK_COMPLETED: self._enrich_task_completed,
            EventType.TEAMMATE_IDLE: self._enrich_teammate_idle,
        }

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

        # Skip broadcast if todos haven't actually changed.
        old_todos = sm.todos
        if _todos_unchanged(old_todos, todos):
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

        # Skip broadcast if todos haven't actually changed.
        old_todos = sm.todos
        if _todos_unchanged(old_todos, todos):
            return

        sm.todos = todos
        logger.debug(f"Updated beads todos for session {session_id}: {len(todos)} items")

        await save_tasks(session_id, todos)
        await broadcast_state(session_id, sm)

    async def _handle_polled_event(self, event: AnyEvent) -> None:
        """Handle events extracted from polled subagent transcripts."""
        # tool_name is family-specific (ToolEvent); getattr keeps this log line
        # safe for non-tool polled events (AgentEvent thinking/text updates).
        tool_name = getattr(event.data, "tool_name", None)
        logger.debug(
            f"Polled event: {event.event_type} agent={event.data.agent_id} tool={tool_name}"
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
            sm = self.sessions.get(session_id)
            if sm and sm.room_id:
                orchestrator = self.orchestrators.get(sm.room_id)
                if orchestrator:
                    orchestrator.remove_session(session_id)
                    if orchestrator.is_empty:
                        del self.orchestrators[sm.room_id]
            self.sessions.pop(session_id, None)
        self._recovery_checked.discard(session_id)

    async def clear_all_sessions(self) -> None:
        """Clear all in-memory session state."""
        async with self._sessions_lock:
            self.sessions.clear()
        # A wiped DB no longer knows any session_start, so previously checked
        # sessions must be re-evaluated for recovery on their next event.
        self._recovery_checked.clear()

    async def evict_idle_sessions(self, max_idle_seconds: float) -> int:
        """Drop in-memory StateMachines idle longer than ``max_idle_seconds``.

        State is replayable from the DB on next access, so evicting a live
        session only costs a one-time replay when activity resumes (ARC-015).
        Sessions that still have WebSocket viewers are kept regardless of idle
        time — a reconnect restores from DB, but there is no reason to force
        that churn on an active viewer.
        """
        cutoff = datetime.now(UTC) - timedelta(seconds=max_idle_seconds)
        manager = get_manager()
        async with self._sessions_lock:
            stale = [
                sid
                for sid, sm in self.sessions.items()
                if sm.last_event_at < cutoff and not manager.active_connections.get(sid)
            ]
            for sid in stale:
                self.sessions.pop(sid, None)
        return len(stale)

    async def get_current_state(self, session_id: str) -> GameState | None:
        """Retrieve current game state for a session, restoring from DB if needed."""
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

    # ------------------------------------------------------------------
    # Public event ingestion
    # ------------------------------------------------------------------

    async def process_event(self, event: AnyEvent) -> None:
        """Process an incoming event and update session state.

        Delegates to :meth:`_process_event_internal` for the actual routing.
        Catches exceptions and broadcasts an error to connected clients so
        the frontend can display the failure.

        Args:
            event: The incoming hook event to process.
        """
        logger.info(
            f"Processing event: {event.event_type} "
            f"Session: {event.session_id} "
            f"Agent: {event.data.agent_id or 'N/A'}"
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
    # Post-broadcast async enrichment (one method per event type)
    #
    # Each ``_enrich_*`` method is a thin adapter with the uniform signature
    # ``(sm, event, agent_id) -> None`` so the dispatch table can call it
    # without per-type branching. The body is exactly the handler call the
    # corresponding ``if event.event_type == ...`` block used to make -- no
    # behaviour change, just table-driven routing. See
    # ``self._post_broadcast_enrichers`` for the single source of truth.
    # ------------------------------------------------------------------

    async def _enrich_subagent_start(
        self, sm: StateMachine, event: AnyEvent, agent_id: str
    ) -> None:
        assert isinstance(event, AgentEvent), "dispatch routes SUBAGENT_START only"
        await handle_subagent_start(
            sm,
            event,
            self._ensure_transcript_poller,
            self._update_agent_state,
        )

    async def _enrich_subagent_info(self, sm: StateMachine, event: AnyEvent, agent_id: str) -> None:
        assert isinstance(event, AgentEvent), "dispatch routes SUBAGENT_INFO only"
        await handle_subagent_info(sm, event, self._ensure_transcript_poller)

    async def _enrich_agent_update(self, sm: StateMachine, event: AnyEvent, agent_id: str) -> None:
        assert isinstance(event, AgentEvent), "dispatch routes AGENT_UPDATE only"
        await handle_agent_update(sm, event)

    async def _enrich_subagent_stop(self, sm: StateMachine, event: AnyEvent, agent_id: str) -> None:
        assert isinstance(event, AgentEvent), "dispatch routes SUBAGENT_STOP only"
        await handle_subagent_stop(sm, event, self._persist_synthetic_event)

    async def _enrich_stop(self, sm: StateMachine, event: AnyEvent, agent_id: str) -> None:
        assert isinstance(event, LifecycleEvent), "dispatch routes STOP only"
        await handle_stop(sm, event, agent_id)

    async def _enrich_user_prompt_submit(
        self, sm: StateMachine, event: AnyEvent, agent_id: str
    ) -> None:
        assert isinstance(event, PromptEvent), "dispatch routes USER_PROMPT_SUBMIT only"
        await handle_user_prompt_submit(sm, event, agent_id)

    async def _enrich_pre_tool_use(self, sm: StateMachine, event: AnyEvent, agent_id: str) -> None:
        assert isinstance(event, ToolEvent), "dispatch routes PRE_TOOL_USE only"
        await handle_pre_tool_use(sm, event, agent_id, self._get_event_summary(event))

    async def _enrich_task_created(self, sm: StateMachine, event: AnyEvent, agent_id: str) -> None:
        assert isinstance(event, TaskEvent), "dispatch routes TASK_CREATED only"
        await handle_task_created(sm, event)

    async def _enrich_task_completed(
        self, sm: StateMachine, event: AnyEvent, agent_id: str
    ) -> None:
        assert isinstance(event, TaskEvent), "dispatch routes TASK_COMPLETED only"
        await handle_task_completed(sm, event)

    async def _enrich_teammate_idle(self, sm: StateMachine, event: AnyEvent, agent_id: str) -> None:
        assert isinstance(event, LifecycleEvent), "dispatch routes TEAMMATE_IDLE only"
        await handle_teammate_idle(sm, event)

    # ------------------------------------------------------------------
    # Internal routing
    # ------------------------------------------------------------------

    async def _process_event_internal(self, event: AnyEvent) -> None:
        """Persist event, update state machine, build history, and delegate to handlers.

        This is the core processing pipeline:
        1. Resolve floor/room assignment from building config
        2. Persist the event to the database
        3. Restore or create the session StateMachine
        4. Run ``sm.transition(event)`` via the dispatch table
        5. Build a HistoryEntry and append to the session history
        6. Delegate to typed handler functions for enrichment
        7. Broadcast state updates to WebSocket clients

        Args:
            event: The incoming hook event.
        """
        # Recover sessions whose real session_start never reached the backend
        # (office started late, backend restarted with a wiped DB). The first
        # event of such a session gets a synthetic SESSION_START carrying
        # source="recovered", which ``_persist_event`` stores WITHOUT the
        # destructive history wipe a real session_start performs. OpenCode
        # child @agent sessions are excluded: they also start without a
        # session_start by design, so their producer tags them "opencode".
        if (
            event.event_type != EventType.SESSION_START
            and event.data.source not in ("recovered", "opencode")
            and not event.session_id.startswith("sim_")
            and event.session_id not in self._recovery_checked
        ):
            self._recovery_checked.add(event.session_id)
            if not await self._session_has_start_record(event.session_id):
                await self._process_event_internal(self._build_recovered_start(event))

        # Resolve floor/room assignment BEFORE persisting so the assignment
        # is written in the same DB session (avoids StaleDataError from a
        # separate _sync_room_to_db call).
        resolved_floor_id: str | None = None
        resolved_room_id: str | None = None
        building_config = get_cached_building_config()
        if building_config.floors:
            mapper = get_product_mapper(building_config)
            project_name = event.data.project_name
            project_dir = event.data.project_dir
            working_dir = event.data.working_dir
            assignment = mapper.resolve(
                project_name=project_name,
                project_dir=project_dir,
                working_dir=working_dir,
            )
            if assignment:
                resolved_floor_id = assignment.floor_id
                resolved_room_id = assignment.room_id

        await self._persist_event(event, resolved_floor_id, resolved_room_id)

        # Replay from DB *before* acquiring the lock: the restore is async I/O
        # that can take hundreds of ms for a long session, and holding the lock
        # across it stalls the debounced overview broadcast and /ws/overview
        # connects. Only the dict insertion below needs the lock.
        sm_preexisting = event.session_id in self.sessions
        restored: StateMachine | None = None
        if event.session_id not in self.sessions:
            restored = await self._build_restored_state_machine(event.session_id)

        async with self._sessions_lock:
            if event.session_id not in self.sessions:
                self.sessions[event.session_id] = (
                    restored if restored is not None else StateMachine()
                )

            # Capture the StateMachine reference while still holding the lock so a
            # concurrent clear_all_sessions()/remove_session() can't drop the key
            # between this lookup and use (which would raise KeyError).
            sm = self.sessions[event.session_id]
            # Refresh idle-eviction watermark (ARC-015) under the same lock so
            # ``evict_idle_sessions`` sees a consistent timestamp for this slot.
            sm.last_event_at = datetime.now(UTC)

        # A recovered session_start must not reset a live session's in-memory
        # state (upgrade scenario: the DB already knows the session, only the
        # event row was missing). Fresh/unknown sessions transition normally.
        if not (event.data.source == "recovered" and sm_preexisting):
            sm.transition(event)

        # Apply resolved floor/room to in-memory state machine.
        if resolved_floor_id:
            sm.floor_id = resolved_floor_id
            sm.room_id = resolved_room_id

        # Sync team fields from event data.
        if event.data.team_name is not None:
            sm.team_name = event.data.team_name
        if event.data.teammate_name is not None:
            sm.teammate_name = event.data.teammate_name
            sm.is_lead = False

        agent_id = event.data.agent_id or "main"

        # Build detail dict from event data fields for frontend inspection.
        # Family-specific fields are read via getattr because event.data is the
        # union of all payload classes; only the family matching event.event_type
        # actually carries each field.
        detail: dict[str, Any] = {}
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
        if len(sm.history) > MAX_HISTORY_ENTRIES:
            sm.history = sm.history[-MAX_HISTORY_ENTRIES:]

        # ------------------------------------------------------------------
        # SESSION_START – start task-file polling + beads polling
        # ------------------------------------------------------------------
        if event.event_type == EventType.SESSION_START:
            await handle_session_start(sm, event, self._ensure_task_file_poller)
            await self._start_beads_if_available(event.session_id)
            # Configure git service immediately so polling starts without waiting
            # for a WebSocket reconnect (avoids race condition where WS connects
            # before the session_start event is persisted to the DB).
            project_root = await self.get_project_root(event.session_id)
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
        # Room orchestrator broadcast (team sessions)
        # ------------------------------------------------------------------
        if sm.room_id:
            orchestrator = self.orchestrators.get(sm.room_id)
            if orchestrator is None:
                orchestrator = RoomOrchestrator(sm.room_id)
                self.orchestrators[sm.room_id] = orchestrator
            orchestrator.update_session(event.session_id, sm)
            await broadcast_room_state(sm.room_id, orchestrator)

        # ------------------------------------------------------------------
        # Post-broadcast async enrichment (single dispatch).
        #
        # Replaces ten sequential ``if event.event_type ==`` blocks. Each event
        # type maps to at most one ``_enrich_*`` method (see
        # ``self._post_broadcast_enrichers``), so exactly one fires per event.
        # The handlers themselves are unchanged -- this is purely table-driven
        # routing. Adding a new event type only requires a new table entry.
        # ------------------------------------------------------------------
        enricher = self._post_broadcast_enrichers.get(event.event_type)
        if enricher is not None:
            await enricher(sm, event, agent_id)

        # ------------------------------------------------------------------
        # Cross-session overview broadcast (Command Center). Scheduled LAST so
        # it reflects the field mutations applied by the event-type-specific
        # handlers above (e.g. boss_current_task, agents). Debounced so a burst
        # of events produces at most one broadcast per ~50 ms instead of one per
        # event. No-op when no one is watching /ws/overview.
        # ------------------------------------------------------------------
        self._schedule_overview_broadcast()

    # ------------------------------------------------------------------
    # Command Center overview (debounced cross-session broadcast)
    # ------------------------------------------------------------------

    def _schedule_overview_broadcast(self) -> None:
        """Coalesce overview broadcasts into one deferred flush per ~50 ms.

        Without watchers the build is skipped entirely (cheap no-op), so the
        early ``overview_connections`` guard is preserved. When a flush is
        already pending we let it run instead of stacking tasks: the pending
        flush rebuilds from ``self.sessions`` at fire time, so it always
        captures the final state of the burst (no dropped updates).
        """
        if not get_manager().overview_connections:
            return
        if self._overview_flush_task is not None and not self._overview_flush_task.done():
            return
        self._overview_flush_task = asyncio.create_task(self._flush_overview_broadcast())

    async def _flush_overview_broadcast(self) -> None:
        """Wait out the debounce window, then broadcast a single overview."""
        try:
            await asyncio.sleep(self._overview_flush_interval)
            await broadcast_overview_state(self.sessions, self._sessions_lock)
        except asyncio.CancelledError:  # pragma: no cover - shutdown path
            raise
        except Exception as e:
            logger.exception(f"Error broadcasting overview state: {e}")

    async def shutdown(self) -> None:
        """Cancel a pending debounced overview broadcast on app shutdown.

        Without this the flush task is left pending at loop close and asyncio
        logs "Task was destroyed but it is pending!".
        """
        task = self._overview_flush_task
        if task is not None and not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    async def build_overview_snapshot(self) -> OverviewState:
        """Build a cross-session overview under ``_sessions_lock``.

        Used by the ``/ws/overview`` connect path so the initial snapshot reads a
        consistent registry (no concurrent resize) without the caller touching
        the private lock directly.
        """
        from app.core.room_orchestrator import build_overview

        async with self._sessions_lock:
            return build_overview(self.sessions)

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _persist_synthetic_event(
        self, session_id: str, event_type: EventType, data: EventDataBase | dict[str, Any] | None
    ) -> None:
        """Save an intermediate lifecycle event to the DB for replay fidelity.

        Used to persist synthetic events like CLEANUP that are generated
        during processing rather than received from hooks.

        Args:
            session_id: The session the event belongs to.
            event_type: The type of event to persist.
            data: Event payload (family payload instance, raw dict, or None).
        """
        payload: dict[str, Any]
        if data is None:
            payload = {}
        elif isinstance(data, EventDataBase):
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

    async def _build_restored_state_machine(self, session_id: str) -> StateMachine | None:
        """Reconstruct a StateMachine from persisted DB events.

        Replays all events for the session through a fresh StateMachine,
        rebuilding agent state, conversation history, and task lists. Performs
        only async DB I/O against a locally-built machine, so it is safe to call
        without holding ``_sessions_lock``; the caller inserts the result under
        the lock. Returns ``None`` when the session has no persisted events.

        Args:
            session_id: The session to restore.
        """
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(EventRecord)
                .where(EventRecord.session_id == session_id)
                .order_by(EventRecord.timestamp.asc())
            )
            events = result.scalars().all()

            if not events:
                return None

            logger.info(f"Restoring session {session_id} from {len(events)} events in DB")

            sm = StateMachine()
            skipped_count = 0
            for rec in events:
                try:
                    try:
                        evt = EventAdapter.validate_python(
                            {
                                "event_type": EventType(rec.event_type),
                                "session_id": rec.session_id,
                                "timestamp": rec.timestamp,
                                "data": rec.data or {},
                            }
                        )
                    except ValidationError:
                        skipped_count += 1
                        logger.warning(
                            "Skipping unparseable event in restore (session=%s, type=%r)",
                            session_id,
                            rec.event_type,
                        )
                        continue
                    sm.transition(evt)

                    agent_id = evt.data.agent_id or "main"
                    history_entry: HistoryEntry = {
                        "id": str(evt.timestamp.timestamp()),
                        "type": str(evt.event_type),
                        "agentId": agent_id,
                        "summary": self._get_event_summary(evt),
                        "timestamp": evt.timestamp.isoformat(),
                        "detail": {},
                    }
                    sm.history.append(history_entry)

                    # Rebuild conversation from stored events. Each branch
                    # narrows evt to its family variant so family-specific
                    # fields (prompt, thinking, tool_name, ...) typecheck.
                    if evt.event_type == EventType.USER_PROMPT_SUBMIT:
                        assert isinstance(evt, PromptEvent)
                        if evt.data.prompt and "<task-notification>" not in evt.data.prompt:
                            conv_entry: ConversationEntry = {
                                "id": str(evt.timestamp.timestamp()),
                                "role": "user",
                                "agentId": agent_id,
                                "text": evt.data.prompt,
                                "timestamp": evt.timestamp.isoformat(),
                            }
                            sm.append_capped(conv_entry)
                    elif evt.event_type == EventType.PRE_TOOL_USE:
                        assert isinstance(evt, ToolEvent)
                        if evt.data.thinking:
                            thinking_entry: ConversationEntry = {
                                "id": f"{evt.timestamp.timestamp()}_thinking",
                                "role": "thinking",
                                "agentId": agent_id,
                                "text": evt.data.thinking,
                                "timestamp": evt.timestamp.isoformat(),
                            }
                            sm.append_capped(thinking_entry)
                        if evt.data.tool_name:
                            tool_entry: ConversationEntry = {
                                "id": f"{evt.timestamp.timestamp()}_tool",
                                "role": "tool",
                                "agentId": agent_id,
                                "text": self._get_event_summary(evt),
                                "timestamp": evt.timestamp.isoformat(),
                                "toolName": evt.data.tool_name,
                            }
                            sm.append_capped(tool_entry)
                    elif evt.event_type == EventType.STOP:
                        assert isinstance(evt, LifecycleEvent)
                        if evt.data.transcript_path:
                            settings = get_settings()
                            translated_path = settings.translate_path(evt.data.transcript_path)
                            response = await asyncio.to_thread(
                                get_last_assistant_response, translated_path
                            )
                            if response:
                                assistant_entry: ConversationEntry = {
                                    "id": str(evt.timestamp.timestamp()),
                                    "role": "assistant",
                                    "agentId": agent_id,
                                    "text": response,
                                    "timestamp": evt.timestamp.isoformat(),
                                }
                                sm.append_capped(assistant_entry)
                    elif evt.event_type == EventType.SUBAGENT_INFO:
                        assert isinstance(evt, AgentEvent)
                        if evt.data.agent_transcript_path:
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

            if len(sm.history) > MAX_HISTORY_ENTRIES:
                sm.history = sm.history[-MAX_HISTORY_ENTRIES:]

            sm.todos = await load_tasks(session_id)
            logger.debug(f"Restored {len(sm.todos)} tasks for session {session_id}")

            return sm

    async def _restore_session(self, session_id: str) -> None:
        """Reconstruct and insert a session's StateMachine, if it has events.

        Builds the machine (async DB I/O) without holding the lock, then inserts
        it under ``_sessions_lock`` so the registry stays consistent with
        readers such as ``build_overview``.
        """
        sm = await self._build_restored_state_machine(session_id)
        if sm is not None:
            async with self._sessions_lock:
                self.sessions[session_id] = sm

    async def _persist_event(
        self,
        event: AnyEvent,
        floor_id: str | None = None,
        room_id: str | None = None,
    ) -> None:
        """Save event to database and manage session records.

        Uses ``INSERT ... ON CONFLICT DO UPDATE`` for atomic upsert that
        avoids UNIQUE constraint race conditions when multiple events arrive
        concurrently for the same session, or when the session record has
        been deleted by a concurrent clear-DB operation.
        """
        async with AsyncSessionLocal() as db:
            project_name = event.data.project_name
            project_dir = event.data.project_dir
            working_dir = event.data.working_dir
            team_name = event.data.team_name
            teammate_name = event.data.teammate_name

            source_dir = project_dir or working_dir
            project_root = derive_git_root(source_dir) if source_dir else None

            # Derive display name from working dir / project name.
            display = derive_display_name(working_dir=source_dir, project_name=project_name)

            # Determine the final status based on event type.
            is_session_start = event.event_type == EventType.SESSION_START
            is_session_end = event.event_type == EventType.SESSION_END
            status = "active" if not is_session_end else "completed"
            now = datetime.now(UTC)

            # Atomic upsert: INSERT on new, UPDATE on conflict.
            # This prevents the race condition where two concurrent events
            # both SELECT (find no row) then both try to INSERT.
            stmt = sqlite_insert(SessionRecord).values(
                id=event.session_id,
                project_name=project_name,
                project_root=project_root,
                status=status,
                created_at=now,
                updated_at=now,
            )
            # On conflict (session already exists), only update the timestamp.
            # Other fields are conditionally updated below via the ORM object.
            stmt = stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={"updated_at": now},
            )
            await db.execute(stmt)

            # Fetch the persisted record for conditional field updates.
            result = await db.execute(
                select(SessionRecord).where(SessionRecord.id == event.session_id)
            )
            session_rec = result.scalar_one()

            # Persist floor/room assignment in the same session/transaction.
            if floor_id and room_id:
                session_rec.floor_id = floor_id
                session_rec.room_id = room_id

            # Update project info if not yet set on the existing record.
            if project_name and not session_rec.project_name:
                session_rec.project_name = project_name
            if project_root and not session_rec.project_root:
                session_rec.project_root = project_root
                logger.info(f"Cached project_root for session {event.session_id}: {project_root}")

            # Derive and store display_name on first encounter.
            if display and not session_rec.display_name:
                session_rec.display_name = display

            # Sync team fields to DB record.
            if team_name and not session_rec.team_name:
                session_rec.team_name = team_name
            if teammate_name and not session_rec.teammate_name:
                session_rec.teammate_name = teammate_name
            # A session with no teammate_name is the lead.
            if team_name and session_rec.is_lead is False and not session_rec.teammate_name:
                session_rec.is_lead = True

            if is_session_start:
                if event.data.source != "recovered":
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
                # Always set display_name on session start.
                if display:
                    session_rec.display_name = display
                # Reset team fields on session start.
                if team_name:
                    session_rec.team_name = team_name
                if teammate_name:
                    session_rec.teammate_name = teammate_name
                    session_rec.is_lead = False
                elif team_name:
                    session_rec.is_lead = True
            elif is_session_end:
                session_rec.status = "completed"
                session_rec.updated_at = datetime.now(UTC)

            event_rec = EventRecord(
                session_id=event.session_id,
                timestamp=event.timestamp,
                event_type=event.event_type,
                data=event.data.model_dump(),
            )
            db.add(event_rec)
            await db.commit()

    async def _session_has_start_record(self, session_id: str) -> bool:
        """Return True if the session has a session_start EventRecord."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(EventRecord.id)
                .where(
                    EventRecord.session_id == session_id,
                    EventRecord.event_type == EventType.SESSION_START.value,
                )
                .limit(1)
            )
            return result.first() is not None

    def _build_recovered_start(self, event: AnyEvent) -> SessionEvent:
        """Build a synthetic SESSION_START carrying over the event's session context."""
        context: dict[str, Any] = {
            name: value
            for name in EventDataBase.model_fields
            if (value := getattr(event.data, name, None)) is not None
        }
        context["source"] = "recovered"
        return SessionEvent(
            event_type=EventType.SESSION_START,
            session_id=event.session_id,
            data=SessionEventData(**context),
        )

    # ------------------------------------------------------------------
    # State update helpers
    # ------------------------------------------------------------------

    async def _update_agent_state(self, session_id: str, agent_id: str, state: AgentState) -> None:
        """Update an agent's state and broadcast the new state to clients.

        Args:
            session_id: The session containing the agent.
            agent_id: The agent to update.
            state: The new AgentState value.
        """
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
        """Start beads issue tracker polling if the project has a .beads/ directory.

        Checks the session's project root for a ``.beads/`` directory and
        initializes polling if found. Tracks which sessions have been checked
        to avoid repeated filesystem lookups.

        Args:
            session_id: The session to check and potentially start polling for.
        """
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

    def get_event_summary(self, event: AnyEvent) -> str:
        """Generate a human-readable summary for an event.

        Public wrapper around :meth:`_get_event_summary` for use by
        route handlers and other consumers outside the class.

        Args:
            event: The event to summarize.

        Returns:
            A one-line human-readable summary string.
        """
        return self._get_event_summary(event)

    def _get_event_summary(self, event: AnyEvent) -> str:
        """Generate a human-readable one-line summary for the event log.

        Dispatches on ``event.event_type`` to produce a contextual summary
        including tool names, agent IDs, task subjects, and truncated prompts.

        Args:
            event: The event to summarize.

        Returns:
            A human-readable summary string.
        """
        # `event.data` on the discriminated union is always present (required
        # field). Each case narrows `event` to its family variant via assert,
        # which also narrows `event.data` to the matching payload class so
        # family-specific fields (tool_name, prompt, task_id, ...) typecheck.
        match event.event_type:
            case EventType.SESSION_START:
                return "Claude Office session started"
            case EventType.SESSION_END:
                return "Claude Office session ended"
            case EventType.PRE_TOOL_USE:
                assert isinstance(event, ToolEvent)
                tool = event.data.tool_name or "Unknown tool"
                target = ""
                if event.data.tool_input:
                    target = (
                        event.data.tool_input.get("file_path")
                        or event.data.tool_input.get("command")
                        or ""
                    )
                    if len(target) > 30:
                        target = f"...{target[-27:]}"
                return f"Using {tool} {target}".strip()
            case EventType.POST_TOOL_USE:
                assert isinstance(event, ToolEvent)
                return f"Completed {event.data.tool_name or 'tool'}"
            case EventType.USER_PROMPT_SUBMIT:
                assert isinstance(event, PromptEvent)
                prompt = event.data.prompt or ""
                if len(prompt) > 40:
                    prompt = f"{prompt[:37]}..."
                return f"User: {prompt}" if prompt else "User submitted prompt"
            case EventType.PERMISSION_REQUEST:
                assert isinstance(event, ToolEvent)
                tool = event.data.tool_name or "tool"
                return f"Waiting for permission: {tool}"
            case EventType.SUBAGENT_START:
                assert isinstance(event, AgentEvent)
                return f"Spawned subagent: {event.data.agent_name or event.data.agent_id}"
            case EventType.SUBAGENT_STOP:
                assert isinstance(event, AgentEvent)
                # Native SubagentStop hook only sets native_agent_id; fall back to it,
                # and default success=True when neither agent_id nor explicit failure marker
                # is present (native hook fires on success).
                aid = event.data.agent_id or (
                    f"subagent_{event.data.native_agent_id}"
                    if event.data.native_agent_id
                    else "unknown"
                )
                status = (
                    "successfully"
                    if (event.data.success or event.data.success is None)
                    else "with errors"
                )
                return f"Subagent {aid} finished {status}"
            case EventType.STOP:
                return "Main agent task complete"
            case EventType.CLEANUP:
                assert isinstance(event, AgentEvent)
                return f"Agent {event.data.agent_id} left the building"
            case EventType.NOTIFICATION:
                assert isinstance(event, LifecycleEvent)
                return (
                    f"Notification: {event.data.message or event.data.notification_type or 'info'}"
                )
            case EventType.REPORTING:
                assert isinstance(event, LifecycleEvent)
                return f"Agent {event.data.agent_id or 'unknown'} reporting"
            case EventType.WALKING_TO_DESK:
                assert isinstance(event, LifecycleEvent)
                return f"Agent {event.data.agent_id or 'unknown'} walking to desk"
            case EventType.WAITING:
                assert isinstance(event, LifecycleEvent)
                return f"Agent {event.data.agent_id or 'unknown'} waiting in queue"
            case EventType.LEAVING:
                assert isinstance(event, LifecycleEvent)
                return f"Agent {event.data.agent_id or 'unknown'} leaving"
            case EventType.ERROR:
                assert isinstance(event, LifecycleEvent)
                return f"Error: {event.data.message or 'unknown error'}"
            case EventType.BACKGROUND_TASK_NOTIFICATION:
                assert isinstance(event, BackgroundTaskEvent)
                task_id = event.data.background_task_id or "unknown"
                status = event.data.background_task_status or "completed"
                summary = event.data.background_task_summary or ""
                task_id_short = task_id[:7] if len(task_id) > 7 else task_id
                summary_short = (summary[:40] + "...") if len(summary) > 40 else summary
                return f"Background task {task_id_short} {status}: {summary_short}"
            case EventType.TASK_CREATED:
                assert isinstance(event, TaskEvent)
                subject = event.data.task_subject or event.data.task_id or "unknown"
                if len(subject) > 50:
                    subject = f"{subject[:47]}..."
                return f"Task created: {subject}"
            case EventType.TASK_COMPLETED:
                assert isinstance(event, TaskEvent)
                subject = event.data.task_subject or event.data.task_id or "unknown"
                if len(subject) > 50:
                    subject = f"{subject[:47]}..."
                return f"Task completed: {subject}"
            case EventType.TEAMMATE_IDLE:
                assert isinstance(event, LifecycleEvent)
                name = event.data.teammate_name or "Teammate"
                return f"{name} went idle"
            case _:
                return f"Event: {event.event_type}"


event_processor = EventProcessor()


def get_event_processor() -> EventProcessor:
    """FastAPI-compatible dependency that returns the EventProcessor singleton.

    Use via ``Depends(get_event_processor)`` in route handlers for testability.
    Tests can call ``override_event_processor(instance)`` to inject a mock.
    """
    return event_processor


def override_event_processor(instance: EventProcessor) -> None:
    """Replace the module-level singleton with *instance* (for testing)."""
    global event_processor
    event_processor = instance
