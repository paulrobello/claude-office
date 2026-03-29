"""Tests for Phase 4 hook event mapping: TaskCreated, TaskCompleted, TeammateIdle."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from claude_office_hooks.event_mapper import map_event


class TestTaskCreatedMapping:
    def test_task_created_returns_payload(self) -> None:
        raw = {
            "session_id": "sess-1",
            "cwd": "/home/user/project",
            "id": "task-abc",
            "content": "Implement login",
        }
        result = map_event("task_created", raw, "sess-1")
        assert result is not None
        assert result["event_type"] == "task_created"

    def test_task_created_extracts_task_id(self) -> None:
        raw = {"session_id": "sess-1", "cwd": "/p", "id": "task-abc", "content": "Do X"}
        result = map_event("task_created", raw, "sess-1")
        assert result["data"]["task_id"] == "task-abc"

    def test_task_created_extracts_task_subject(self) -> None:
        raw = {"session_id": "sess-1", "cwd": "/p", "id": "task-abc", "content": "Do X"}
        result = map_event("task_created", raw, "sess-1")
        assert result["data"]["task_subject"] == "Do X"

    def test_task_created_extracts_team_name(self) -> None:
        raw = {
            "session_id": "sess-1", "cwd": "/p",
            "id": "t1", "content": "Do X",
            "team_name": "my-team",
        }
        result = map_event("task_created", raw, "sess-1")
        assert result["data"]["team_name"] == "my-team"

    def test_task_created_extracts_teammate_name(self) -> None:
        raw = {
            "session_id": "sess-1", "cwd": "/p",
            "id": "t1", "content": "Do X",
            "teammate_name": "implementer",
        }
        result = map_event("task_created", raw, "sess-1")
        assert result["data"]["teammate_name"] == "implementer"


class TestTaskCompletedMapping:
    def test_task_completed_returns_payload(self) -> None:
        raw = {"session_id": "sess-1", "cwd": "/p", "id": "task-abc"}
        result = map_event("task_completed", raw, "sess-1")
        assert result is not None
        assert result["event_type"] == "task_completed"

    def test_task_completed_extracts_task_id(self) -> None:
        raw = {"session_id": "sess-1", "cwd": "/p", "id": "task-abc"}
        result = map_event("task_completed", raw, "sess-1")
        assert result["data"]["task_id"] == "task-abc"


class TestTeammateIdleMapping:
    def test_teammate_idle_returns_payload(self) -> None:
        raw = {
            "session_id": "sess-1", "cwd": "/p",
            "team_name": "my-team", "teammate_name": "reviewer",
        }
        result = map_event("teammate_idle", raw, "sess-1")
        assert result is not None
        assert result["event_type"] == "teammate_idle"

    def test_teammate_idle_extracts_team_fields(self) -> None:
        raw = {
            "session_id": "sess-1", "cwd": "/p",
            "team_name": "my-team", "teammate_name": "reviewer",
        }
        result = map_event("teammate_idle", raw, "sess-1")
        assert result["data"]["team_name"] == "my-team"
        assert result["data"]["teammate_name"] == "reviewer"


class TestTeamFieldsOnAllEvents:
    def test_session_start_includes_team_name_when_present(self) -> None:
        raw = {
            "session_id": "sess-1", "cwd": "/p",
            "team_name": "squad", "teammate_name": "tester",
        }
        result = map_event("session_start", raw, "sess-1")
        assert result is not None
        assert result["data"]["team_name"] == "squad"
        assert result["data"]["teammate_name"] == "tester"

    def test_team_fields_absent_when_not_in_payload(self) -> None:
        raw = {"session_id": "sess-1", "cwd": "/p"}
        result = map_event("session_start", raw, "sess-1")
        assert result is not None
        assert result["data"].get("team_name") is None
        assert result["data"].get("teammate_name") is None
