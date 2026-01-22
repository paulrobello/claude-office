#!/usr/bin/env python3
"""Simulation script for Claude Office Visualizer.

This script simulates Claude Code events to exercise frontend elements:
- Agent names (creative job titles)
- Task marquees on desks
- Context utilization (trash can fill level)
- Todo whiteboard
- Tool use bubbles
- Agent lifecycle (arrival, work, departure)
"""

import random
import threading
import time
from datetime import datetime, timezone

import requests

API_URL = "http://localhost:8000/api/v1/events"
SESSION_ID = "sim_session_123"

# Context window constants
MAX_CONTEXT_TOKENS = 200000
COMPACTION_THRESHOLD = 0.80  # Trigger compaction at 80%
COMPACTION_ANIMATION_DURATION = 10  # seconds (walking + 5 jumps + walking back)

# Shared state for context tracking
context_state = {
    "input_tokens": 0,
    "output_tokens": 0,
    "lock": threading.Lock(),
    "compaction_triggered": False,  # Track if compaction has been triggered this session
    "compaction_in_progress": False,  # True while compaction animation is playing
}

# Creative agent names (short job titles like the summarizer generates)
AGENT_NAMES = [
    "Scout",
    "Fixer",
    "Builder",
    "Tester",
    "Validator",
    "Researcher",
    "Debugger",
    "Optimizer",
    "Refactorer",
    "Doc Writer",
    "Type Ninja",
    "Bug Hunter",
    "Code Sage",
    "Test Wizard",
    "Lint Master",
]

# Realistic task descriptions for marquee display
TASK_DESCRIPTIONS = [
    "Analyze authentication flow and identify security vulnerabilities in login module",
    "Refactor database queries to improve performance and reduce N+1 query issues",
    "Implement comprehensive unit tests for the payment processing service",
    "Review and update API documentation to match current implementation",
    "Migrate legacy configuration files to new YAML-based format",
    "Investigate memory leak in background job processor and apply fix",
    "Add TypeScript type annotations to frontend utility functions",
    "Optimize bundle size by implementing code splitting for large modules",
    "Set up end-to-end testing framework with Playwright for critical flows",
    "Create database migration scripts for new user preferences schema",
    "Implement rate limiting middleware to prevent API abuse",
    "Add observability with structured logging and OpenTelemetry traces",
]


def send_event(event_type: str, data: dict | None = None) -> None:
    """Send an event to the backend API."""
    payload = {
        "event_type": event_type,
        "session_id": SESSION_ID,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data or {},
    }
    try:
        response = requests.post(API_URL, json=payload, timeout=10)
        response.raise_for_status()
    except Exception as e:
        print(f"Error sending {event_type}: {e}")


def increment_context(input_delta: int = 0, output_delta: int = 0) -> dict[str, int]:
    """Increment context token counts and return current values."""
    with context_state["lock"]:
        context_state["input_tokens"] += input_delta
        context_state["output_tokens"] += output_delta
        return {
            "input_tokens": context_state["input_tokens"],
            "output_tokens": context_state["output_tokens"],
        }


def get_context_utilization() -> float:
    """Get current context utilization as a percentage (0.0 to 1.0)."""
    with context_state["lock"]:
        total = context_state["input_tokens"] + context_state["output_tokens"]
        return total / MAX_CONTEXT_TOKENS


def is_compaction_in_progress() -> bool:
    """Check if compaction animation is currently playing."""
    with context_state["lock"]:
        return context_state["compaction_in_progress"]


def check_and_trigger_compaction() -> bool:
    """Check if context has reached threshold and trigger compaction if so.

    Returns True if compaction was triggered, False otherwise.
    """
    # Check and update state under lock, but send event outside lock
    should_trigger = False
    tokens = {}
    utilization = 0.0

    with context_state["lock"]:
        if context_state["compaction_triggered"]:
            return False

        total = context_state["input_tokens"] + context_state["output_tokens"]
        utilization = total / MAX_CONTEXT_TOKENS

        if utilization >= COMPACTION_THRESHOLD:
            context_state["compaction_triggered"] = True
            context_state["compaction_in_progress"] = True
            tokens = {
                "input_tokens": context_state["input_tokens"],
                "output_tokens": context_state["output_tokens"],
            }
            should_trigger = True

            # Simulate context reduction after compaction (reduced to ~30% of original)
            context_state["input_tokens"] = int(context_state["input_tokens"] * 0.3)
            context_state["output_tokens"] = int(context_state["output_tokens"] * 0.3)

    # Send event outside lock to avoid blocking
    if should_trigger:
        print(f"*** COMPACTION TRIGGERED at {utilization:.1%} (>= {COMPACTION_THRESHOLD:.0%}) ***")
        send_event("context_compaction", tokens)
        print(f"*** Compaction event sent, context reduced to {get_context_utilization():.1%} ***")
        return True

    return False


def finish_compaction() -> None:
    """Mark compaction animation as complete."""
    with context_state["lock"]:
        context_state["compaction_in_progress"] = False


def agent_workflow(agent_id: str, agent_name: str, task_description: str, spawn_order: int) -> None:
    """Simulate a subagent's complete workflow.

    Args:
        agent_id: Unique identifier for the agent
        agent_name: Display name for the agent
        task_description: Task the agent is working on
        spawn_order: 0-based order in which this agent was spawned (affects queue wait time)
    """
    # 1. Start Subagent
    print(f"[{agent_name}] Starting: {task_description[:40]}...")

    # Increment context for agent creation (reduced to prevent 100% after compaction)
    tokens = increment_context(input_delta=random.randint(2000, 4000))
    util = get_context_utilization()
    print(f"[{agent_name}] Spawned, context now at {util:.1%}")

    send_event(
        "subagent_start",
        {
            "agent_id": agent_id,
            # Don't send agent_name - let AI generate from task_description
            "task_description": task_description,
            "speech_content": {
                "boss": "Welcome! Please get started.",
                "agent": "On it!",
            },
            **tokens,
        },
    )

    # Check compaction after spawn
    if check_and_trigger_compaction():
        print(f"  [{agent_name}] Waiting for compaction animation...")
        time.sleep(COMPACTION_ANIMATION_DURATION)
        finish_compaction()

    # Wait for arrival animation based on queue position
    # Base time: ~20s for elevator → queue → boss conversation → walk to desk
    # Additional time: ~12s per agent ahead in queue (they need to finish their conversation first)
    base_arrival_time = 20
    queue_wait_per_agent = 12
    total_arrival_time = base_arrival_time + (spawn_order * queue_wait_per_agent)
    print(f"[{agent_name}] Waiting {total_arrival_time}s to reach desk (queue position {spawn_order + 1})...")
    time.sleep(total_arrival_time)

    # 2. Variable amount of work
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

        # Increment context for tool input
        tokens = increment_context(
            input_delta=random.randint(2000, 4000), output_delta=random.randint(1000, 2000)
        )
        util = get_context_utilization()
        print(f"[{agent_name}] Tool {tool_num+1}/{num_tools} ({tool}), context: {util:.1%}")

        send_event(
            "pre_tool_use",
            {
                "tool_name": tool,
                "tool_input": {"file_path": file_path, "command": "pytest -v"},
                "agent_id": agent_id,
                **tokens,
            },
        )

        # Check if compaction should be triggered
        if check_and_trigger_compaction():
            print(f"  [{agent_name}] Waiting for compaction animation...")
            time.sleep(COMPACTION_ANIMATION_DURATION)
            finish_compaction()

        # Random work time
        time.sleep(random.uniform(3.0, 6.0))

        # Increment context for tool output
        tokens = increment_context(output_delta=random.randint(1000, 3000))

        send_event(
            "post_tool_use",
            {
                "tool_name": tool,
                "tool_input": {"file_path": file_path},
                "agent_id": agent_id,
                **tokens,
            },
        )

        # Check if compaction should be triggered after tool output
        if check_and_trigger_compaction():
            print(f"  [{agent_name}] Waiting for compaction animation...")
            time.sleep(COMPACTION_ANIMATION_DURATION)
            finish_compaction()

        # Gap between tools
        time.sleep(random.uniform(1.0, 2.5))

    # 3. Finish work
    print(f"{agent_name} finished all tasks.")
    tokens = increment_context(output_delta=random.randint(500, 1000))

    send_event(
        "subagent_stop",
        {
            "agent_id": agent_id,
            "success": True,
            "speech_content": {
                "agent": "Task complete!",
                "boss": f"Good work, {agent_name}.",
            },
            **tokens,
        },
    )


def simulate() -> None:
    """Run the full simulation."""
    # Reset context state - start at 35% so compaction triggers after all agents are working
    # Timeline: initial setup (~66%) -> agent spawns (~72%) -> agent work -> compaction at 80%
    initial_tokens = int(MAX_CONTEXT_TOKENS * 0.35)  # 35% = 70,000 tokens
    context_state["input_tokens"] = initial_tokens
    context_state["output_tokens"] = 0
    context_state["compaction_triggered"] = False
    context_state["compaction_in_progress"] = False

    print(f"Starting at {get_context_utilization():.1%} context ({initial_tokens:,} tokens)")

    # 1. Session Start
    print(f"Starting simulation for session: {SESSION_ID}")
    send_event("session_start", {"project_name": "Simulation"})
    time.sleep(1)

    # 1.5. User prompt - includes "report" keyword to trigger printer animation
    print("Sending user prompt (will trigger printer on session end)...")
    send_event(
        "user_prompt_submit",
        {
            "prompt": "Please implement the new feature based on PRD.md and generate a report documenting the changes made."
        },
    )
    time.sleep(2)

    # 2. Main Agent starts working - create initial todo list
    # Use larger token amounts to build context toward 80% threshold
    tokens = increment_context(input_delta=25000, output_delta=10000)
    send_event(
        "pre_tool_use",
        {
            "tool_name": "TodoWrite",
            "tool_input": {
                "todos": [
                    {
                        "content": "Review PRD.md",
                        "status": "in_progress",
                        "activeForm": "Reviewing PRD",
                    },
                    {
                        "content": "Implement feature A",
                        "status": "pending",
                        "activeForm": "Implementing feature A",
                    },
                    {
                        "content": "Implement feature B",
                        "status": "pending",
                        "activeForm": "Implementing feature B",
                    },
                    {
                        "content": "Write unit tests",
                        "status": "pending",
                        "activeForm": "Writing tests",
                    },
                    {
                        "content": "Run integration tests",
                        "status": "pending",
                        "activeForm": "Running integration tests",
                    },
                    {
                        "content": "Deploy to staging",
                        "status": "pending",
                        "activeForm": "Deploying to staging",
                    },
                ]
            },
            "agent_id": "main",
            **tokens,
        },
    )
    time.sleep(1)
    send_event("post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})

    tokens = increment_context(input_delta=15000, output_delta=8000)
    send_event(
        "pre_tool_use",
        {
            "tool_name": "Read",
            "tool_input": {"file_path": "PRD.md"},
            "agent_id": "main",
            **tokens,
        },
    )
    time.sleep(2)
    send_event("post_tool_use", {"tool_name": "Read", "tool_input": {"file_path": "PRD.md"}, "agent_id": "main"})
    print(f"Initial context: {get_context_utilization():.1%}")

    # Check if we should trigger compaction after initial setup
    check_and_trigger_compaction()

    # Boss makes some edits to kickstart heat map data
    edit_files = [
        "src/components/Feature.tsx",
        "src/api/endpoints.py",
        "src/components/Feature.tsx",  # Edit same file twice
        "config/settings.yaml",
        "src/utils/helpers.ts",
    ]
    for edit_file in edit_files:
        tokens = increment_context(input_delta=500, output_delta=200)
        send_event(
            "pre_tool_use",
            {
                "tool_name": "Edit",
                "tool_input": {"file_path": edit_file},
                "agent_id": "main",
                **tokens,
            },
        )
        time.sleep(0.5)
        send_event(
            "post_tool_use",
            {"tool_name": "Edit", "tool_input": {"file_path": edit_file}, "agent_id": "main"},
        )
        time.sleep(0.3)

    # 3. Launch subagents with offset starts
    threads = []
    num_agents = 4
    print(f"Spawning {num_agents} agents...")

    # Shuffle and pick unique names and tasks
    available_names = random.sample(AGENT_NAMES, min(num_agents, len(AGENT_NAMES)))
    available_tasks = random.sample(
        TASK_DESCRIPTIONS, min(num_agents, len(TASK_DESCRIPTIONS))
    )

    for i in range(num_agents):
        agent_name = available_names[i] if i < len(available_names) else f"Agent {i+1}"
        task_desc = (
            available_tasks[i]
            if i < len(available_tasks)
            else f"Processing module {i+1}"
        )

        t = threading.Thread(
            target=agent_workflow,
            args=(f"subagent_{i+1}", agent_name, task_desc, i),  # i = spawn_order
        )
        threads.append(t)
        t.start()
        # Staggered entry
        time.sleep(random.uniform(2.0, 4.0))

    # 4. Boss occasionally does things while they work, updating todos
    todo_states = [
        # State after feature A done, starting feature B
        [
            {
                "content": "Review PRD.md",
                "status": "completed",
                "activeForm": "Reviewing PRD",
            },
            {
                "content": "Implement feature A",
                "status": "completed",
                "activeForm": "Implementing feature A",
            },
            {
                "content": "Implement feature B",
                "status": "in_progress",
                "activeForm": "Implementing feature B",
            },
            {
                "content": "Write unit tests",
                "status": "pending",
                "activeForm": "Writing tests",
            },
            {
                "content": "Run integration tests",
                "status": "pending",
                "activeForm": "Running integration tests",
            },
            {
                "content": "Deploy to staging",
                "status": "pending",
                "activeForm": "Deploying to staging",
            },
        ],
        # State after feature B done, starting tests
        [
            {
                "content": "Review PRD.md",
                "status": "completed",
                "activeForm": "Reviewing PRD",
            },
            {
                "content": "Implement feature A",
                "status": "completed",
                "activeForm": "Implementing feature A",
            },
            {
                "content": "Implement feature B",
                "status": "completed",
                "activeForm": "Implementing feature B",
            },
            {
                "content": "Write unit tests",
                "status": "in_progress",
                "activeForm": "Writing tests",
            },
            {
                "content": "Run integration tests",
                "status": "pending",
                "activeForm": "Running integration tests",
            },
            {
                "content": "Deploy to staging",
                "status": "pending",
                "activeForm": "Deploying to staging",
            },
        ],
        # State after tests, starting integration
        [
            {
                "content": "Review PRD.md",
                "status": "completed",
                "activeForm": "Reviewing PRD",
            },
            {
                "content": "Implement feature A",
                "status": "completed",
                "activeForm": "Implementing feature A",
            },
            {
                "content": "Implement feature B",
                "status": "completed",
                "activeForm": "Implementing feature B",
            },
            {
                "content": "Write unit tests",
                "status": "completed",
                "activeForm": "Writing tests",
            },
            {
                "content": "Run integration tests",
                "status": "in_progress",
                "activeForm": "Running integration tests",
            },
            {
                "content": "Deploy to staging",
                "status": "pending",
                "activeForm": "Deploying to staging",
            },
        ],
    ]

    # Boss occasionally does a Read while agents work (no TodoWrite spam)
    for i, todo_state in enumerate(todo_states):
        time.sleep(8)

        # Skip boss events during compaction animation
        if is_compaction_in_progress():
            print("  [Boss] Skipping boss events during compaction...")
            continue

        # Boss does work with moderate token amounts
        tokens = increment_context(input_delta=2000, output_delta=1000)
        send_event(
            "pre_tool_use",
            {
                "tool_name": "Read",
                "tool_input": {"file_path": "backend/app/main.py"},
                "agent_id": "main",
                **tokens,
            },
        )

        # Check if compaction should be triggered
        if check_and_trigger_compaction():
            print("  [Boss] Waiting for compaction animation...")
            time.sleep(COMPACTION_ANIMATION_DURATION)
            finish_compaction()
            continue  # Skip TodoWrite after compaction

        time.sleep(2)
        send_event("post_tool_use", {"tool_name": "Read", "tool_input": {"file_path": "backend/app/main.py"}, "agent_id": "main"})

        # Only update todos on the last iteration to reduce spam
        if i == len(todo_states) - 1:
            send_event(
                "pre_tool_use",
                {
                    "tool_name": "TodoWrite",
                    "tool_input": {"todos": todo_state},
                    "agent_id": "main",
                },
            )
            time.sleep(1)
            send_event("post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})

    # Wait for all agents to finish and leave
    for t in threads:
        t.join()

    # Brief pause before completion
    print("Waiting briefly before completion...")
    time.sleep(5)

    # Final todo update - all complete
    send_event(
        "pre_tool_use",
        {
            "tool_name": "TodoWrite",
            "tool_input": {
                "todos": [
                    {
                        "content": "Review PRD.md",
                        "status": "completed",
                        "activeForm": "Reviewing PRD",
                    },
                    {
                        "content": "Implement feature A",
                        "status": "completed",
                        "activeForm": "Implementing feature A",
                    },
                    {
                        "content": "Implement feature B",
                        "status": "completed",
                        "activeForm": "Implementing feature B",
                    },
                    {
                        "content": "Write unit tests",
                        "status": "completed",
                        "activeForm": "Writing tests",
                    },
                    {
                        "content": "Run integration tests",
                        "status": "completed",
                        "activeForm": "Running integration tests",
                    },
                    {
                        "content": "Deploy to staging",
                        "status": "completed",
                        "activeForm": "Deploying to staging",
                    },
                ]
            },
            "agent_id": "main",
        },
    )
    time.sleep(1)
    send_event("post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})
    time.sleep(3)

    # 5. Stop - include explicit completion message for boss phone bubble
    print("*** SENDING STOP EVENT with completion message ***")
    send_event(
        "stop",
        {
            "speech_content": {
                "boss_phone": "All tasks completed successfully! Great work everyone.",
            }
        },
    )
    print("*** STOP EVENT SENT - waiting 10s for bubble to display ***")
    time.sleep(10)  # Give frontend more time to display the completion message

    # 6. Session End
    send_event("session_end")

    # Print final stats
    final_tokens = increment_context()
    total = final_tokens["input_tokens"] + final_tokens["output_tokens"]
    max_context = 200000  # MAX_CONTEXT_TOKENS
    print(f"Simulation complete. Final context: {total:,} tokens ({total/max_context:.1%})")


if __name__ == "__main__":
    simulate()
