"""Integration tests for the simulation event pipeline.

These tests verify that every event type used by the simulation scenarios is
accepted by the API, processed by the state machine, and produces a valid game
state.  They act as a regression suite: if a new column is added to the schema,
a new event type is introduced, or the state machine logic changes in a way that
breaks the simulation, these tests will catch it.

Structure
---------
TestSimulationEventTypes   - Each event type in isolation
TestSimulationQuickScenario - Full quick-scenario event sequence
TestSimulationTeamScenario  - Lead + teammate session pairing
TestSimulationStateVerification - Game-state assertions after key events
"""

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def post_event(session_id: str, event_type: str, data: dict[str, Any] | None = None) -> None:
    """POST one event to the API and assert it is accepted."""
    response = client.post(
        "/api/v1/events",
        json={
            "event_type": event_type,
            "session_id": session_id,
            "timestamp": datetime.now(UTC).isoformat(),
            "data": data or {},
        },
    )
    assert response.status_code == 200, (
        f"Event '{event_type}' returned {response.status_code}: {response.text}"
    )
    assert response.json().get("status") == "accepted", (
        f"Event '{event_type}' not accepted: {response.json()}"
    )


def get_replay_state(session_id: str) -> dict[str, Any]:
    """Return the final game state from the replay endpoint."""
    response = client.get(f"/api/v1/sessions/{session_id}/replay")
    assert response.status_code == 200, response.text
    frames: list[dict[str, Any]] = response.json()
    return frames[-1]["state"] if frames else {}


# ---------------------------------------------------------------------------
# Event-type smoke tests
# ---------------------------------------------------------------------------


class TestSimulationEventTypes:
    """Every event type emitted by simulation scenarios is accepted by the API."""

    def test_session_lifecycle(self) -> None:
        sid = f"evt-lifecycle-{uuid4()}"
        post_event(sid, "session_start", {"project_name": "SmokeTest"})
        post_event(sid, "stop", {"speech_content": {"boss_phone": "All done."}})
        post_event(sid, "session_end")

    def test_user_prompt_submit(self) -> None:
        sid = f"evt-prompt-{uuid4()}"
        post_event(sid, "session_start")
        post_event(
            sid,
            "user_prompt_submit",
            {"prompt": "Fix the bug and generate a report."},
        )
        post_event(sid, "session_end")

    def test_tool_use_cycle(self) -> None:
        sid = f"evt-tool-{uuid4()}"
        post_event(sid, "session_start")
        post_event(
            sid,
            "pre_tool_use",
            {
                "tool_name": "Read",
                "tool_input": {"file_path": "src/main.py"},
                "agent_id": "main",
                "input_tokens": 10_000,
                "output_tokens": 5_000,
            },
        )
        post_event(
            sid,
            "post_tool_use",
            {
                "tool_name": "Read",
                "tool_input": {"file_path": "src/main.py"},
                "agent_id": "main",
            },
        )
        post_event(sid, "session_end")

    def test_all_common_tools(self) -> None:
        """Read, Edit, Bash, Glob, Grep, Write, TodoWrite are all accepted."""
        sid = f"evt-tools-{uuid4()}"
        post_event(sid, "session_start")
        for tool in ["Read", "Edit", "Bash", "Glob", "Grep", "Write"]:
            post_event(
                sid,
                "pre_tool_use",
                {
                    "tool_name": tool,
                    "tool_input": {"file_path": "src/auth/login.py", "command": "pytest"},
                    "agent_id": "main",
                },
            )
            post_event(
                sid,
                "post_tool_use",
                {
                    "tool_name": tool,
                    "tool_input": {"file_path": "src/auth/login.py"},
                    "agent_id": "main",
                },
            )
        # TodoWrite
        post_event(
            sid,
            "pre_tool_use",
            {
                "tool_name": "TodoWrite",
                "tool_input": {
                    "todos": [
                        {"content": "Review PRD", "status": "in_progress"},
                        {"content": "Implement feature", "status": "pending"},
                    ]
                },
                "agent_id": "main",
            },
        )
        post_event(sid, "post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})
        post_event(sid, "session_end")

    def test_subagent_lifecycle(self) -> None:
        sid = f"evt-agent-{uuid4()}"
        post_event(sid, "session_start")
        post_event(
            sid,
            "subagent_start",
            {
                "agent_id": "agent_1",
                "task_description": "Analyze security vulnerabilities in auth module",
                "speech_content": {"boss": "On it!", "agent": "Starting..."},
                "input_tokens": 20_000,
                "output_tokens": 8_000,
            },
        )
        post_event(
            sid,
            "pre_tool_use",
            {"tool_name": "Bash", "tool_input": {"command": "pytest -v"}, "agent_id": "agent_1"},
        )
        post_event(
            sid,
            "post_tool_use",
            {"tool_name": "Bash", "tool_input": {"command": "pytest -v"}, "agent_id": "agent_1"},
        )
        post_event(
            sid,
            "subagent_stop",
            {
                "agent_id": "agent_1",
                "success": True,
                "speech_content": {"agent": "Done!", "boss": "Great work."},
            },
        )
        post_event(sid, "session_end")

    def test_context_compaction(self) -> None:
        sid = f"evt-compact-{uuid4()}"
        post_event(sid, "session_start")
        post_event(
            sid,
            "context_compaction",
            {"input_tokens": 170_000, "output_tokens": 50_000},
        )
        post_event(sid, "session_end")

    def test_kanban_task_events(self) -> None:
        sid = f"evt-kanban-{uuid4()}"
        post_event(sid, "session_start")
        post_event(sid, "task_created", {"id": "task-01", "content": "[PROJ-1] Fix login timeout"})
        post_event(sid, "task_created", {"id": "task-02", "content": "[PROJ-2] Add rate limiting"})
        post_event(
            sid, "task_completed", {"id": "task-01", "content": "[PROJ-1] Fix login timeout"}
        )
        post_event(sid, "session_end")

    def test_background_task_notification(self) -> None:
        sid = f"evt-bgtask-{uuid4()}"
        post_event(sid, "session_start")
        for status in ["completed", "failed"]:
            post_event(
                sid,
                "background_task_notification",
                {
                    "background_task_id": f"bg-{uuid4()}",
                    "background_task_status": status,
                    "background_task_summary": f"Task {status}",
                    "background_task_output_file": f"/tmp/bg-{status}.log",
                },
            )
        post_event(sid, "session_end")

    def test_permission_request(self) -> None:
        sid = f"evt-perm-{uuid4()}"
        post_event(sid, "session_start")
        post_event(
            sid,
            "permission_request",
            {
                "tool_name": "Bash",
                "tool_input": {"command": "iptables -L"},
                "agent_id": "main",
            },
        )
        post_event(sid, "session_end")

    def test_teammate_idle(self) -> None:
        team = f"team-{uuid4()}"
        sid = f"evt-idle-{uuid4()}"
        post_event(
            sid,
            "session_start",
            {"team_name": team, "teammate_name": "implementer"},
        )
        post_event(
            sid,
            "teammate_idle",
            {"team_name": team, "teammate_name": "implementer"},
        )
        post_event(sid, "session_end")


# ---------------------------------------------------------------------------
# Quick scenario: full event sequence
# ---------------------------------------------------------------------------


class TestSimulationQuickScenario:
    """Full quick-scenario pipeline in sequence."""

    def test_quick_scenario_all_events_accepted(self) -> None:
        sid = f"quick-{uuid4()}"

        post_event(sid, "session_start", {"project_name": "QuickDemo"})
        post_event(
            sid,
            "user_prompt_submit",
            {"prompt": "Fix login timeout bug and generate a report."},
        )

        # Kanban tasks
        for task_id, subject in [
            ("qt-01", "[PROJ-1] Fix login timeout for inactive sessions"),
            ("qt-02", "[PROJ-2] Add rate limiting to /api/v1/auth"),
            ("qt-03", "[PROJ-3] Update dashboard component styles"),
        ]:
            post_event(sid, "task_created", {"id": task_id, "content": subject})

        # Initial todo list
        post_event(
            sid,
            "pre_tool_use",
            {
                "tool_name": "TodoWrite",
                "tool_input": {
                    "todos": [
                        {"content": s, "status": "in_progress" if i == 0 else "pending"}
                        for i, s in enumerate(
                            [
                                "[PROJ-1] Fix login timeout for inactive sessions",
                                "[PROJ-2] Add rate limiting to /api/v1/auth",
                            ]
                        )
                    ]
                },
                "agent_id": "main",
                "input_tokens": 10_000,
                "output_tokens": 4_000,
            },
        )
        post_event(sid, "post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})

        # Boss reads + edits (heat map seeding)
        for fp in ["src/auth/login.py", "src/api/handlers.py"]:
            for tool in ["Read", "Edit"]:
                post_event(
                    sid,
                    "pre_tool_use",
                    {
                        "tool_name": tool,
                        "tool_input": {"file_path": fp},
                        "agent_id": "main",
                        "input_tokens": 1_500,
                        "output_tokens": 500,
                    },
                )
                post_event(
                    sid,
                    "post_tool_use",
                    {"tool_name": tool, "tool_input": {"file_path": fp}, "agent_id": "main"},
                )

        # Permission request
        post_event(
            sid,
            "permission_request",
            {"tool_name": "Bash", "tool_input": {"command": "iptables -L"}, "agent_id": "main"},
        )

        # Kanban completion
        post_event(
            sid,
            "task_completed",
            {"id": "qt-01", "content": "[PROJ-1] Fix login timeout for inactive sessions"},
        )

        # Two subagents
        for agent_id, task in [
            ("quick_agent_1", "Fix login session timeout handling"),
            ("quick_agent_2", "Implement rate limiting middleware"),
        ]:
            post_event(
                sid,
                "subagent_start",
                {
                    "agent_id": agent_id,
                    "task_description": task,
                    "speech_content": {"boss": "Quick, on this!", "agent": "On it!"},
                    "input_tokens": 2_000,
                    "output_tokens": 1_000,
                },
            )
            for tool in ["Read", "Edit"]:
                post_event(
                    sid,
                    "pre_tool_use",
                    {
                        "tool_name": tool,
                        "tool_input": {"file_path": "src/auth/login.py"},
                        "agent_id": agent_id,
                        "input_tokens": 2_000,
                        "output_tokens": 1_000,
                    },
                )
                post_event(
                    sid,
                    "post_tool_use",
                    {
                        "tool_name": tool,
                        "tool_input": {"file_path": "src/auth/login.py"},
                        "agent_id": agent_id,
                    },
                )
            post_event(
                sid,
                "subagent_stop",
                {
                    "agent_id": agent_id,
                    "success": True,
                    "speech_content": {"agent": "Done!", "boss": "Nice work."},
                },
            )

        # Remaining kanban completions
        post_event(
            sid,
            "task_completed",
            {"id": "qt-02", "content": "[PROJ-2] Add rate limiting to /api/v1/auth"},
        )
        post_event(
            sid,
            "task_completed",
            {"id": "qt-03", "content": "[PROJ-3] Update dashboard component styles"},
        )

        # Final TodoWrite — all complete
        post_event(
            sid,
            "pre_tool_use",
            {
                "tool_name": "TodoWrite",
                "tool_input": {"todos": [{"content": "All done", "status": "completed"}]},
                "agent_id": "main",
            },
        )
        post_event(sid, "post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})

        # Background task
        post_event(
            sid,
            "background_task_notification",
            {
                "background_task_id": "quick-lint-001",
                "background_task_status": "completed",
                "background_task_summary": "Linting passed — 0 errors",
                "background_task_output_file": "/tmp/quick-lint-001.log",
            },
        )

        post_event(sid, "stop", {"speech_content": {"boss_phone": "All done. Fast and clean!"}})
        post_event(sid, "session_end")

        # Session must appear in the DB listing
        resp = client.get("/api/v1/sessions")
        assert resp.status_code == 200
        assert any(s["id"] == sid for s in resp.json()), (
            "Session missing from list after quick scenario"
        )


# ---------------------------------------------------------------------------
# Teams scenario
# ---------------------------------------------------------------------------


class TestSimulationTeamScenario:
    """Lead + teammate sessions are both accepted and linked via team_name."""

    def test_lead_and_two_teammates(self) -> None:
        team = f"test-team-{uuid4()}"
        lead_sid = f"lead-{uuid4()}"
        impl_sid = f"impl-{uuid4()}"
        test_sid = f"test-{uuid4()}"

        # Lead starts
        post_event(lead_sid, "session_start", {"project_name": "TeamProject", "team_name": team})

        # Implementer teammate starts
        post_event(
            impl_sid,
            "session_start",
            {"project_name": "TeamProject", "team_name": team, "teammate_name": "implementer"},
        )

        # Tester teammate starts
        post_event(
            test_sid,
            "session_start",
            {"project_name": "TeamProject", "team_name": team, "teammate_name": "tester"},
        )

        # Implementer does work
        for fp in ["src/api/handlers.py", "src/db/queries.py"]:
            post_event(
                impl_sid,
                "pre_tool_use",
                {
                    "tool_name": "Edit",
                    "tool_input": {"file_path": fp},
                    "agent_id": "main",
                    "team_name": team,
                    "teammate_name": "implementer",
                },
            )
            post_event(
                impl_sid,
                "post_tool_use",
                {
                    "tool_name": "Edit",
                    "tool_input": {"file_path": fp},
                    "agent_id": "main",
                    "team_name": team,
                    "teammate_name": "implementer",
                },
            )

        # Implementer spawns a subagent
        post_event(
            impl_sid,
            "subagent_start",
            {
                "agent_id": "impl_sub_1",
                "task_description": "Run linter",
                "team_name": team,
                "teammate_name": "implementer",
            },
        )
        post_event(
            impl_sid,
            "subagent_stop",
            {
                "agent_id": "impl_sub_1",
                "success": True,
                "team_name": team,
                "teammate_name": "implementer",
            },
        )
        post_event(impl_sid, "teammate_idle", {"team_name": team, "teammate_name": "implementer"})
        post_event(impl_sid, "session_end")

        # Tester does work then goes idle
        post_event(
            test_sid,
            "pre_tool_use",
            {
                "tool_name": "Bash",
                "tool_input": {"command": "pytest tests/ -v"},
                "agent_id": "main",
                "team_name": team,
                "teammate_name": "tester",
            },
        )
        post_event(
            test_sid,
            "post_tool_use",
            {
                "tool_name": "Bash",
                "tool_input": {"command": "pytest tests/ -v"},
                "agent_id": "main",
                "team_name": team,
                "teammate_name": "tester",
            },
        )
        post_event(test_sid, "teammate_idle", {"team_name": team, "teammate_name": "tester"})
        post_event(test_sid, "session_end")

        # Lead wraps up
        post_event(
            lead_sid,
            "background_task_notification",
            {
                "background_task_id": f"bg-{uuid4()}",
                "background_task_status": "completed",
                "background_task_summary": "CI passed",
                "background_task_output_file": "/tmp/ci.log",
            },
        )
        post_event(lead_sid, "stop", {"speech_content": {"boss_phone": "All done!"}})
        post_event(lead_sid, "session_end")

        # Both sessions must appear in the DB listing
        resp = client.get("/api/v1/sessions")
        assert resp.status_code == 200
        ids = {s["id"] for s in resp.json()}
        assert lead_sid in ids
        assert impl_sid in ids
        assert test_sid in ids


# ---------------------------------------------------------------------------
# State verification
# ---------------------------------------------------------------------------


class TestSimulationStateVerification:
    """Game state reflects key simulation events correctly."""

    def test_agents_appear_after_subagent_start(self) -> None:
        sid = f"state-agent-{uuid4()}"
        post_event(sid, "session_start")
        post_event(
            sid,
            "subagent_start",
            {
                "agent_id": "worker_1",
                "task_description": "Refactor auth module",
            },
        )
        state = get_replay_state(sid)
        agent_ids = [a["id"] for a in state.get("agents", [])]
        assert "worker_1" in agent_ids

    def test_agents_removed_after_subagent_stop(self) -> None:
        sid = f"state-stop-{uuid4()}"
        post_event(sid, "session_start")
        post_event(sid, "subagent_start", {"agent_id": "worker_2", "task_description": "Run tests"})
        post_event(sid, "subagent_stop", {"agent_id": "worker_2", "success": True})
        state = get_replay_state(sid)
        agent_ids = [a["id"] for a in state.get("agents", [])]
        assert "worker_2" not in agent_ids

    def test_todos_updated_by_todo_write(self) -> None:
        sid = f"state-todo-{uuid4()}"
        post_event(sid, "session_start")
        post_event(
            sid,
            "pre_tool_use",
            {
                "tool_name": "TodoWrite",
                "tool_input": {
                    "todos": [
                        {"content": "Review PRD.md", "status": "in_progress"},
                        {"content": "Implement feature", "status": "pending"},
                    ]
                },
                "agent_id": "main",
            },
        )
        state = get_replay_state(sid)
        todos = state.get("todos", [])
        contents = {t["content"] for t in todos}
        assert "Review PRD.md" in contents

    def test_context_utilization_reflects_token_counts(self) -> None:
        sid = f"state-ctx-{uuid4()}"
        post_event(sid, "session_start")
        post_event(
            sid,
            "pre_tool_use",
            {
                "tool_name": "Read",
                "tool_input": {"file_path": "src/main.py"},
                "agent_id": "main",
                "input_tokens": 100_000,
                "output_tokens": 50_000,
            },
        )
        state = get_replay_state(sid)
        # contextUtilization lives inside the nested "office" object
        utilization = state.get("office", {}).get("contextUtilization", 0.0)
        assert utilization > 0.0, f"Expected contextUtilization > 0, got {utilization}"

    def test_compaction_followed_by_reduced_tokens(self) -> None:
        """After compaction, subsequent events with reduced token counts are accepted.

        The context_compaction event records the pre-compaction token snapshot.
        The simulation then resumes posting events with ~30% of prior token counts,
        which naturally lowers the utilization in subsequent states.
        """
        sid = f"state-compact-{uuid4()}"
        post_event(sid, "session_start")

        # High usage before compaction
        post_event(
            sid,
            "pre_tool_use",
            {
                "tool_name": "Read",
                "tool_input": {"file_path": "src/main.py"},
                "agent_id": "main",
                "input_tokens": 170_000,
                "output_tokens": 0,
            },
        )
        pre_compaction = get_replay_state(sid).get("office", {}).get("contextUtilization", 0.0)
        assert pre_compaction > 0.8, (
            f"Expected high utilization before compaction, got {pre_compaction}"
        )

        # Compaction event
        post_event(
            sid,
            "context_compaction",
            {"input_tokens": 170_000, "output_tokens": 0},
        )

        # Post-compaction: simulation resumes with reduced tokens (~30% retained)
        post_event(
            sid,
            "pre_tool_use",
            {
                "tool_name": "Read",
                "tool_input": {"file_path": "src/main.py"},
                "agent_id": "main",
                "input_tokens": 51_000,  # 30% of 170_000
                "output_tokens": 0,
            },
        )
        post_compaction = get_replay_state(sid).get("office", {}).get("contextUtilization", 1.0)
        assert post_compaction < pre_compaction, (
            f"Expected utilization to drop after compaction + reduced tokens "
            f"({pre_compaction:.2f} → {post_compaction:.2f})"
        )

    def test_multiple_subagents_all_appear(self) -> None:
        sid = f"state-multi-{uuid4()}"
        post_event(sid, "session_start")
        for i in range(4):
            post_event(
                sid,
                "subagent_start",
                {
                    "agent_id": f"agent_{i}",
                    "task_description": f"Task {i}",
                },
            )
        state = get_replay_state(sid)
        agent_ids = {a["id"] for a in state.get("agents", [])}
        for i in range(4):
            assert f"agent_{i}" in agent_ids


# ---------------------------------------------------------------------------
# Sessions API smoke tests
# ---------------------------------------------------------------------------


class TestSessionsAPISmoke:
    """The /api/v1/sessions endpoint stays healthy under simulation load."""

    def test_list_sessions_returns_200(self) -> None:
        resp = client.get("/api/v1/sessions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_sessions_after_events(self) -> None:
        sid = f"api-smoke-{uuid4()}"
        post_event(sid, "session_start", {"project_name": "SmokeProj"})
        post_event(sid, "session_end")

        resp = client.get("/api/v1/sessions")
        assert resp.status_code == 200
        assert any(s["id"] == sid for s in resp.json())

    def test_focus_endpoint_returns_404_for_unknown_session(self) -> None:
        resp = client.post("/api/v1/sessions/no-such-session-xyz/focus", json={})
        assert resp.status_code == 404
