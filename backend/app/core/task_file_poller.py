"""Poll task files from the new Claude Code task system.

Claude Code's newer task system stores tasks in:
    ~/.claude/tasks/{session_id}/*.json

Each task file contains:
    {
        "id": "1",
        "subject": "Task title",
        "description": "Detailed description",
        "activeForm": "Present continuous form for spinner",
        "status": "pending" | "in_progress" | "completed",
        "blocks": [],
        "blockedBy": []
    }

This module polls those files and converts them to TodoItem format for display.
"""

import asyncio
import contextlib
import json
import logging
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.models.common import TodoItem, TodoStatus

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 1.0
INACTIVITY_TIMEOUT = timedelta(minutes=30)
CLAUDE_TASKS_DIR = Path.home() / ".claude" / "tasks"


@dataclass
class TaskFileState:
    """Tracks state for a polled session's task directory."""

    session_id: str
    task_dir: Path
    last_modified: dict[str, float] = field(default_factory=lambda: {})
    last_activity: datetime = field(default_factory=lambda: datetime.now(UTC))
    poll_task: asyncio.Task[None] | None = None


class TaskFilePoller:
    """Polls task files for changes and converts them to TodoItems."""

    def __init__(
        self,
        todo_callback: Callable[[str, list[TodoItem]], Coroutine[Any, Any, None]],
    ) -> None:
        """Initialize the poller with a callback for todo updates.

        Args:
            todo_callback: Async function called with (session_id, todos) when tasks change
        """
        self._sessions: dict[str, TaskFileState] = {}
        self._lock = asyncio.Lock()
        self._todo_callback = todo_callback

    def _get_task_dir(self, session_id: str) -> Path:
        """Get the task directory path for a session."""
        settings = get_settings()
        base_dir = CLAUDE_TASKS_DIR

        # Handle path translation for Docker deployments
        if settings.CLAUDE_PATH_HOST and settings.CLAUDE_PATH_CONTAINER:
            # Translate ~/.claude to the container path
            host_claude = str(Path.home() / ".claude")
            if host_claude.startswith(settings.CLAUDE_PATH_HOST):
                container_claude = host_claude.replace(
                    settings.CLAUDE_PATH_HOST, settings.CLAUDE_PATH_CONTAINER, 1
                )
                base_dir = Path(container_claude) / "tasks"

        return base_dir / session_id

    async def start_polling(self, session_id: str) -> None:
        """Start polling task files for a session."""
        task_dir = self._get_task_dir(session_id)

        async with self._lock:
            if session_id in self._sessions:
                logger.debug(f"Already polling tasks for session {session_id}")
                return

            state = TaskFileState(
                session_id=session_id,
                task_dir=task_dir,
            )

            self._sessions[session_id] = state

            state.poll_task = asyncio.create_task(
                self._poll_loop(session_id), name=f"task_poll_{session_id}"
            )

            logger.info(f"Started task file polling for session {session_id} at {task_dir}")

    async def is_polling(self, session_id: str) -> bool:
        """Check if polling is active for a session."""
        async with self._lock:
            return session_id in self._sessions

    async def stop_polling(self, session_id: str) -> None:
        """Stop polling task files for a session."""
        async with self._lock:
            state = self._sessions.pop(session_id, None)
            if state and state.poll_task:
                state.poll_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await state.poll_task
                logger.info(f"Stopped task file polling for session {session_id}")

    async def stop_all(self) -> None:
        """Stop all polling tasks."""
        async with self._lock:
            for state in list(self._sessions.values()):
                if state.poll_task:
                    state.poll_task.cancel()
            self._sessions.clear()

    async def _poll_loop(self, session_id: str) -> None:
        """Background task that polls a session's task files."""
        try:
            # Initial read
            await self._check_for_changes(session_id)

            while True:
                async with self._lock:
                    state = self._sessions.get(session_id)
                    if not state:
                        return

                    # Check for inactivity timeout
                    if datetime.now(UTC) - state.last_activity > INACTIVITY_TIMEOUT:
                        logger.debug(f"Task polling for {session_id} timed out due to inactivity")
                        return

                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                await self._check_for_changes(session_id)

        except asyncio.CancelledError:
            logger.debug(f"Task poll loop for session {session_id} cancelled")
            raise
        except Exception as e:
            logger.exception(f"Error in task poll loop for session {session_id}: {e}")

    async def _check_for_changes(self, session_id: str) -> None:
        """Check for task file changes and notify if updated."""
        async with self._lock:
            state = self._sessions.get(session_id)
            if not state:
                return

        if not state.task_dir.exists():
            return

        try:
            # Get current task files
            task_files = list(state.task_dir.glob("*.json"))
            if not task_files:
                return

            # Check for modifications
            current_mtime: dict[str, float] = {}
            has_changes = False

            for task_file in task_files:
                file_key = task_file.name
                mtime = task_file.stat().st_mtime
                current_mtime[file_key] = mtime

                if file_key not in state.last_modified or state.last_modified[file_key] != mtime:
                    has_changes = True

            # Check for deleted files
            if set(state.last_modified.keys()) != set(current_mtime.keys()):
                has_changes = True

            if has_changes:
                state.last_modified = current_mtime
                state.last_activity = datetime.now(UTC)

                # Read all task files and convert to TodoItems
                todos = await self._read_task_files(task_files)

                # Notify callback
                try:
                    await self._todo_callback(session_id, todos)
                except Exception as e:
                    logger.warning(f"Error in task callback for {session_id}: {e}")

        except OSError as e:
            logger.warning(f"Error reading task files for {session_id}: {e}")

    async def _read_task_files(self, task_files: list[Path]) -> list[TodoItem]:
        """Read task files and convert to TodoItems."""
        todos: list[TodoItem] = []
        tasks: list[dict[str, Any]] = []

        for task_file in task_files:
            try:
                with open(task_file, encoding="utf-8") as f:
                    task_data = json.load(f)
                    tasks.append(task_data)
            except (json.JSONDecodeError, OSError) as e:
                logger.warning(f"Error reading task file {task_file}: {e}")
                continue

        # Sort by ID (numeric if possible)
        def sort_key(task: dict[str, Any]) -> tuple[int, str]:
            task_id = str(task.get("id", ""))
            try:
                return (0, str(int(task_id)).zfill(10))
            except ValueError:
                return (1, task_id)

        tasks.sort(key=sort_key)

        for task_data in tasks:
            todo = self._convert_task_to_todo(task_data)
            if todo:
                todos.append(todo)

        return todos

    def _convert_task_to_todo(self, task_data: dict[str, Any]) -> TodoItem | None:
        """Convert a task JSON object to a TodoItem."""
        subject = task_data.get("subject", "")
        if not subject:
            return None

        status_str = str(task_data.get("status", "pending"))
        try:
            status = TodoStatus(status_str)
        except ValueError:
            status = TodoStatus.PENDING

        active_form_raw = task_data.get("activeForm")
        active_form: str | None = str(active_form_raw) if active_form_raw else None

        return TodoItem(
            content=subject,
            status=status,
            active_form=active_form,
        )


_task_file_poller: TaskFilePoller | None = None


def get_task_file_poller() -> TaskFilePoller | None:
    """Get the singleton task file poller instance, or None if not initialized."""
    return _task_file_poller


def init_task_file_poller(
    todo_callback: Callable[[str, list[TodoItem]], Coroutine[Any, Any, None]],
) -> TaskFilePoller:
    """Initialize the singleton task file poller with a callback."""
    global _task_file_poller
    _task_file_poller = TaskFilePoller(todo_callback)
    return _task_file_poller
