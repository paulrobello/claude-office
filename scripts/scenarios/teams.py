"""Teams simulation scenario.

Multi-session team simulation with one lead and two teammate sessions.
Each teammate has its own session ID and sends events independently.
The lead coordinates work, teammates execute tasks, then all wrap up.

Exercises the room orchestrator merge path and team field sync.
"""

from __future__ import annotations

import time
from uuid import uuid4

from scripts.scenarios._base import SimulationContext, TeamSimulationContext


def run(ctx: SimulationContext) -> None:
    """Execute the teams scenario against *ctx*.

    The *ctx* parameter provides the base session ID and verbosity settings.
    Team member session IDs are derived from it.

    Args:
        ctx: Shared simulation context (used for the lead session).
    """
    team_name = f"team-{uuid4().hex[:8]}"
    team = TeamSimulationContext(
        team_name=team_name,
        project_name="TeamProject",
        verbose=ctx.verbose,
    )

    # Create sessions
    lead = team.add_lead(session_id=f"{ctx.session_id}-lead")
    impl = team.add_teammate("implementer", session_id=f"{ctx.session_id}-impl")
    tester = team.add_teammate("tester", session_id=f"{ctx.session_id}-test")

    team.log(f"[teams] Starting team scenario: {team_name}")

    # ---- Lead starts ----
    lead.send_event(
        "session_start",
        {"project_name": team.project_name, "team_name": team_name},
    )
    time.sleep(0.3)

    # ---- Implementer teammate starts ----
    impl.send_event(
        "session_start",
        {
            "project_name": team.project_name,
            "team_name": team_name,
            "teammate_name": "implementer",
        },
    )
    time.sleep(0.3)

    # ---- Tester teammate starts ----
    tester.send_event(
        "session_start",
        {
            "project_name": team.project_name,
            "team_name": team_name,
            "teammate_name": "tester",
        },
    )
    time.sleep(0.3)

    # ---- Implementer does work ----
    for fp in ["src/api/handlers.py", "src/db/queries.py"]:
        impl.send_event(
            "pre_tool_use",
            {
                "tool_name": "Edit",
                "tool_input": {"file_path": fp},
                "agent_id": "main",
                "team_name": team_name,
                "teammate_name": "implementer",
            },
        )
        impl.send_event(
            "post_tool_use",
            {
                "tool_name": "Edit",
                "tool_input": {"file_path": fp},
                "agent_id": "main",
                "team_name": team_name,
                "teammate_name": "implementer",
            },
        )

    # Implementer spawns a subagent
    impl.send_event(
        "subagent_start",
        {
            "agent_id": "impl_sub_1",
            "task_description": "Run linter",
            "team_name": team_name,
            "teammate_name": "implementer",
        },
    )
    impl.send_event(
        "subagent_stop",
        {
            "agent_id": "impl_sub_1",
            "success": True,
            "team_name": team_name,
            "teammate_name": "implementer",
        },
    )

    # Implementer goes idle then ends
    impl.send_event(
        "teammate_idle", {"team_name": team_name, "teammate_name": "implementer"}
    )
    impl.send_event("session_end")

    # ---- Tester does work then goes idle ----
    tester.send_event(
        "pre_tool_use",
        {
            "tool_name": "Bash",
            "tool_input": {"command": "pytest tests/ -v"},
            "agent_id": "main",
            "team_name": team_name,
            "teammate_name": "tester",
        },
    )
    tester.send_event(
        "post_tool_use",
        {
            "tool_name": "Bash",
            "tool_input": {"command": "pytest tests/ -v"},
            "agent_id": "main",
            "team_name": team_name,
            "teammate_name": "tester",
        },
    )
    tester.send_event(
        "teammate_idle", {"team_name": team_name, "teammate_name": "tester"}
    )
    tester.send_event("session_end")

    # ---- Lead wraps up ----
    lead.send_event(
        "background_task_notification",
        {
            "background_task_id": f"bg-{uuid4().hex[:8]}",
            "background_task_status": "completed",
            "background_task_summary": "CI passed",
            "background_task_output_file": "/tmp/ci.log",
        },
    )
    lead.send_event("stop", {"speech_content": {"boss_phone": "All done!"}})
    lead.send_event("session_end")

    team.log(f"[teams] Team scenario complete: {team_name}")
