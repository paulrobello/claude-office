"""Tests for RALPH_* env forwarding on session_start payload."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from claude_office_hooks.event_mapper import map_event

_BASE_RAW = {"session_id": "sess-1", "cwd": "/tmp/proj", "source": "human"}


class TestRalphEnvForwarding:
    def test_no_env_vars_set(self, monkeypatch) -> None:
        for k in ("RALPH_RUN_ID", "RALPH_ROLE", "RALPH_TASK_ID", "RALPH_PRIMARY_REPO"):
            monkeypatch.delenv(k, raising=False)
        result = map_event("session_start", _BASE_RAW, "sess-1")
        assert result is not None
        assert "run_id" not in result["data"]
        assert "ralph_role" not in result["data"]
        assert "ralph_task_id" not in result["data"]
        assert "primary_repo" not in result["data"]

    def test_all_env_vars_forwarded(self, monkeypatch) -> None:
        monkeypatch.setenv("RALPH_RUN_ID", "ral-abc123")
        monkeypatch.setenv("RALPH_ROLE", "coder")
        monkeypatch.setenv("RALPH_TASK_ID", "plan-task-12")
        monkeypatch.setenv("RALPH_PRIMARY_REPO", "/home/user/myrepo")
        result = map_event("session_start", _BASE_RAW, "sess-1")
        assert result is not None
        assert result["data"]["run_id"] == "ral-abc123"
        assert result["data"]["ralph_role"] == "coder"
        assert result["data"]["ralph_task_id"] == "plan-task-12"
        assert result["data"]["primary_repo"] == "/home/user/myrepo"

    def test_partial_env_vars_forwarded(self, monkeypatch) -> None:
        for k in ("RALPH_ROLE", "RALPH_TASK_ID", "RALPH_PRIMARY_REPO"):
            monkeypatch.delenv(k, raising=False)
        monkeypatch.setenv("RALPH_RUN_ID", "ral-xyz")
        result = map_event("session_start", _BASE_RAW, "sess-1")
        assert result is not None
        assert result["data"]["run_id"] == "ral-xyz"
        assert "ralph_role" not in result["data"]
        assert "ralph_task_id" not in result["data"]
        assert "primary_repo" not in result["data"]

    def test_event_type_still_session_start(self, monkeypatch) -> None:
        monkeypatch.setenv("RALPH_RUN_ID", "ral-1")
        result = map_event("session_start", _BASE_RAW, "sess-1")
        assert result is not None
        assert result["event_type"] == "session_start"

    def test_summary_still_present(self, monkeypatch) -> None:
        monkeypatch.setenv("RALPH_RUN_ID", "ral-1")
        result = map_event("session_start", _BASE_RAW, "sess-1")
        assert result is not None
        assert "summary" in result["data"]
