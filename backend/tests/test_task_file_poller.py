"""Tests for the task file poller module."""

import asyncio
import json
import tempfile
from pathlib import Path

import pytest

from app.core.task_file_poller import TaskFilePoller
from app.models.common import TodoItem, TodoStatus


class TestTaskFilePoller:
    """Tests for TaskFilePoller class."""

    @pytest.mark.asyncio
    async def test_start_and_stop_polling(self) -> None:
        """Test starting and stopping polling."""
        received_todos: list[tuple[str, list[TodoItem]]] = []

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            received_todos.append((session_id, todos))

        poller = TaskFilePoller(callback)

        # Start polling
        await poller.start_polling("test-session")
        assert await poller.is_polling("test-session")

        # Stop polling
        await poller.stop_polling("test-session")
        assert not await poller.is_polling("test-session")

    @pytest.mark.asyncio
    async def test_reads_task_files(self) -> None:
        """Test that task files are read and converted to TodoItems."""
        received_todos: list[tuple[str, list[TodoItem]]] = []

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            received_todos.append((session_id, todos))

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create task directory
            task_dir = Path(tmpdir) / "test-session"
            task_dir.mkdir(parents=True)

            # Create a task file
            task_file = task_dir / "1.json"
            task_data: dict[str, str | list[str]] = {
                "id": "1",
                "subject": "Test task",
                "description": "Test description",
                "activeForm": "Testing task",
                "status": "in_progress",
                "blocks": [],
                "blockedBy": [],
            }
            task_file.write_text(json.dumps(task_data), encoding="utf-8")

            # Create poller with custom task dir
            poller = TaskFilePoller(callback)
            # Override the task dir getter
            poller._get_task_dir = lambda sid: Path(tmpdir) / sid  # type: ignore[method-assign]

            await poller.start_polling("test-session")
            await asyncio.sleep(0.1)  # Wait for initial read

            await poller.stop_polling("test-session")

            # Check that todos were received
            assert len(received_todos) >= 1
            session_id, todos = received_todos[0]
            assert session_id == "test-session"
            assert len(todos) == 1
            assert todos[0].content == "Test task"
            assert todos[0].status == TodoStatus.IN_PROGRESS
            assert todos[0].active_form == "Testing task"

    @pytest.mark.asyncio
    async def test_sorts_tasks_by_id(self) -> None:
        """Test that tasks are sorted by numeric ID."""
        received_todos: list[tuple[str, list[TodoItem]]] = []

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            received_todos.append((session_id, todos))

        with tempfile.TemporaryDirectory() as tmpdir:
            task_dir = Path(tmpdir) / "test-session"
            task_dir.mkdir(parents=True)

            # Create tasks in non-numeric order
            for task_id, subject in [("3", "Third"), ("1", "First"), ("2", "Second")]:
                task_file = task_dir / f"{task_id}.json"
                task_data = {"id": task_id, "subject": subject, "status": "pending"}
                task_file.write_text(json.dumps(task_data), encoding="utf-8")

            poller = TaskFilePoller(callback)
            poller._get_task_dir = lambda sid: Path(tmpdir) / sid  # type: ignore[method-assign]

            await poller.start_polling("test-session")
            await asyncio.sleep(0.1)
            await poller.stop_polling("test-session")

            assert len(received_todos) >= 1
            _, todos = received_todos[0]
            assert [t.content for t in todos] == ["First", "Second", "Third"]

    @pytest.mark.asyncio
    async def test_handles_missing_directory(self) -> None:
        """Test that missing directory doesn't cause errors."""
        received_todos: list[tuple[str, list[TodoItem]]] = []

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            received_todos.append((session_id, todos))

        with tempfile.TemporaryDirectory() as tmpdir:
            # Don't create the task directory
            poller = TaskFilePoller(callback)
            poller._get_task_dir = lambda sid: Path(tmpdir) / sid  # type: ignore[method-assign]

            await poller.start_polling("test-session")
            await asyncio.sleep(0.1)
            await poller.stop_polling("test-session")

            # Should not have received any todos (directory doesn't exist)
            assert len(received_todos) == 0

    @pytest.mark.asyncio
    async def test_stop_all(self) -> None:
        """Test stopping all polling tasks."""

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            pass

        poller = TaskFilePoller(callback)

        await poller.start_polling("session-1")
        await poller.start_polling("session-2")

        assert await poller.is_polling("session-1")
        assert await poller.is_polling("session-2")

        await poller.stop_all()

        assert not await poller.is_polling("session-1")
        assert not await poller.is_polling("session-2")

    @pytest.mark.asyncio
    async def test_maps_status_values(self) -> None:
        """Test that status values are correctly mapped."""
        received_todos: list[tuple[str, list[TodoItem]]] = []

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            received_todos.append((session_id, todos))

        with tempfile.TemporaryDirectory() as tmpdir:
            task_dir = Path(tmpdir) / "test-session"
            task_dir.mkdir(parents=True)

            # Create tasks with different statuses
            statuses = [
                ("1", "pending"),
                ("2", "in_progress"),
                ("3", "completed"),
                ("4", "invalid_status"),  # Should default to pending
            ]
            for task_id, status in statuses:
                task_file = task_dir / f"{task_id}.json"
                task_data = {"id": task_id, "subject": f"Task {task_id}", "status": status}
                task_file.write_text(json.dumps(task_data), encoding="utf-8")

            poller = TaskFilePoller(callback)
            poller._get_task_dir = lambda sid: Path(tmpdir) / sid  # type: ignore[method-assign]

            await poller.start_polling("test-session")
            await asyncio.sleep(0.1)
            await poller.stop_polling("test-session")

            assert len(received_todos) >= 1
            _, todos = received_todos[0]
            assert len(todos) == 4
            assert todos[0].status == TodoStatus.PENDING
            assert todos[1].status == TodoStatus.IN_PROGRESS
            assert todos[2].status == TodoStatus.COMPLETED
            assert todos[3].status == TodoStatus.PENDING  # Invalid defaults to pending
