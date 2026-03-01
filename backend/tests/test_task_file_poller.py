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
            assert todos[0].task_id == "1"
            assert todos[0].content == "Test task"
            assert todos[0].status == TodoStatus.IN_PROGRESS
            assert todos[0].active_form == "Testing task"
            assert todos[0].description == "Test description"
            assert todos[0].blocks == []
            assert todos[0].blocked_by == []

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

    @pytest.mark.asyncio
    async def test_extracts_all_fields(self) -> None:
        """Test that all task fields are extracted correctly."""
        received_todos: list[tuple[str, list[TodoItem]]] = []

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            received_todos.append((session_id, todos))

        with tempfile.TemporaryDirectory() as tmpdir:
            task_dir = Path(tmpdir) / "test-session"
            task_dir.mkdir(parents=True)

            # Create a task with all fields
            task_file = task_dir / "1.json"
            task_data: dict[str, str | list[str] | dict[str, str]] = {
                "id": "1",
                "subject": "Full task",
                "description": "A detailed description",
                "activeForm": "Working on full task",
                "status": "in_progress",
                "blocks": ["2", "3"],
                "blockedBy": ["0"],
                "owner": "agent-123",
                "metadata": {"priority": "high", "custom_field": "value"},
            }
            task_file.write_text(json.dumps(task_data), encoding="utf-8")

            poller = TaskFilePoller(callback)
            poller._get_task_dir = lambda sid: Path(tmpdir) / sid  # type: ignore[method-assign]

            await poller.start_polling("test-session")
            await asyncio.sleep(0.1)
            await poller.stop_polling("test-session")

            assert len(received_todos) >= 1
            _, todos = received_todos[0]
            assert len(todos) == 1

            todo = todos[0]
            assert todo.task_id == "1"
            assert todo.content == "Full task"
            assert todo.description == "A detailed description"
            assert todo.active_form == "Working on full task"
            assert todo.status == TodoStatus.IN_PROGRESS
            assert todo.blocks == ["2", "3"]
            assert todo.blocked_by == ["0"]
            assert todo.owner == "agent-123"
            assert todo.metadata == {"priority": "high", "custom_field": "value"}

    @pytest.mark.asyncio
    async def test_uses_task_list_id_for_directory(self) -> None:
        """Test that task_list_id overrides session_id for the task directory."""
        received_todos: list[tuple[str, list[TodoItem]]] = []

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            received_todos.append((session_id, todos))

        with tempfile.TemporaryDirectory() as tmpdir:
            # Tasks stored under task_list_id dir, NOT session_id dir
            task_list_id = "my-shared-task-list"
            task_dir = Path(tmpdir) / task_list_id
            task_dir.mkdir(parents=True)

            task_file = task_dir / "1.json"
            task_data = {"id": "1", "subject": "Shared task", "status": "pending"}
            task_file.write_text(json.dumps(task_data), encoding="utf-8")

            poller = TaskFilePoller(callback)
            # Override _get_task_dir to use tmpdir as base
            poller._get_task_dir = lambda effective_id: Path(tmpdir) / effective_id  # type: ignore[method-assign]

            await poller.start_polling("session-abc", task_list_id=task_list_id)
            await asyncio.sleep(0.1)
            await poller.stop_polling("session-abc")

            # Should have read from task_list_id directory
            assert len(received_todos) >= 1
            session_id, todos = received_todos[0]
            assert session_id == "session-abc"
            assert len(todos) == 1
            assert todos[0].content == "Shared task"

    @pytest.mark.asyncio
    async def test_handles_missing_optional_fields(self) -> None:
        """Test that missing optional fields default correctly."""
        received_todos: list[tuple[str, list[TodoItem]]] = []

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            received_todos.append((session_id, todos))

        with tempfile.TemporaryDirectory() as tmpdir:
            task_dir = Path(tmpdir) / "test-session"
            task_dir.mkdir(parents=True)

            # Create a minimal task with only required fields
            task_file = task_dir / "1.json"
            task_data = {"id": "1", "subject": "Minimal task", "status": "pending"}
            task_file.write_text(json.dumps(task_data), encoding="utf-8")

            poller = TaskFilePoller(callback)
            poller._get_task_dir = lambda sid: Path(tmpdir) / sid  # type: ignore[method-assign]

            await poller.start_polling("test-session")
            await asyncio.sleep(0.1)
            await poller.stop_polling("test-session")

            assert len(received_todos) >= 1
            _, todos = received_todos[0]
            assert len(todos) == 1

            todo = todos[0]
            assert todo.task_id == "1"
            assert todo.content == "Minimal task"
            assert todo.description is None
            assert todo.active_form is None
            assert todo.status == TodoStatus.PENDING
            assert todo.blocks == []
            assert todo.blocked_by == []
            assert todo.owner is None
            assert todo.metadata is None
