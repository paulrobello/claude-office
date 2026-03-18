"""Tests for the beads poller module."""

import asyncio
import tempfile
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

from app.core.beads_poller import (
    BeadsPoller,
    BeadsQueryResult,
    _compute_issues_hash,  # pyright: ignore[reportPrivateUsage]
    _convert_issue_to_todo,  # pyright: ignore[reportPrivateUsage]
    _get_poll_interval,  # pyright: ignore[reportPrivateUsage]
    has_beads,
)
from app.models.common import TodoItem, TodoStatus


class TestHasBeads:
    """Tests for has_beads function."""

    def test_returns_true_when_beads_dir_exists(self) -> None:
        """Test that has_beads returns True when .beads/ directory exists."""
        with tempfile.TemporaryDirectory() as tmpdir:
            beads_dir = Path(tmpdir) / ".beads"
            beads_dir.mkdir()
            assert has_beads(tmpdir) is True

    def test_returns_false_when_beads_dir_missing(self) -> None:
        """Test that has_beads returns False when .beads/ directory doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            assert has_beads(tmpdir) is False

    def test_returns_false_for_none_input(self) -> None:
        """Test that has_beads returns False for None input."""
        assert has_beads(None) is False

    def test_returns_false_for_empty_string(self) -> None:
        """Test that has_beads returns False for empty string."""
        assert has_beads("") is False

    def test_returns_false_for_nonexistent_path(self) -> None:
        """Test that has_beads returns False for nonexistent path."""
        assert has_beads("/nonexistent/path/12345") is False


class TestConvertIssueToTodo:
    """Tests for _convert_issue_to_todo function."""

    def test_converts_basic_issue(self) -> None:
        """Test conversion of a basic issue."""
        issue = {"id": "123", "title": "Test Issue", "status": "open"}
        todo = _convert_issue_to_todo(issue)

        assert todo.task_id == "123"
        assert todo.content == "Test Issue"
        assert todo.status == TodoStatus.PENDING

    def test_maps_status_open_to_pending(self) -> None:
        """Test that 'open' status maps to PENDING."""
        issue = {"id": "1", "title": "Issue", "status": "open"}
        todo = _convert_issue_to_todo(issue)
        assert todo.status == TodoStatus.PENDING

    def test_maps_status_in_progress_to_in_progress(self) -> None:
        """Test that 'in_progress' status maps to IN_PROGRESS."""
        issue = {"id": "1", "title": "Issue", "status": "in_progress"}
        todo = _convert_issue_to_todo(issue)
        assert todo.status == TodoStatus.IN_PROGRESS

    def test_maps_status_blocked_to_pending(self) -> None:
        """Test that 'blocked' status maps to PENDING."""
        issue = {"id": "1", "title": "Issue", "status": "blocked"}
        todo = _convert_issue_to_todo(issue)
        assert todo.status == TodoStatus.PENDING

    def test_maps_status_deferred_to_pending(self) -> None:
        """Test that 'deferred' status maps to PENDING."""
        issue = {"id": "1", "title": "Issue", "status": "deferred"}
        todo = _convert_issue_to_todo(issue)
        assert todo.status == TodoStatus.PENDING

    def test_maps_status_closed_to_completed(self) -> None:
        """Test that 'closed' status maps to COMPLETED."""
        issue = {"id": "1", "title": "Issue", "status": "closed"}
        todo = _convert_issue_to_todo(issue)
        assert todo.status == TodoStatus.COMPLETED

    def test_defaults_to_pending_for_unknown_status(self) -> None:
        """Test that unknown status defaults to PENDING."""
        issue = {"id": "1", "title": "Issue", "status": "unknown_status"}
        todo = _convert_issue_to_todo(issue)
        assert todo.status == TodoStatus.PENDING

    def test_extracts_owner(self) -> None:
        """Test that owner is extracted."""
        issue = {"id": "1", "title": "Issue", "status": "open", "owner": "agent-123"}
        todo = _convert_issue_to_todo(issue)
        assert todo.owner == "agent-123"

    def test_extracts_description(self) -> None:
        """Test that description is extracted."""
        issue = {
            "id": "1",
            "title": "Issue",
            "status": "open",
            "description": "A detailed description",
        }
        todo = _convert_issue_to_todo(issue)
        assert todo.description == "A detailed description"

    def test_extracts_priority_metadata(self) -> None:
        """Test that priority is stored in metadata."""
        issue = {"id": "1", "title": "Issue", "status": "open", "priority": "high"}
        todo = _convert_issue_to_todo(issue)
        assert todo.metadata == {"priority": "high"}

    def test_extracts_issue_type_metadata(self) -> None:
        """Test that issue_type is stored in metadata."""
        issue = {"id": "1", "title": "Issue", "status": "open", "issue_type": "bug"}
        todo = _convert_issue_to_todo(issue)
        assert todo.metadata == {"issue_type": "bug"}

    def test_extracts_both_metadata_fields(self) -> None:
        """Test that both priority and issue_type are stored in metadata."""
        issue = {
            "id": "1",
            "title": "Issue",
            "status": "open",
            "priority": "high",
            "issue_type": "bug",
        }
        todo = _convert_issue_to_todo(issue)
        assert todo.metadata == {"priority": "high", "issue_type": "bug"}

    def test_handles_missing_fields(self) -> None:
        """Test that missing fields default correctly."""
        issue: dict[str, Any] = {}
        todo = _convert_issue_to_todo(issue)

        assert todo.task_id == ""
        assert todo.content == ""
        assert todo.status == TodoStatus.PENDING
        assert todo.owner is None
        assert todo.description is None
        assert todo.metadata is None


class TestComputeIssuesHash:
    """Tests for _compute_issues_hash function."""

    def test_returns_empty_string_for_empty_list(self) -> None:
        """Test that empty list returns empty string."""
        assert _compute_issues_hash([]) == ""

    def test_produces_consistent_hash(self) -> None:
        """Test that same issues produce same hash."""
        issues = [{"id": "1", "title": "Test", "status": "open", "owner": "agent"}]
        hash1 = _compute_issues_hash(issues)
        hash2 = _compute_issues_hash(issues)
        assert hash1 == hash2

    def test_order_independent(self) -> None:
        """Test that hash is independent of issue order."""
        issues1 = [
            {"id": "1", "title": "First", "status": "open", "owner": "a"},
            {"id": "2", "title": "Second", "status": "in_progress", "owner": "b"},
        ]
        issues2 = [
            {"id": "2", "title": "Second", "status": "in_progress", "owner": "b"},
            {"id": "1", "title": "First", "status": "open", "owner": "a"},
        ]
        assert _compute_issues_hash(issues1) == _compute_issues_hash(issues2)

    def test_different_content_produces_different_hash(self) -> None:
        """Test that different content produces different hash."""
        issues1 = [{"id": "1", "title": "First", "status": "open", "owner": "a"}]
        issues2 = [{"id": "1", "title": "Changed", "status": "open", "owner": "a"}]
        assert _compute_issues_hash(issues1) != _compute_issues_hash(issues2)

    def test_different_status_produces_different_hash(self) -> None:
        """Test that status change produces different hash."""
        issues1 = [{"id": "1", "title": "Test", "status": "open", "owner": "a"}]
        issues2 = [{"id": "1", "title": "Test", "status": "in_progress", "owner": "a"}]
        assert _compute_issues_hash(issues1) != _compute_issues_hash(issues2)

    def test_ignores_extra_fields(self) -> None:
        """Test that extra fields not used in hash are ignored."""
        issues1 = [{"id": "1", "title": "Test", "status": "open", "owner": "a"}]
        issues2 = [
            {
                "id": "1",
                "title": "Test",
                "status": "open",
                "owner": "a",
                "extra_field": "ignored",
            }
        ]
        assert _compute_issues_hash(issues1) == _compute_issues_hash(issues2)

    def test_handles_missing_fields(self) -> None:
        """Test that missing fields are handled gracefully."""
        issues = [{"id": "1"}]  # Missing title, status, owner
        hash_val = _compute_issues_hash(issues)
        assert isinstance(hash_val, str)
        assert len(hash_val) == 64  # SHA-256 produces 64 hex chars


class TestGetPollInterval:
    """Tests for _get_poll_interval function."""

    def test_returns_default_when_not_set(self) -> None:
        """Test that default interval is returned when env var not set."""
        with patch.dict("os.environ", {}, clear=True):
            # Remove BEADS_POLL_INTERVAL if present
            if "BEADS_POLL_INTERVAL" in __import__("os").environ:
                del __import__("os").environ["BEADS_POLL_INTERVAL"]
            interval = _get_poll_interval()
            assert interval == 3.0

    def test_returns_custom_value(self) -> None:
        """Test that custom interval is returned from env var."""
        with patch.dict("os.environ", {"BEADS_POLL_INTERVAL": "5.0"}):
            interval = _get_poll_interval()
            assert interval == 5.0

    def test_handles_invalid_value(self) -> None:
        """Test that invalid value falls back to default."""
        with patch.dict("os.environ", {"BEADS_POLL_INTERVAL": "invalid"}):
            interval = _get_poll_interval()
            assert interval == 3.0


class TestBeadsPoller:
    """Tests for BeadsPoller class."""

    @pytest.mark.asyncio
    async def test_start_and_stop_polling(self) -> None:
        """Test starting and stopping polling."""
        received_todos: list[tuple[str, list[TodoItem]]] = []

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            received_todos.append((session_id, todos))

        with tempfile.TemporaryDirectory() as tmpdir:
            poller = BeadsPoller(callback)

            # Start polling
            await poller.start_polling("test-session", tmpdir)
            assert await poller.is_polling("test-session")

            # Stop polling
            await poller.stop_polling("test-session")
            assert not await poller.is_polling("test-session")

    @pytest.mark.asyncio
    async def test_stop_all(self) -> None:
        """Test stopping all polling tasks."""

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            pass

        with tempfile.TemporaryDirectory() as tmpdir:
            poller = BeadsPoller(callback)

            await poller.start_polling("session-1", tmpdir)
            await poller.start_polling("session-2", tmpdir)

            assert await poller.is_polling("session-1")
            assert await poller.is_polling("session-2")

            await poller.stop_all()

            assert not await poller.is_polling("session-1")
            assert not await poller.is_polling("session-2")

    @pytest.mark.asyncio
    async def test_does_not_duplicate_polling(self) -> None:
        """Test that starting polling twice doesn't create duplicate tasks."""

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            pass

        with tempfile.TemporaryDirectory() as tmpdir:
            poller = BeadsPoller(callback)

            await poller.start_polling("test-session", tmpdir)
            await poller.start_polling("test-session", tmpdir)  # Second call should be no-op

            assert await poller.is_polling("test-session")

            await poller.stop_polling("test-session")

    @pytest.mark.asyncio
    async def test_calls_callback_on_successful_query(self) -> None:
        """Test that callback is called with converted todos."""
        received_todos: list[tuple[str, list[TodoItem]]] = []

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            received_todos.append((session_id, todos))

        mock_issues = [
            {"id": "1", "title": "Test Issue", "status": "open"},
            {"id": "2", "title": "In Progress", "status": "in_progress"},
        ]

        mock_result = BeadsQueryResult(issues=mock_issues, success=True)

        with tempfile.TemporaryDirectory() as tmpdir:
            poller = BeadsPoller(callback)

            with patch("app.core.beads_poller._run_bd_query", return_value=mock_result):
                await poller.start_polling("test-session", tmpdir)
                await asyncio.sleep(0.1)  # Wait for initial poll
                await poller.stop_polling("test-session")

            assert len(received_todos) >= 1
            session_id, todos = received_todos[0]
            assert session_id == "test-session"
            assert len(todos) == 2
            assert todos[0].content == "Test Issue"
            assert todos[0].status == TodoStatus.PENDING
            assert todos[1].content == "In Progress"
            assert todos[1].status == TodoStatus.IN_PROGRESS

    @pytest.mark.asyncio
    async def test_filters_issues_without_title(self) -> None:
        """Test that issues without title are filtered out."""
        received_todos: list[tuple[str, list[TodoItem]]] = []

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            received_todos.append((session_id, todos))

        mock_issues = [
            {"id": "1", "title": "Valid Issue", "status": "open"},
            {"id": "2", "status": "open"},  # No title
            {"id": "3", "title": "", "status": "open"},  # Empty title
        ]

        mock_result = BeadsQueryResult(issues=mock_issues, success=True)

        with tempfile.TemporaryDirectory() as tmpdir:
            poller = BeadsPoller(callback)

            with patch("app.core.beads_poller._run_bd_query", return_value=mock_result):
                await poller.start_polling("test-session", tmpdir)
                await asyncio.sleep(0.1)
                await poller.stop_polling("test-session")

            assert len(received_todos) >= 1
            _, todos = received_todos[0]
            assert len(todos) == 1
            assert todos[0].content == "Valid Issue"

    @pytest.mark.asyncio
    async def test_skips_callback_on_hash_match(self) -> None:
        """Test that callback is not called when hash matches."""
        call_count = 0

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            nonlocal call_count
            call_count += 1

        mock_issues = [{"id": "1", "title": "Test", "status": "open"}]
        mock_result = BeadsQueryResult(issues=mock_issues, success=True)

        with tempfile.TemporaryDirectory() as tmpdir:
            poller = BeadsPoller(callback)

            with patch("app.core.beads_poller._run_bd_query", return_value=mock_result):
                await poller.start_polling("test-session", tmpdir)
                await asyncio.sleep(0.1)  # First poll
                await asyncio.sleep(0.1)  # Second poll (should be skipped)
                await poller.stop_polling("test-session")

            # Should only be called once since data didn't change
            assert call_count == 1

    @pytest.mark.asyncio
    async def test_handles_query_failure_gracefully(self) -> None:
        """Test that query failure doesn't crash the poller."""
        call_count = 0

        async def callback(session_id: str, todos: list[TodoItem]) -> None:
            nonlocal call_count
            call_count += 1

        mock_result = BeadsQueryResult(issues=[], error="bd CLI not found", success=False)

        with tempfile.TemporaryDirectory() as tmpdir:
            poller = BeadsPoller(callback)

            with patch("app.core.beads_poller._run_bd_query", return_value=mock_result):
                await poller.start_polling("test-session", tmpdir)
                await asyncio.sleep(0.1)
                await poller.stop_polling("test-session")

            # Should not have called callback on failure
            assert call_count == 0


class TestBeadsQueryResult:
    """Tests for BeadsQueryResult dataclass."""

    def test_default_values(self) -> None:
        """Test default values."""
        result = BeadsQueryResult(issues=[])
        assert result.issues == []
        assert result.error is None
        assert result.success is True

    def test_with_error(self) -> None:
        """Test with error."""
        result = BeadsQueryResult(issues=[], error="Something went wrong", success=False)
        assert result.issues == []
        assert result.error == "Something went wrong"
        assert result.success is False
