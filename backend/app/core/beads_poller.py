"""Poll beads issue tracker for task list updates.

When a session's project root contains a .beads/ directory, this poller
runs `bd query --json` periodically and converts issues to TodoItems
for display in the visualizer's task panel.

Beads status mapping:
    open         → pending
    in_progress  → in_progress
    blocked      → pending (with blocked_by populated)
    deferred     → pending
    closed       → completed
"""

import asyncio
import contextlib
import json
import logging
import subprocess
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.models.common import TodoItem, TodoStatus

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 3.0
INACTIVITY_TIMEOUT = timedelta(minutes=60)

_BEADS_STATUS_MAP: dict[str, TodoStatus] = {
    "open": TodoStatus.PENDING,
    "in_progress": TodoStatus.IN_PROGRESS,
    "blocked": TodoStatus.PENDING,
    "deferred": TodoStatus.PENDING,
    "closed": TodoStatus.COMPLETED,
}


def has_beads(project_root: str | None) -> bool:
    """Check if a project root contains a beads database."""
    if not project_root:
        return False
    return (Path(project_root) / ".beads").is_dir()


def _run_bd_query(project_root: str) -> list[dict[str, Any]]:
    """Run `bd query` and return parsed JSON issues."""
    try:
        result = subprocess.run(
            ["bd", "query", "status=open OR status=in_progress OR status=blocked", "--json"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=project_root,
        )
        if result.returncode != 0:
            if result.stderr.strip():
                logger.debug(f"bd query stderr: {result.stderr.strip()[:200]}")
            return []
        output = result.stdout.strip()
        if not output:
            return []
        data = json.loads(output)
        if isinstance(data, list):
            return data
        return []
    except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError, OSError) as e:
        logger.debug(f"beads query failed: {e}")
        return []


def _convert_issue_to_todo(issue: dict[str, Any]) -> TodoItem:
    """Convert a beads issue JSON object to a TodoItem."""
    status_str = str(issue.get("status", "open"))
    status = _BEADS_STATUS_MAP.get(status_str, TodoStatus.PENDING)

    priority = issue.get("priority")
    issue_type = issue.get("issue_type")
    metadata: dict[str, Any] = {}
    if priority is not None:
        metadata["priority"] = priority
    if issue_type:
        metadata["issue_type"] = issue_type

    return TodoItem(
        task_id=str(issue.get("id", "")),
        content=str(issue.get("title", "")),
        status=status,
        description=issue.get("description"),
        owner=issue.get("owner"),
        metadata=metadata or None,
    )


@dataclass
class BeadsState:
    """Tracks state for a polled session's beads database."""

    session_id: str
    project_root: str
    last_hash: str = ""
    last_activity: datetime = field(default_factory=lambda: datetime.now(UTC))
    poll_task: asyncio.Task[None] | None = None


class BeadsPoller:
    """Polls beads issue tracker and converts issues to TodoItems."""

    def __init__(
        self,
        todo_callback: Callable[[str, list[TodoItem]], Coroutine[Any, Any, None]],
    ) -> None:
        self._sessions: dict[str, BeadsState] = {}
        self._lock = asyncio.Lock()
        self._todo_callback = todo_callback

    async def start_polling(self, session_id: str, project_root: str) -> None:
        """Start polling beads for a session."""
        async with self._lock:
            if session_id in self._sessions:
                return

            state = BeadsState(session_id=session_id, project_root=project_root)
            self._sessions[session_id] = state
            state.poll_task = asyncio.create_task(
                self._poll_loop(session_id), name=f"beads_poll_{session_id}"
            )
            logger.info(f"Started beads polling for session {session_id} at {project_root}")

    async def is_polling(self, session_id: str) -> bool:
        async with self._lock:
            return session_id in self._sessions

    async def stop_polling(self, session_id: str) -> None:
        async with self._lock:
            state = self._sessions.pop(session_id, None)
            if state and state.poll_task:
                state.poll_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await state.poll_task
                logger.info(f"Stopped beads polling for session {session_id}")

    async def stop_all(self) -> None:
        async with self._lock:
            for state in list(self._sessions.values()):
                if state.poll_task:
                    state.poll_task.cancel()
            self._sessions.clear()

    async def _poll_loop(self, session_id: str) -> None:
        try:
            await self._check_for_changes(session_id)
            while True:
                async with self._lock:
                    state = self._sessions.get(session_id)
                    if not state:
                        return
                    if datetime.now(UTC) - state.last_activity > INACTIVITY_TIMEOUT:
                        logger.debug(f"Beads polling for {session_id} timed out")
                        return
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                await self._check_for_changes(session_id)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.exception(f"Error in beads poll loop for {session_id}: {e}")

    async def _check_for_changes(self, session_id: str) -> None:
        async with self._lock:
            state = self._sessions.get(session_id)
            if not state:
                return

        # Run bd query in a thread to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        issues = await loop.run_in_executor(None, _run_bd_query, state.project_root)

        # Hash to detect changes
        issues_hash = json.dumps(issues, sort_keys=True)
        if issues_hash == state.last_hash:
            return

        state.last_hash = issues_hash
        state.last_activity = datetime.now(UTC)

        todos = [_convert_issue_to_todo(issue) for issue in issues if issue.get("title")]
        logger.debug(f"Beads update for {session_id}: {len(issues)} issues → {len(todos)} todos")

        try:
            await self._todo_callback(session_id, todos)
        except Exception as e:
            logger.warning(f"Error in beads callback for {session_id}: {e}")


_beads_poller: BeadsPoller | None = None


def get_beads_poller() -> BeadsPoller | None:
    return _beads_poller


def init_beads_poller(
    todo_callback: Callable[[str, list[TodoItem]], Coroutine[Any, Any, None]],
) -> BeadsPoller:
    global _beads_poller
    _beads_poller = BeadsPoller(todo_callback)
    return _beads_poller
