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

Configuration:
    BEADS_POLL_INTERVAL: Polling interval in seconds (default: 3.0)
    Set via environment variable or app config.
"""

import asyncio
import contextlib
import hashlib
import json
import logging
import os
import subprocess
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

from app.models.common import TodoItem, TodoStatus

logger = logging.getLogger(__name__)

# Configurable via environment variable
DEFAULT_POLL_INTERVAL_SECONDS = 3.0
INACTIVITY_TIMEOUT = timedelta(minutes=60)


def _get_poll_interval() -> float:
    """Get polling interval from environment or use default."""
    try:
        val = os.environ.get("BEADS_POLL_INTERVAL", str(DEFAULT_POLL_INTERVAL_SECONDS))
        return float(val)
    except ValueError:
        return DEFAULT_POLL_INTERVAL_SECONDS


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


@dataclass
class BeadsQueryResult:
    """Result from running bd query."""

    issues: list[dict[str, Any]]
    error: str | None = None
    success: bool = True


def _run_bd_query(project_root: str) -> BeadsQueryResult:
    """Run `bd query` and return parsed JSON issues.

    Returns a BeadsQueryResult with issues on success, or error message on failure.
    """
    try:
        result = subprocess.run(
            ["bd", "query", "status=open OR status=in_progress OR status=blocked", "--json"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=project_root,
        )
        if result.returncode != 0:
            error_msg = result.stderr.strip()[:200] if result.stderr.strip() else "unknown error"
            return BeadsQueryResult(issues=[], error=f"bd query failed: {error_msg}", success=False)
        output = result.stdout.strip()
        if not output:
            return BeadsQueryResult(issues=[])
        data = json.loads(output)
        if isinstance(data, list):
            return BeadsQueryResult(issues=cast(list[dict[str, Any]], data))
        return BeadsQueryResult(issues=[])
    except subprocess.TimeoutExpired:
        return BeadsQueryResult(issues=[], error="bd query timed out", success=False)
    except json.JSONDecodeError as e:
        return BeadsQueryResult(issues=[], error=f"invalid JSON from bd query: {e}", success=False)
    except FileNotFoundError:
        return BeadsQueryResult(issues=[], error="bd CLI not found", success=False)
    except OSError as e:
        return BeadsQueryResult(issues=[], error=f"OS error running bd: {e}", success=False)


def _compute_issues_hash(issues: list[dict[str, Any]]) -> str:
    """Compute a stable hash of issue fields for change detection.

    Uses specific fields (id, title, status, owner) to avoid edge cases
    with JSON serialization of floats or nested structures.
    """
    if not issues:
        return ""

    # Extract stable fields and sort for consistent hashing
    hash_items: list[tuple[str, str, str, str]] = []
    for issue in issues:
        item = (
            str(issue.get("id", "")),
            str(issue.get("title", "")),
            str(issue.get("status", "open")),
            str(issue.get("owner", "")),
        )
        hash_items.append(item)

    # Sort by id for consistent ordering
    hash_items.sort(key=lambda x: x[0])

    # Create hash from concatenated fields
    content = "|".join("|".join(item) for item in hash_items)
    return hashlib.sha256(content.encode()).hexdigest()


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
    has_seen_success: bool = False  # Track if we've ever had a successful query


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
                await asyncio.sleep(_get_poll_interval())
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
        result = await loop.run_in_executor(None, _run_bd_query, state.project_root)

        # Handle errors with first-time WARNING
        if not result.success:
            if not state.has_seen_success:
                logger.warning(
                    f"Beads query failed for session {session_id}: {result.error} "
                    f"(subsequent failures will be logged at DEBUG level)"
                )
            else:
                logger.debug(f"Beads query failed for session {session_id}: {result.error}")
            return

        state.has_seen_success = True

        # Hash to detect changes using stable field-based hash
        issues_hash = _compute_issues_hash(result.issues)
        if issues_hash == state.last_hash:
            return

        state.last_hash = issues_hash
        state.last_activity = datetime.now(UTC)

        todos = [_convert_issue_to_todo(issue) for issue in result.issues if issue.get("title")]
        logger.debug(
            f"Beads update for {session_id}: {len(result.issues)} issues → {len(todos)} todos"
        )

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
