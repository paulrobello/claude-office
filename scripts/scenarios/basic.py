"""Basic simulation scenario.

Exercises the minimal happy-path:
1. Session starts.
2. Boss receives a user prompt.
3. Boss reads a file and makes an edit.
4. A single subagent is spawned, does a few tool uses, then completes.
5. Session ends.

This scenario completes quickly (~60 s) and is useful for verifying
that the fundamental agent lifecycle is correctly visualised.
"""

from __future__ import annotations

import random
import time
import threading

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
) -> None:
    """Run a single subagent's complete lifecycle.

    Args:
        ctx: Shared simulation context.
        agent_id: Unique identifier for this agent.
        agent_name: Display name shown in the office.
        task_description: The task the agent is working on.
    """
    ctx.log(f"[{agent_name}] Starting: {task_description[:50]}...")

    tokens = ctx.increment_context(input_delta=random.randint(2000, 4000))
    ctx.log(f"[{agent_name}] Spawned, context at {ctx.get_context_utilization():.1%}")

    ctx.send_event(
        "subagent_start",
        {
            "agent_id": agent_id,
            "task_description": task_description,
            "speech_content": {"boss": "Welcome! Get started.", "agent": "On it!"},
            **tokens,
        },
    )

    if ctx.check_and_trigger_compaction():
        ctx.log(f"[{agent_name}] Waiting for compaction animation...")
        time.sleep(COMPACTION_ANIMATION_DURATION)
        ctx.finish_compaction()

    # Wait for arrival animation (single agent — no queue)
    arrival_time = 20
    ctx.log(f"[{agent_name}] Walking to desk ({arrival_time}s)...")
    time.sleep(arrival_time)

    # A small number of tool uses
    tools = ["Read", "Edit", "Bash"]
    file_paths = ["src/auth/login.py", "src/api/handlers.py", "tests/test_api.py"]
    num_tools = random.randint(2, 3)

    for tool_num in range(num_tools):
        tool = random.choice(tools)
        file_path = random.choice(file_paths)

        tokens = ctx.increment_context(
            input_delta=random.randint(2000, 4000),
            output_delta=random.randint(1000, 2000),
        )
        ctx.log(
            f"[{agent_name}] Tool {tool_num + 1}/{num_tools} ({tool}), "
            f"context: {ctx.get_context_utilization():.1%}"
        )
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
            ctx.log(f"[{agent_name}] Waiting for compaction animation...")
            time.sleep(COMPACTION_ANIMATION_DURATION)
            ctx.finish_compaction()

        time.sleep(random.uniform(3.0, 5.0))

        tokens = ctx.increment_context(output_delta=random.randint(1000, 2000))
        ctx.send_event(
            "post_tool_use",
            {"tool_name": tool, "tool_input": {"file_path": file_path}, "agent_id": agent_id, **tokens},
        )
        time.sleep(random.uniform(1.0, 2.0))

    # Complete
    ctx.log(f"[{agent_name}] Finished all tasks.")
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


def run(ctx: SimulationContext) -> None:
    """Execute the basic scenario against *ctx*.

    Args:
        ctx: Shared simulation context (session_id, token state, etc.).
    """
    ctx.reset(initial_fraction=0.0)
    ctx.log(f"[basic] Starting at {ctx.get_context_utilization():.1%} context")

    # Session start
    ctx.log(f"[basic] Session start: {ctx.session_id}")
    ctx.send_event("session_start", {"project_name": "BasicSimulation"})
    time.sleep(1)

    # User prompt
    ctx.send_event(
        "user_prompt_submit",
        {"prompt": "Please review login.py and fix any obvious issues."},
    )
    time.sleep(1)

    # Boss reads a file
    tokens = ctx.increment_context(input_delta=15_000, output_delta=5_000)
    ctx.send_event(
        "pre_tool_use",
        {"tool_name": "Read", "tool_input": {"file_path": "src/auth/login.py"}, "agent_id": "main", **tokens},
    )
    time.sleep(2)
    ctx.send_event(
        "post_tool_use",
        {"tool_name": "Read", "tool_input": {"file_path": "src/auth/login.py"}, "agent_id": "main"},
    )

    # Boss delegates to one agent
    agent_name = random.choice(AGENT_NAMES)
    task_desc = random.choice(TASK_DESCRIPTIONS)

    t = threading.Thread(
        target=_agent_workflow,
        args=(ctx, "subagent_1", agent_name, task_desc),
    )
    t.start()
    t.join()

    time.sleep(3)

    # Stop
    ctx.send_event("stop", {"speech_content": {"boss_phone": "Great work! All done."}})
    time.sleep(5)

    # Session end
    ctx.send_event("session_end")

    final_util = ctx.get_context_utilization()
    ctx.log(f"[basic] Simulation complete. Final context: {final_util:.1%}")
