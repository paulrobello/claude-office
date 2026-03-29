"""Quick simulation scenario.

Exercises all major visual elements in ~45 seconds:
- Session start + user prompt
- Boss reads files and makes edits (heat map)
- TodoWrite with task list
- Task created/completed events (kanban board)
- Two subagents spawned concurrently
- Permission request
- Background task notification
- Stop + session end

No context compaction (context stays low). Useful for rapid demos
and visual smoke-testing after code changes.
"""

from __future__ import annotations

import random
import threading
import time

from scripts.scenarios._base import (
    AGENT_NAMES,
    FILE_PATHS,
    SimulationContext,
    TOOLS_ALL,
    TOOLS_HEAVY,
    TOOLS_WRITE,
)


_QUICK_FILES = [
    "src/auth/login.py",
    "src/api/handlers.py",
    "src/utils/helpers.ts",
    "tests/test_api.py",
    "src/components/Dashboard.tsx",
]

_QUICK_TASKS = [
    ("qt-01", "[PROJ-1] Fix login timeout for inactive sessions"),
    ("qt-02", "[PROJ-2] Add rate limiting to /api/v1/auth"),
    ("qt-03", "[PROJ-3] Update dashboard component styles"),
]


def _fast_agent(
    ctx: SimulationContext,
    agent_id: str,
    agent_name: str,
    task_desc: str,
) -> None:
    """Run a quick single-agent lifecycle with 2 tool uses."""
    ctx.log(f"  [{agent_name}] start: {task_desc[:40]}...")
    tokens = ctx.increment_context(input_delta=2000)
    ctx.send_event(
        "subagent_start",
        {
            "agent_id": agent_id,
            "task_description": task_desc,
            "speech_content": {"boss": "Quick, on this!", "agent": "On it!"},
            **tokens,
        },
    )

    # Shorter arrival (8s = faster visual)
    ctx.log(f"  [{agent_name}] walking to desk (8s)...")
    time.sleep(8)

    for i in range(2):
        tool = random.choice(TOOLS_HEAVY)
        fp = random.choice(_QUICK_FILES)
        tokens = ctx.increment_context(input_delta=2000, output_delta=1000)
        ctx.send_event(
            "pre_tool_use",
            {"tool_name": tool, "tool_input": {"file_path": fp}, "agent_id": agent_id, **tokens},
        )
        time.sleep(random.uniform(2.5, 4.0))
        ctx.send_event("post_tool_use", {"tool_name": tool, "tool_input": {"file_path": fp}, "agent_id": agent_id})
        time.sleep(1.0)

    ctx.send_event(
        "subagent_stop",
        {
            "agent_id": agent_id,
            "success": True,
            "speech_content": {"agent": "Done!", "boss": f"Nice, {agent_name}."},
        },
    )
    ctx.log(f"  [{agent_name}] complete.")


def run(ctx: SimulationContext) -> None:
    """Execute the quick scenario.

    Args:
        ctx: Shared simulation context.
    """
    ctx.reset(initial_fraction=0.0)
    ctx.log(f"[quick] Starting — session: {ctx.session_id}")

    ctx.send_event("session_start", {"project_name": "QuickDemo"})
    time.sleep(0.5)

    ctx.send_event(
        "user_prompt_submit",
        {"prompt": "Fix the login timeout bug and add rate limiting. Please generate a report."},
    )
    time.sleep(1)

    # Boss creates tasks (kanban)
    ctx.log("[quick] Creating kanban tasks...")
    for task_id, subject in _QUICK_TASKS:
        ctx.send_task_created(task_id, subject)
        time.sleep(0.2)

    # Initial todo list
    tokens = ctx.increment_context(input_delta=10_000, output_delta=4_000)
    ctx.send_event(
        "pre_tool_use",
        {
            "tool_name": "TodoWrite",
            "tool_input": {
                "todos": [
                    {"content": s, "status": "pending" if i > 0 else "in_progress", "activeForm": f"Working on {tid}"}
                    for i, (tid, s) in enumerate(_QUICK_TASKS)
                ]
            },
            "agent_id": "main",
            **tokens,
        },
    )
    time.sleep(1)
    ctx.send_event("post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})

    # Boss reads + edits (seeds heat map)
    for fp in _QUICK_FILES[:3]:
        tokens = ctx.increment_context(input_delta=1500, output_delta=500)
        ctx.send_event(
            "pre_tool_use",
            {"tool_name": "Read", "tool_input": {"file_path": fp}, "agent_id": "main", **tokens},
        )
        time.sleep(1.5)
        ctx.send_event("post_tool_use", {"tool_name": "Read", "tool_input": {"file_path": fp}, "agent_id": "main"})
        time.sleep(0.5)
        ctx.send_event(
            "pre_tool_use",
            {"tool_name": "Edit", "tool_input": {"file_path": fp}, "agent_id": "main"},
        )
        time.sleep(1.0)
        ctx.send_event("post_tool_use", {"tool_name": "Edit", "tool_input": {"file_path": fp}, "agent_id": "main"})
        time.sleep(0.3)

    # Permission request
    ctx.log("[quick] Permission request...")
    ctx.send_event(
        "permission_request",
        {"tool_name": "Bash", "tool_input": {"command": "iptables -L"}, "agent_id": "main"},
    )
    time.sleep(2)
    ctx.send_event("post_tool_use", {"tool_name": "Bash", "agent_id": "main", "success": True})
    time.sleep(0.5)

    # Complete first task
    ctx.send_task_completed("qt-01", _QUICK_TASKS[0][1])

    # Spawn two concurrent agents
    names = random.sample(AGENT_NAMES, 2)
    t1 = threading.Thread(
        target=_fast_agent,
        args=(ctx, "quick_agent_1", names[0], "Fix login session timeout handling"),
    )
    t2 = threading.Thread(
        target=_fast_agent,
        args=(ctx, "quick_agent_2", names[1], "Implement rate limiting middleware"),
    )
    t1.start()
    time.sleep(2)
    t2.start()
    t1.join()
    t2.join()

    ctx.send_task_completed("qt-02", _QUICK_TASKS[1][1])
    ctx.send_task_completed("qt-03", _QUICK_TASKS[2][1])

    # Final todos
    ctx.send_event(
        "pre_tool_use",
        {
            "tool_name": "TodoWrite",
            "tool_input": {
                "todos": [
                    {"content": s, "status": "completed", "activeForm": "Done"}
                    for _tid, s in _QUICK_TASKS
                ]
            },
            "agent_id": "main",
        },
    )
    time.sleep(1)
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
    time.sleep(1)

    ctx.send_event("stop", {"speech_content": {"boss_phone": "All done. Fast and clean!"}})
    time.sleep(5)
    ctx.send_event("session_end")
    ctx.log("[quick] Done.")
