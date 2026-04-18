"""Handler for SESSION_START and SESSION_END events.

Responsible for:
- Starting / stopping task-file polling on session boundaries.
- Deriving the task-list identifier from the project root.
- Triggering state broadcasts after handling.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.core.broadcast_service import broadcast_state
from app.core.marker_file import MarkerFileReadError, marker_path_for_cwd, read_marker
from app.core.marker_watcher import get_marker_watcher
from app.core.run_aggregator import RunAggregator
from app.core.session_tagger import classify_session
from app.core.state_machine import StateMachine
from app.core.task_file_poller import get_task_file_poller
from app.models.events import Event, EventType

__all__ = [
    "handle_session_start",
    "handle_session_end",
    "ensure_task_poller_running",
]

logger = logging.getLogger(__name__)


async def handle_session_start(
    sm: StateMachine,
    event: Event,
    ensure_task_file_poller_fn: EnsurePollFn,
    run_aggregator: RunAggregator | None = None,
) -> None:
    """Handle a SESSION_START event.

    Starts task-file polling for the new session and optionally tags the
    session with Ralph run attribution if a RunAggregator is provided.

    Args:
        sm: The StateMachine for this session.
        event: The SESSION_START event.
        ensure_task_file_poller_fn: Callable that initialises the task-file
            poller if it has not been started yet.
        run_aggregator: Optional RunAggregator for Ralph run tracking.
    """
    ensure_task_file_poller_fn()
    task_poller = get_task_file_poller()
    if task_poller:
        task_list_id = event.data.task_list_id if event.data else None
        await task_poller.start_polling(event.session_id, task_list_id=task_list_id)

    if run_aggregator is not None and event.data is not None:
        await _tag_and_register_run_member(sm, event, run_aggregator)

    await broadcast_state(event.session_id, sm)


async def _tag_and_register_run_member(
    sm: StateMachine,
    event: Event,
    aggregator: RunAggregator,
) -> None:
    data = event.data
    cwd = Path(data.project_dir or data.working_dir or ".").resolve()

    env: dict[str, str] = {}
    if data.run_id:
        env["RALPH_RUN_ID"] = data.run_id
    if data.ralph_role:
        env["RALPH_ROLE"] = data.ralph_role
    if data.ralph_task_id:
        env["RALPH_TASK_ID"] = data.ralph_task_id

    try:
        marker = read_marker(marker_path_for_cwd(cwd))
    except ValueError as e:
        logger.warning("Rejected unsafe cwd %r in session_start: %s", cwd, e)
        marker = None
    except MarkerFileReadError as e:
        logger.debug("session_start marker read failed for %s: %s", cwd, e)
        marker = None

    tag = classify_session(session_id=event.session_id, cwd=cwd, env=env, marker=marker)
    if tag is None:
        return

    sm.run_id = tag.run_id
    sm.role = tag.role
    sm.task_id = tag.task_id

    if aggregator.get(tag.run_id) is None and marker is not None:
        aggregator.upsert_from_marker(marker)

    if marker is not None:
        mw = get_marker_watcher()
        if mw is not None:
            mw.register(cwd)

    aggregator.add_member(
        tag.run_id,
        session_id=event.session_id,
        role=tag.role,
        task_id=tag.task_id,
        is_orchestrator=tag.is_orchestrator,
    )


async def handle_session_end(
    sm: StateMachine,
    event: Event,
    run_aggregator: RunAggregator | None = None,
) -> None:
    """Handle a SESSION_END event.

    Stops task-file polling for the ending session and optionally removes
    the session from the Ralph run aggregator.

    Args:
        sm: The StateMachine for this session.
        event: The SESSION_END event.
        run_aggregator: Optional RunAggregator for Ralph run tracking.
    """
    task_poller = get_task_file_poller()
    if task_poller:
        await task_poller.stop_polling(event.session_id)

    if run_aggregator is not None:
        if sm.run_id:
            run_aggregator.remove_member(sm.run_id, session_id=event.session_id)
        run_aggregator.end_if_orchestrator_stopped(event.session_id)

    await broadcast_state(event.session_id, sm)


async def ensure_task_poller_running(
    sm: StateMachine,
    event: Event,
    ensure_task_file_poller_fn: EnsurePollFn,
    derive_task_list_id_fn: DeriveTaskListIdFn,
) -> None:
    """Auto-start task polling for sessions that missed SESSION_START.

    Called on any non-session-boundary event.  If polling is not yet active
    for this session, starts it now so mid-session backend restarts are
    handled gracefully.

    Args:
        sm: The StateMachine for this session (unused here, kept for symmetry).
        event: The current event being processed.
        ensure_task_file_poller_fn: Callable that initialises the poller.
        derive_task_list_id_fn: Async callable that derives the task list ID
            from the session's project root.
    """
    if event.event_type in (EventType.SESSION_START, EventType.SESSION_END):
        return

    ensure_task_file_poller_fn()
    task_poller = get_task_file_poller()
    if task_poller and not await task_poller.is_polling(event.session_id):
        task_list_id = event.data.task_list_id if event.data else None
        if not task_list_id:
            task_list_id = await derive_task_list_id_fn(event.session_id)
        await task_poller.start_polling(event.session_id, task_list_id=task_list_id)


def derive_task_list_id_from_root(project_root: str | None) -> str | None:
    """Derive a task_list_id from the project root path.

    Checks whether ``~/.claude/tasks/<project_name>/`` exists with JSON files,
    which happens when ``CLAUDE_CODE_TASK_LIST_ID`` is set to the project name.

    Args:
        project_root: Absolute path to the git project root, or None.

    Returns:
        The project name if a named task folder is found, otherwise None.
    """
    if not project_root:
        return None
    project_name = Path(project_root).name
    tasks_dir = Path.home() / ".claude" / "tasks" / project_name
    if tasks_dir.exists() and any(tasks_dir.glob("*.json")):
        logger.debug(f"Derived task_list_id '{project_name}' from project root {project_root}")
        return project_name
    return None


# ---------------------------------------------------------------------------
# Callback-type aliases used in type annotations above.
# These are defined here as strings (forward references) so that the module
# can be imported without importing the EventProcessor itself.
# ---------------------------------------------------------------------------

from collections.abc import Awaitable, Callable  # noqa: E402 – after __all__

EnsurePollFn = Callable[[], None]
DeriveTaskListIdFn = Callable[[str], Awaitable[str | None]]
