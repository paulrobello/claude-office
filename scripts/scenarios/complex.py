"""Complex simulation scenario.

Exercises the full multi-agent workflow from the original simulate_events.py:
1. Session starts at 35% context so compaction triggers during agent work.
2. Boss creates a todo list and reads the PRD.
3. Boss makes several file edits to seed the heat-map.
4. Four subagents spawn in staggered fashion and work concurrently.
5. Boss updates todos while agents work.
6. Context compaction fires automatically when threshold is reached.
7. Background task notifications arrive after agents finish.
8. All todos are marked complete and the session ends.

This is the richest scenario and exercises the most visual elements.
"""

from __future__ import annotations

import random
import threading
import time

from scripts.scenarios._base import (
    AGENT_NAMES,
    COMPACTION_ANIMATION_DURATION,
    SimulationContext,
    TASK_DESCRIPTIONS,
)


def _agent_workflow(
    ctx: SimulationContext,
    agent_id: str,
    agent_name: str,
    task_description: str,
    spawn_order: int,
) -> None:
    """Simulate a subagent's complete lifecycle.

    Args:
        ctx: Shared simulation context.
        agent_id: Unique identifier for this agent.
        agent_name: Display name shown in the office.
        task_description: The task the agent is working on.
        spawn_order: 0-based index used to calculate queue wait time.
    """
    ctx.log(f"[{agent_name}] Starting: {task_description[:40]}...")

    tokens = ctx.increment_context(input_delta=random.randint(2000, 4000))
    util = ctx.get_context_utilization()
    ctx.log(f"[{agent_name}] Spawned, context now at {util:.1%}")

    ctx.send_event(
        "subagent_start",
        {
            "agent_id": agent_id,
            "task_description": task_description,
            "speech_content": {"boss": "Welcome! Please get started.", "agent": "On it!"},
            **tokens,
        },
    )

    if ctx.check_and_trigger_compaction():
        ctx.log(f"  [{agent_name}] Waiting for compaction animation...")
        time.sleep(COMPACTION_ANIMATION_DURATION)
        ctx.finish_compaction()

    # Arrival time grows with queue position
    base_arrival_time = 20
    queue_wait_per_agent = 12
    total_arrival_time = base_arrival_time + (spawn_order * queue_wait_per_agent)
    ctx.log(
        f"[{agent_name}] Waiting {total_arrival_time}s to reach desk "
        f"(queue position {spawn_order + 1})..."
    )
    time.sleep(total_arrival_time)

    # Variable tool use
    num_tools = random.randint(3, 5)
    tools = ["Read", "Edit", "Bash", "Glob", "Grep", "Write"]
    file_paths = [
        "src/auth/login.py",
        "src/api/handlers.py",
        "src/db/queries.py",
        "tests/test_api.py",
        "config/settings.yaml",
        "src/utils/helpers.ts",
    ]

    for tool_num in range(num_tools):
        tool = random.choice(tools)
        file_path = random.choice(file_paths)

        tokens = ctx.increment_context(
            input_delta=random.randint(2000, 4000),
            output_delta=random.randint(1000, 2000),
        )
        util = ctx.get_context_utilization()
        ctx.log(f"[{agent_name}] Tool {tool_num + 1}/{num_tools} ({tool}), context: {util:.1%}")

        ctx.send_event(
            "pre_tool_use",
            {
                "tool_name": tool,
                "tool_input": {"file_path": file_path, "command": "pytest -v"},
                "agent_id": agent_id,
                **tokens,
            },
        )

        if ctx.check_and_trigger_compaction():
            ctx.log(f"  [{agent_name}] Waiting for compaction animation...")
            time.sleep(COMPACTION_ANIMATION_DURATION)
            ctx.finish_compaction()

        time.sleep(random.uniform(3.0, 6.0))

        tokens = ctx.increment_context(output_delta=random.randint(1000, 3000))
        ctx.send_event(
            "post_tool_use",
            {"tool_name": tool, "tool_input": {"file_path": file_path}, "agent_id": agent_id, **tokens},
        )

        if ctx.check_and_trigger_compaction():
            ctx.log(f"  [{agent_name}] Waiting for compaction animation...")
            time.sleep(COMPACTION_ANIMATION_DURATION)
            ctx.finish_compaction()

        time.sleep(random.uniform(1.0, 2.5))

    # Finish
    ctx.log(f"{agent_name} finished all tasks.")
    tokens = ctx.increment_context(output_delta=random.randint(500, 1000))
    ctx.send_event(
        "subagent_stop",
        {
            "agent_id": agent_id,
            "success": True,
            "speech_content": {"agent": "Task complete!", "boss": f"Good work, {agent_name}."},
            **tokens,
        },
    )


# ---------------------------------------------------------------------------
# Todo state snapshots used by the boss while agents work
# ---------------------------------------------------------------------------

_TODO_STATES = [
    # After feature A done, B in progress
    [
        {"content": "Review PRD.md", "status": "completed", "activeForm": "Reviewing PRD"},
        {"content": "Implement feature A", "status": "completed", "activeForm": "Implementing feature A"},
        {"content": "Implement feature B", "status": "in_progress", "activeForm": "Implementing feature B"},
        {"content": "Write unit tests", "status": "pending", "activeForm": "Writing tests"},
        {"content": "Run integration tests", "status": "pending", "activeForm": "Running integration tests"},
        {"content": "Deploy to staging", "status": "pending", "activeForm": "Deploying to staging"},
    ],
    # After feature B done, writing tests
    [
        {"content": "Review PRD.md", "status": "completed", "activeForm": "Reviewing PRD"},
        {"content": "Implement feature A", "status": "completed", "activeForm": "Implementing feature A"},
        {"content": "Implement feature B", "status": "completed", "activeForm": "Implementing feature B"},
        {"content": "Write unit tests", "status": "in_progress", "activeForm": "Writing tests"},
        {"content": "Run integration tests", "status": "pending", "activeForm": "Running integration tests"},
        {"content": "Deploy to staging", "status": "pending", "activeForm": "Deploying to staging"},
    ],
    # Running integration tests
    [
        {"content": "Review PRD.md", "status": "completed", "activeForm": "Reviewing PRD"},
        {"content": "Implement feature A", "status": "completed", "activeForm": "Implementing feature A"},
        {"content": "Implement feature B", "status": "completed", "activeForm": "Implementing feature B"},
        {"content": "Write unit tests", "status": "completed", "activeForm": "Writing tests"},
        {"content": "Run integration tests", "status": "in_progress", "activeForm": "Running integration tests"},
        {"content": "Deploy to staging", "status": "pending", "activeForm": "Deploying to staging"},
    ],
]

_TODO_FINAL = [
    {"content": "Review PRD.md", "status": "completed", "activeForm": "Reviewing PRD"},
    {"content": "Implement feature A", "status": "completed", "activeForm": "Implementing feature A"},
    {"content": "Implement feature B", "status": "completed", "activeForm": "Implementing feature B"},
    {"content": "Write unit tests", "status": "completed", "activeForm": "Writing tests"},
    {"content": "Run integration tests", "status": "completed", "activeForm": "Running integration tests"},
    {"content": "Deploy to staging", "status": "completed", "activeForm": "Deploying to staging"},
]

_BACKGROUND_TASKS = [
    {"task_id": "bg_task_a1b2c3d4", "status": "completed", "summary": "Linting codebase with ruff"},
    {"task_id": "bg_task_e5f6g7h8", "status": "completed", "summary": "Running type checks with pyright"},
    {"task_id": "bg_task_i9j0k1l2", "status": "failed", "summary": "Deploy to production failed"},
    {"task_id": "bg_task_m3n4o5p6", "status": "completed", "summary": "Generated API documentation"},
]


def run(ctx: SimulationContext) -> None:
    """Execute the complex multi-agent scenario against *ctx*.

    Args:
        ctx: Shared simulation context (session_id, token state, etc.).
    """
    # Start at 35% so compaction triggers naturally during agent work
    ctx.reset(initial_fraction=0.35)
    ctx.log(
        f"[complex] Starting at {ctx.get_context_utilization():.1%} context "
        f"({ctx.input_tokens:,} tokens)"
    )

    ctx.log(f"[complex] Session start: {ctx.session_id}")
    ctx.send_event("session_start", {"project_name": "Simulation"})
    time.sleep(1)

    # User prompt with report keyword to trigger printer animation
    ctx.log("[complex] Sending user prompt...")
    ctx.send_event(
        "user_prompt_submit",
        {"prompt": "Please implement the new feature based on PRD.md and generate a report documenting the changes made."},
    )
    time.sleep(2)

    # Initial todo list
    tokens = ctx.increment_context(input_delta=25_000, output_delta=10_000)
    ctx.send_event(
        "pre_tool_use",
        {
            "tool_name": "TodoWrite",
            "tool_input": {
                "todos": [
                    {"content": "Review PRD.md", "status": "in_progress", "activeForm": "Reviewing PRD"},
                    {"content": "Implement feature A", "status": "pending", "activeForm": "Implementing feature A"},
                    {"content": "Implement feature B", "status": "pending", "activeForm": "Implementing feature B"},
                    {"content": "Write unit tests", "status": "pending", "activeForm": "Writing tests"},
                    {"content": "Run integration tests", "status": "pending", "activeForm": "Running integration tests"},
                    {"content": "Deploy to staging", "status": "pending", "activeForm": "Deploying to staging"},
                ]
            },
            "agent_id": "main",
            **tokens,
        },
    )
    time.sleep(1)
    ctx.send_event("post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})

    # Boss reads PRD
    tokens = ctx.increment_context(input_delta=15_000, output_delta=8_000)
    ctx.send_event(
        "pre_tool_use",
        {"tool_name": "Read", "tool_input": {"file_path": "PRD.md"}, "agent_id": "main", **tokens},
    )
    time.sleep(2)
    ctx.send_event(
        "post_tool_use",
        {"tool_name": "Read", "tool_input": {"file_path": "PRD.md"}, "agent_id": "main"},
    )
    ctx.log(f"[complex] Initial context: {ctx.get_context_utilization():.1%}")
    ctx.check_and_trigger_compaction()

    # Boss edits to seed heat-map data
    edit_files = [
        "src/components/Feature.tsx",
        "src/api/endpoints.py",
        "src/components/Feature.tsx",  # Same file twice
        "config/settings.yaml",
        "src/utils/helpers.ts",
    ]
    for edit_file in edit_files:
        tokens = ctx.increment_context(input_delta=500, output_delta=200)
        ctx.send_event(
            "pre_tool_use",
            {"tool_name": "Edit", "tool_input": {"file_path": edit_file}, "agent_id": "main", **tokens},
        )
        time.sleep(0.5)
        ctx.send_event(
            "post_tool_use",
            {"tool_name": "Edit", "tool_input": {"file_path": edit_file}, "agent_id": "main"},
        )
        time.sleep(0.3)

    # Spawn four agents with staggered starts
    num_agents = 4
    ctx.log(f"[complex] Spawning {num_agents} agents...")
    available_names = random.sample(AGENT_NAMES, min(num_agents, len(AGENT_NAMES)))
    available_tasks = random.sample(TASK_DESCRIPTIONS, min(num_agents, len(TASK_DESCRIPTIONS)))

    threads: list[threading.Thread] = []
    for i in range(num_agents):
        agent_name = available_names[i] if i < len(available_names) else f"Agent {i + 1}"
        task_desc = available_tasks[i] if i < len(available_tasks) else f"Processing module {i + 1}"
        t = threading.Thread(
            target=_agent_workflow,
            args=(ctx, f"subagent_{i + 1}", agent_name, task_desc, i),
        )
        threads.append(t)
        t.start()
        time.sleep(random.uniform(2.0, 4.0))

    # Boss does periodic reads and todo updates while agents work
    for i, todo_state in enumerate(_TODO_STATES):
        time.sleep(8)

        if ctx.is_compaction_in_progress():
            ctx.log("  [Boss] Skipping events during compaction...")
            continue

        tokens = ctx.increment_context(input_delta=2000, output_delta=1000)
        ctx.send_event(
            "pre_tool_use",
            {"tool_name": "Read", "tool_input": {"file_path": "backend/app/main.py"}, "agent_id": "main", **tokens},
        )

        if ctx.check_and_trigger_compaction():
            ctx.log("  [Boss] Waiting for compaction animation...")
            time.sleep(COMPACTION_ANIMATION_DURATION)
            ctx.finish_compaction()
            continue

        time.sleep(2)
        ctx.send_event(
            "post_tool_use",
            {"tool_name": "Read", "tool_input": {"file_path": "backend/app/main.py"}, "agent_id": "main"},
        )

        # Only update todos on the last pass to reduce spam
        if i == len(_TODO_STATES) - 1:
            ctx.send_event(
                "pre_tool_use",
                {"tool_name": "TodoWrite", "tool_input": {"todos": todo_state}, "agent_id": "main"},
            )
            time.sleep(1)
            ctx.send_event("post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})

    for t in threads:
        t.join()

    ctx.log("[complex] All agents finished. Waiting briefly...")
    time.sleep(5)

    # Background task notifications
    ctx.log("[complex] Simulating background task notifications...")
    for task in _BACKGROUND_TASKS:
        ctx.send_event(
            "background_task_notification",
            {
                "background_task_id": task["task_id"],
                "background_task_status": task["status"],
                "background_task_summary": task["summary"],
                "background_task_output_file": f"/tmp/{task['task_id']}.output",
            },
        )
        time.sleep(1.5)

    # Final todos — all complete
    ctx.send_event(
        "pre_tool_use",
        {"tool_name": "TodoWrite", "tool_input": {"todos": _TODO_FINAL}, "agent_id": "main"},
    )
    time.sleep(1)
    ctx.send_event("post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})
    time.sleep(3)

    ctx.log("[complex] *** SENDING STOP EVENT ***")
    ctx.send_event("stop", {"speech_content": {"boss_phone": "All tasks completed successfully! Great work everyone."}})
    ctx.log("[complex] *** STOP EVENT SENT — waiting 10s for bubble to display ***")
    time.sleep(10)

    ctx.send_event("session_end")

    final_tokens = ctx.input_tokens + ctx.output_tokens
    ctx.log(
        f"[complex] Simulation complete. Final context: "
        f"{final_tokens:,} tokens ({final_tokens / 200_000:.1%})"
    )
