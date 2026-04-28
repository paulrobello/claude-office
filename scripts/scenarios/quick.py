"""Quick simulation scenario.

A fast (~30 s) scenario that exercises the full event lifecycle:
session start, user prompt, kanban tasks, boss tool use, permission
request, two subagents, background task notification, and session end.

Designed for rapid iteration and CI smoke tests.
"""

from __future__ import annotations

import time

from scripts.scenarios._base import SimulationContext


def run(ctx: SimulationContext) -> None:
    """Execute the quick scenario against *ctx*.

    Args:
        ctx: Shared simulation context (session_id, token state, etc.).
    """
    ctx.reset(initial_fraction=0.0)
    ctx.log("[quick] Starting quick scenario")

    # Session start
    ctx.send_event("session_start", {"project_name": "QuickDemo"})
    time.sleep(0.5)

    # User prompt
    ctx.send_event(
        "user_prompt_submit",
        {"prompt": "Fix login timeout bug and generate a report."},
    )
    time.sleep(0.3)

    # Kanban tasks
    tasks = [
        ("qt-01", "[PROJ-1] Fix login timeout for inactive sessions"),
        ("qt-02", "[PROJ-2] Add rate limiting to /api/v1/auth"),
        ("qt-03", "[PROJ-3] Update dashboard component styles"),
    ]
    for task_id, subject in tasks:
        ctx.send_event("task_created", {"id": task_id, "content": subject})

    # Initial TodoWrite
    ctx.send_event(
        "pre_tool_use",
        {
            "tool_name": "TodoWrite",
            "tool_input": {
                "todos": [
                    {"content": s, "status": "in_progress" if i == 0 else "pending"}
                    for i, (_, s) in enumerate(tasks[:2])
                ]
            },
            "agent_id": "main",
            "input_tokens": 10_000,
            "output_tokens": 4_000,
        },
    )
    ctx.send_event("post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})

    # Boss reads + edits (heat map seeding)
    for fp in ["src/auth/login.py", "src/api/handlers.py"]:
        for tool in ["Read", "Edit"]:
            ctx.send_event(
                "pre_tool_use",
                {
                    "tool_name": tool,
                    "tool_input": {"file_path": fp},
                    "agent_id": "main",
                    "input_tokens": 1_500,
                    "output_tokens": 500,
                },
            )
            ctx.send_event(
                "post_tool_use",
                {"tool_name": tool, "tool_input": {"file_path": fp}, "agent_id": "main"},
            )

    # Permission request
    ctx.send_event(
        "permission_request",
        {"tool_name": "Bash", "tool_input": {"command": "iptables -L"}, "agent_id": "main"},
    )

    # First kanban completion
    ctx.send_event(
        "task_completed",
        {"id": "qt-01", "content": "[PROJ-1] Fix login timeout for inactive sessions"},
    )

    # Two subagents
    agents = [
        ("quick_agent_1", "Fix login session timeout handling"),
        ("quick_agent_2", "Implement rate limiting middleware"),
    ]
    for agent_id, task in agents:
        ctx.send_event(
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
            ctx.send_event(
                "pre_tool_use",
                {
                    "tool_name": tool,
                    "tool_input": {"file_path": "src/auth/login.py"},
                    "agent_id": agent_id,
                    "input_tokens": 2_000,
                    "output_tokens": 1_000,
                },
            )
            ctx.send_event(
                "post_tool_use",
                {
                    "tool_name": tool,
                    "tool_input": {"file_path": "src/auth/login.py"},
                    "agent_id": agent_id,
                },
            )
        ctx.send_event(
            "subagent_stop",
            {
                "agent_id": agent_id,
                "success": True,
                "speech_content": {"agent": "Done!", "boss": "Nice work."},
            },
        )

    # Remaining kanban completions
    ctx.send_event(
        "task_completed",
        {"id": "qt-02", "content": "[PROJ-2] Add rate limiting to /api/v1/auth"},
    )
    ctx.send_event(
        "task_completed",
        {"id": "qt-03", "content": "[PROJ-3] Update dashboard component styles"},
    )

    # Final TodoWrite — all complete
    ctx.send_event(
        "pre_tool_use",
        {
            "tool_name": "TodoWrite",
            "tool_input": {"todos": [{"content": "All done", "status": "completed"}]},
            "agent_id": "main",
        },
    )
    ctx.send_event("post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})

    # Background task
    ctx.send_event(
        "background_task_notification",
        {
            "background_task_id": "quick-lint-001",
            "background_task_status": "completed",
            "background_task_summary": "Linting passed — 0 errors",
            "background_task_output_file": "/tmp/quick-lint-001.log",
        },
    )

    ctx.send_event("stop", {"speech_content": {"boss_phone": "All done. Fast and clean!"}})
    ctx.send_event("session_end")

    ctx.log("[quick] Quick scenario complete")
