"""Edge-case simulation scenario.

Exercises unusual but valid sequences to verify the frontend handles them:
- Permission requests that block the boss and an agent
- Tool use errors (success=False) that update the error counter
- Rapid session start → session end (empty session)
- Subagent that disappears without a subagent_stop (CLEANUP event)
- Background task with "failed" status
- Very long prompts that get truncated in the bubble
"""

from __future__ import annotations

import time

from scripts.scenarios._base import SimulationContext


def _scenario_permission_request(ctx: SimulationContext) -> None:
    """Boss and a subagent both hit permission requests simultaneously."""
    ctx.log("[edge] Scenario: permission requests")

    ctx.send_event("session_start", {"project_name": "EdgeCases"})
    time.sleep(0.5)

    # Long prompt to test truncation
    long_prompt = "A" * 200
    ctx.send_event("user_prompt_submit", {"prompt": long_prompt})
    time.sleep(0.5)

    # Boss triggers permission request
    ctx.send_event(
        "permission_request",
        {"tool_name": "Bash", "tool_input": {"command": "rm -rf /tmp/test"}, "agent_id": "main"},
    )
    time.sleep(2)

    # Boss gets permission, continues working
    ctx.send_event(
        "post_tool_use",
        {"tool_name": "Bash", "tool_input": {"command": "rm -rf /tmp/test"}, "agent_id": "main", "success": True},
    )
    time.sleep(1)

    # Spawn one agent
    ctx.send_event(
        "subagent_start",
        {"agent_id": "edge_agent_1", "task_description": "Test permission flow"},
    )
    time.sleep(15)  # Wait for arrival

    # Agent hits permission request
    ctx.send_event(
        "permission_request",
        {"tool_name": "Write", "tool_input": {"file_path": "/etc/hosts"}, "agent_id": "edge_agent_1"},
    )
    time.sleep(3)

    # Agent gets permission and completes work
    ctx.send_event(
        "post_tool_use",
        {"tool_name": "Write", "agent_id": "edge_agent_1", "success": True},
    )
    time.sleep(2)

    ctx.send_event(
        "subagent_stop",
        {"agent_id": "edge_agent_1", "success": True},
    )
    time.sleep(2)


def _scenario_tool_errors(ctx: SimulationContext) -> None:
    """Boss encounters tool errors that increment the error counter."""
    ctx.log("[edge] Scenario: tool errors")

    errors = [
        ("Bash", "pytest tests/", "ProcessError"),
        ("Read", "missing_file.py", "FileNotFoundError"),
        ("Write", "readonly.py", "PermissionError"),
    ]

    for tool_name, path_or_cmd, error_type in errors:
        if tool_name == "Bash":
            tool_input = {"command": path_or_cmd}
        else:
            tool_input = {"file_path": path_or_cmd}

        ctx.send_event(
            "pre_tool_use",
            {"tool_name": tool_name, "tool_input": tool_input, "agent_id": "main"},
        )
        time.sleep(1)

        ctx.send_event(
            "post_tool_use",
            {
                "tool_name": tool_name,
                "tool_input": tool_input,
                "agent_id": "main",
                "success": False,
                "error_type": error_type,
            },
        )
        time.sleep(1)


def _scenario_cleanup_orphan(ctx: SimulationContext) -> None:
    """A subagent is spawned but removed via CLEANUP without subagent_stop."""
    ctx.log("[edge] Scenario: orphan agent cleanup")

    ctx.send_event(
        "subagent_start",
        {"agent_id": "orphan_agent", "task_description": "This agent will be cleaned up"},
    )
    time.sleep(10)

    # Simulate cleanup without a proper stop
    ctx.send_event("cleanup", {"agent_id": "orphan_agent"})
    time.sleep(1)


def _scenario_background_task_failure(ctx: SimulationContext) -> None:
    """A background task arrives with a failed status."""
    ctx.log("[edge] Scenario: background task failure")

    ctx.send_event(
        "background_task_notification",
        {
            "background_task_id": "edge_bg_fail_001",
            "background_task_status": "failed",
            "background_task_summary": "Integration tests failed: 3 assertions",
            "background_task_output_file": "/tmp/edge_bg_fail_001.output",
        },
    )
    time.sleep(1)

    # A successful one immediately after
    ctx.send_event(
        "background_task_notification",
        {
            "background_task_id": "edge_bg_ok_002",
            "background_task_status": "completed",
            "background_task_summary": "Lint checks passed",
            "background_task_output_file": "/tmp/edge_bg_ok_002.output",
        },
    )
    time.sleep(1)


def run(ctx: SimulationContext) -> None:
    """Execute all edge-case sub-scenarios against *ctx*.

    Args:
        ctx: Shared simulation context (session_id, token state, etc.).
    """
    ctx.reset(initial_fraction=0.0)
    ctx.log(f"[edge] Starting edge-case scenarios: {ctx.session_id}")

    ctx.send_event("session_start", {"project_name": "EdgeCases"})
    time.sleep(1)

    ctx.send_event(
        "user_prompt_submit",
        {"prompt": "Run edge case scenarios to verify error handling."},
    )
    time.sleep(1)

    _scenario_tool_errors(ctx)
    _scenario_cleanup_orphan(ctx)
    _scenario_background_task_failure(ctx)
    _scenario_permission_request(ctx)

    time.sleep(2)
    ctx.send_event("stop", {"speech_content": {"boss_phone": "Edge case testing complete."}})
    time.sleep(5)
    ctx.send_event("session_end")

    ctx.log("[edge] Edge-case scenario complete.")
