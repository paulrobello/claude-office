"""Agent Teams simulation scenario.

Exercises all Phase 4 features:
- Lead session coordinating 3 teammate sessions (implementer, reviewer, tester)
- TaskCreated / TaskCompleted events that populate the kanban board
- Linear issue IDs ([REC-xxx]) in task subjects
- TeammateIdle events when each teammate finishes
- Subagents spawned from both the lead and teammate sessions
- Context compaction in the lead session
- Background task notifications
- Permission requests and tool errors

Each session runs in its own thread and sends events with team_name so
the RoomOrchestrator merges them into a single room view.

Total runtime: ~3-4 minutes.
"""

from __future__ import annotations

import random
import threading
import time

from scripts.scenarios._base import (
    AGENT_NAMES,
    COMPACTION_ANIMATION_DURATION,
    FILE_PATHS,
    SimulationContext,
    TOOLS_ALL,
    TOOLS_HEAVY,
    TOOLS_WRITE,
)

TEAM_NAME = "sim-team"
PROJECT_NAME = "Recepthor"

# Linear-style task IDs for the kanban board
_LEAD_TASKS = [
    ("task-lead-01", "[REC-101] Orchestrate auth refactor across all services"),
    ("task-lead-02", "[REC-102] Review security audit report and plan mitigations"),
    ("task-lead-03", "[REC-103] Coordinate database migration with ops team"),
]

_IMPL_TASKS = [
    ("task-impl-01", "[REC-104] Implement JWT refresh token rotation"),
    ("task-impl-02", "[REC-105] Refactor OAuth2 provider integration"),
    ("task-impl-03", "[REC-106] Add PKCE flow support to auth client"),
    ("task-impl-04", "[REC-107] Update session middleware for new token format"),
]

_REVIEW_TASKS = [
    ("task-rev-01", "[REC-108] Review auth module changes for security issues"),
    ("task-rev-02", "[REC-109] Audit new token rotation logic"),
    ("task-rev-03", "[REC-110] Verify OAuth2 scopes are correctly enforced"),
]

_TEST_TASKS = [
    ("task-test-01", "[REC-111] Write unit tests for JWT rotation"),
    ("task-test-02", "[REC-112] Add integration tests for OAuth2 flows"),
    ("task-test-03", "[REC-113] Load test auth endpoints under 1k rps"),
    ("task-test-04", "[REC-114] Add end-to-end test for session expiry"),
]

_AUTH_FILES = [
    "src/auth/jwt.py",
    "src/auth/oauth2.py",
    "src/auth/session.py",
    "src/middleware/auth.py",
    "tests/test_jwt.py",
    "tests/test_oauth2.py",
    "src/api/auth_routes.py",
    "docs/auth-architecture.md",
    "src/models/token.py",
    "config/oauth_providers.yaml",
]


def _tool_cycle(
    ctx: SimulationContext,
    agent_label: str,
    tools: list[str],
    files: list[str],
    num_tools: int,
    pause_range: tuple[float, float] = (2.0, 5.0),
    agent_id: str = "main",
) -> None:
    """Send a sequence of pre/post tool use events for a session."""
    for i in range(num_tools):
        tool = random.choice(tools)
        file_path = random.choice(files)

        tokens = ctx.increment_context(
            input_delta=random.randint(1500, 3500),
            output_delta=random.randint(800, 2000),
        )
        ctx.log(f"  [{agent_label}] tool {i + 1}/{num_tools}: {tool} ({file_path})")

        ctx.send_event(
            "pre_tool_use",
            {
                "tool_name": tool,
                "tool_input": {"file_path": file_path},
                "agent_id": agent_id,
                **tokens,
            },
        )

        if ctx.check_and_trigger_compaction():
            ctx.log(f"  [{agent_label}] Compaction triggered, waiting...")
            time.sleep(COMPACTION_ANIMATION_DURATION)
            ctx.finish_compaction()

        time.sleep(random.uniform(*pause_range))

        ctx.send_event(
            "post_tool_use",
            {"tool_name": tool, "tool_input": {"file_path": file_path}, "agent_id": agent_id},
        )
        time.sleep(random.uniform(0.5, 1.5))


def _subagent_lifecycle(
    ctx: SimulationContext,
    agent_id: str,
    agent_name: str,
    task_desc: str,
    spawn_order: int,
    tools: list[str],
    files: list[str],
    num_tools: int = 3,
) -> None:
    """Simulate a subagent spawning, working, and completing."""
    ctx.log(f"    [{agent_name}] spawning for: {task_desc[:45]}...")
    tokens = ctx.increment_context(input_delta=random.randint(1500, 3000))
    ctx.send_event(
        "subagent_start",
        {
            "agent_id": agent_id,
            "task_description": task_desc,
            "speech_content": {"boss": "Get started on this.", "agent": "On it!"},
            **tokens,
        },
    )

    # Queue arrival wait (shorter than original for faster simulation)
    arrival_time = 12 + (spawn_order * 8)
    ctx.log(f"    [{agent_name}] walking to desk ({arrival_time}s)...")
    time.sleep(arrival_time)

    _tool_cycle(ctx, agent_name, tools, files, num_tools, pause_range=(2.5, 5.0), agent_id=agent_id)

    tokens = ctx.increment_context(output_delta=random.randint(500, 1000))
    ctx.send_event(
        "subagent_stop",
        {
            "agent_id": agent_id,
            "success": True,
            "speech_content": {"agent": "Done!", "boss": f"Thanks, {agent_name}."},
            **tokens,
        },
    )
    ctx.log(f"    [{agent_name}] complete.")


# ---------------------------------------------------------------------------
# Lead session
# ---------------------------------------------------------------------------

def _run_lead(ctx: SimulationContext) -> None:
    """Lead: orchestrates the team, creates tasks, spawns a research subagent."""
    ctx.reset(initial_fraction=0.30)
    ctx.log(f"\n[LEAD] Session start (context: {ctx.get_context_utilization():.1%})")

    ctx.send_event("session_start", {"project_name": PROJECT_NAME})
    time.sleep(0.5)

    ctx.send_event(
        "user_prompt_submit",
        {"prompt": "Orchestrate the auth refactor. Delegate to the team and track progress."},
    )
    time.sleep(1)

    # Create all lead tasks on the kanban board
    ctx.log("[LEAD] Creating kanban tasks...")
    for task_id, subject in _LEAD_TASKS:
        ctx.send_task_created(task_id, subject)
        time.sleep(0.3)

    # Initial todo list
    tokens = ctx.increment_context(input_delta=20_000, output_delta=8_000)
    ctx.send_event(
        "pre_tool_use",
        {
            "tool_name": "TodoWrite",
            "tool_input": {
                "todos": [
                    {"content": subject, "status": "pending", "activeForm": f"Working on {task_id}"}
                    for task_id, subject in _LEAD_TASKS
                ]
            },
            "agent_id": "main",
            **tokens,
        },
    )
    time.sleep(1)
    ctx.send_event("post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})

    # Read the architecture doc
    _tool_cycle(ctx, "LEAD", TOOLS_HEAVY, _AUTH_FILES, num_tools=3, pause_range=(1.5, 3.0))

    # Spawn a research subagent
    ctx.log("[LEAD] Spawning research subagent...")
    research_name = random.choice(AGENT_NAMES)
    t_research = threading.Thread(
        target=_subagent_lifecycle,
        args=(
            ctx, "sub-lead-1", research_name,
            "Research current auth vulnerabilities and document findings",
            0, TOOLS_HEAVY, _AUTH_FILES, 4,
        ),
    )
    t_research.start()

    # Boss does periodic reviews while teammates and subagent work
    time.sleep(10)
    ctx.log("[LEAD] Reviewing team progress...")
    _tool_cycle(ctx, "LEAD", TOOLS_HEAVY, _AUTH_FILES, num_tools=2, pause_range=(2.0, 4.0))

    # Complete first lead task
    ctx.send_task_completed("task-lead-01", _LEAD_TASKS[0][1])
    time.sleep(1)

    time.sleep(15)
    _tool_cycle(ctx, "LEAD", TOOLS_HEAVY, _AUTH_FILES, num_tools=2, pause_range=(1.5, 3.0))
    ctx.send_task_completed("task-lead-02", _LEAD_TASKS[1][1])
    time.sleep(1)

    t_research.join()
    ctx.log("[LEAD] Research subagent done, finalizing...")

    _tool_cycle(ctx, "LEAD", TOOLS_WRITE, _AUTH_FILES, num_tools=2, pause_range=(1.5, 3.0))
    ctx.send_task_completed("task-lead-03", _LEAD_TASKS[2][1])

    # Final todos
    ctx.send_event(
        "pre_tool_use",
        {
            "tool_name": "TodoWrite",
            "tool_input": {
                "todos": [
                    {"content": subject, "status": "completed", "activeForm": f"Done: {task_id}"}
                    for task_id, subject in _LEAD_TASKS
                ]
            },
            "agent_id": "main",
        },
    )
    time.sleep(1)
    ctx.send_event("post_tool_use", {"tool_name": "TodoWrite", "agent_id": "main"})

    # Background tasks arrive
    for bg in [
        ("sim-bg-lint", "completed", "ruff + pyright: 0 errors"),
        ("sim-bg-coverage", "completed", "Coverage: 87% (+3%)"),
        ("sim-bg-deploy", "failed", "Staging deploy failed: health check timeout"),
    ]:
        ctx.send_event(
            "background_task_notification",
            {
                "background_task_id": bg[0],
                "background_task_status": bg[1],
                "background_task_summary": bg[2],
                "background_task_output_file": f"/tmp/{bg[0]}.log",
            },
        )
        time.sleep(1.5)

    ctx.send_event("stop", {"speech_content": {"boss_phone": "Auth refactor complete! Ship it."}})
    time.sleep(5)
    ctx.send_event("session_end")
    ctx.log("[LEAD] Session ended.")


# ---------------------------------------------------------------------------
# Implementer teammate
# ---------------------------------------------------------------------------

def _run_implementer(ctx: SimulationContext) -> None:
    """Implementer: writes the new auth code and spawns 2 subagents."""
    ctx.reset(initial_fraction=0.05)
    ctx.log(f"\n[IMPL] Session start (context: {ctx.get_context_utilization():.1%})")
    time.sleep(2)  # Stagger relative to lead

    ctx.send_event("session_start", {"project_name": PROJECT_NAME})
    time.sleep(0.5)

    ctx.send_event(
        "user_prompt_submit",
        {"prompt": "Implement the JWT rotation and OAuth2 changes as discussed."},
    )
    time.sleep(1)

    # Create implementer tasks
    ctx.log("[IMPL] Creating kanban tasks...")
    for task_id, subject in _IMPL_TASKS:
        ctx.send_task_created(task_id, subject)
        time.sleep(0.2)

    # Read existing code to understand it
    _tool_cycle(ctx, "IMPL", TOOLS_HEAVY, _AUTH_FILES, num_tools=4, pause_range=(2.0, 4.0))
    ctx.send_task_completed("task-impl-01", _IMPL_TASKS[0][1])
    time.sleep(0.5)

    # Spawn two coding subagents
    sub_names = random.sample(AGENT_NAMES, 2)
    t1 = threading.Thread(
        target=_subagent_lifecycle,
        args=(
            ctx, "sub-impl-1", sub_names[0],
            "Implement JWT refresh token rotation with sliding window",
            0, TOOLS_WRITE, _AUTH_FILES, 4,
        ),
    )
    t2 = threading.Thread(
        target=_subagent_lifecycle,
        args=(
            ctx, "sub-impl-2", sub_names[1],
            "Refactor OAuth2 provider class for new token format",
            1, TOOLS_WRITE, _AUTH_FILES, 3,
        ),
    )
    t1.start()
    time.sleep(3)
    t2.start()

    # Implementer edits files while subagents work
    _tool_cycle(ctx, "IMPL", TOOLS_WRITE, _AUTH_FILES, num_tools=5, pause_range=(2.0, 4.0))
    ctx.send_task_completed("task-impl-02", _IMPL_TASKS[1][1])

    t1.join()
    ctx.send_task_completed("task-impl-03", _IMPL_TASKS[2][1])

    t2.join()
    _tool_cycle(ctx, "IMPL", TOOLS_WRITE, _AUTH_FILES, num_tools=3, pause_range=(1.5, 3.0))
    ctx.send_task_completed("task-impl-04", _IMPL_TASKS[3][1])

    ctx.log("[IMPL] All tasks complete, going idle.")
    ctx.send_teammate_idle()
    time.sleep(3)
    ctx.send_event("session_end")
    ctx.log("[IMPL] Session ended.")


# ---------------------------------------------------------------------------
# Reviewer teammate
# ---------------------------------------------------------------------------

def _run_reviewer(ctx: SimulationContext) -> None:
    """Reviewer: reads code, asks questions, finds a bug, spawns a security subagent."""
    ctx.reset(initial_fraction=0.05)
    ctx.log(f"\n[REVIEWER] Session start (context: {ctx.get_context_utilization():.1%})")
    time.sleep(5)  # Starts after implementer has some code

    ctx.send_event("session_start", {"project_name": PROJECT_NAME})
    time.sleep(0.5)

    ctx.send_event(
        "user_prompt_submit",
        {"prompt": "Review the auth changes for security issues. Be thorough."},
    )
    time.sleep(1)

    # Create reviewer tasks
    ctx.log("[REVIEWER] Creating kanban tasks...")
    for task_id, subject in _REVIEW_TASKS:
        ctx.send_task_created(task_id, subject)
        time.sleep(0.2)

    # Heavy reading phase
    _tool_cycle(ctx, "REVIEWER", TOOLS_HEAVY, _AUTH_FILES, num_tools=6, pause_range=(2.5, 5.0))
    ctx.send_task_completed("task-rev-01", _REVIEW_TASKS[0][1])

    # Hit a permission request reviewing a sensitive file
    ctx.log("[REVIEWER] Requesting permission for audit log access...")
    ctx.send_event(
        "permission_request",
        {"tool_name": "Read", "tool_input": {"file_path": "logs/auth_audit.log"}, "agent_id": "main"},
    )
    time.sleep(3)
    ctx.send_event("post_tool_use", {"tool_name": "Read", "agent_id": "main", "success": True})
    time.sleep(1)

    # Spawn a security scanner subagent
    sec_name = random.choice(AGENT_NAMES)
    ctx.log(f"[REVIEWER] Spawning security scanner: {sec_name}...")
    t_sec = threading.Thread(
        target=_subagent_lifecycle,
        args=(
            ctx, "sub-rev-1", sec_name,
            "Scan for OWASP top-10 vulnerabilities in new auth code",
            0, TOOLS_HEAVY, _AUTH_FILES, 5,
        ),
    )
    t_sec.start()

    # Continue reviewing while scanner works
    _tool_cycle(ctx, "REVIEWER", TOOLS_HEAVY, _AUTH_FILES, num_tools=4, pause_range=(2.0, 4.0))
    ctx.send_task_completed("task-rev-02", _REVIEW_TASKS[1][1])

    t_sec.join()

    # One tool error — file not found
    ctx.send_event(
        "pre_tool_use",
        {"tool_name": "Read", "tool_input": {"file_path": "src/auth/pkce_old.py"}, "agent_id": "main"},
    )
    time.sleep(1)
    ctx.send_event(
        "post_tool_use",
        {
            "tool_name": "Read",
            "tool_input": {"file_path": "src/auth/pkce_old.py"},
            "agent_id": "main",
            "success": False,
            "error_type": "FileNotFoundError",
        },
    )
    time.sleep(1)

    _tool_cycle(ctx, "REVIEWER", TOOLS_HEAVY, _AUTH_FILES, num_tools=2, pause_range=(1.5, 3.0))
    ctx.send_task_completed("task-rev-03", _REVIEW_TASKS[2][1])

    ctx.log("[REVIEWER] Review complete, going idle.")
    ctx.send_teammate_idle()
    time.sleep(3)
    ctx.send_event("session_end")
    ctx.log("[REVIEWER] Session ended.")


# ---------------------------------------------------------------------------
# Tester teammate
# ---------------------------------------------------------------------------

def _run_tester(ctx: SimulationContext) -> None:
    """Tester: writes tests, runs them, triggers compaction, spawns a test-gen subagent."""
    ctx.reset(initial_fraction=0.10)
    ctx.log(f"\n[TESTER] Session start (context: {ctx.get_context_utilization():.1%})")
    time.sleep(8)  # Starts later, needs implementation first

    ctx.send_event("session_start", {"project_name": PROJECT_NAME})
    time.sleep(0.5)

    ctx.send_event(
        "user_prompt_submit",
        {"prompt": "Write comprehensive tests for the auth refactor. Cover edge cases."},
    )
    time.sleep(1)

    # Create tester tasks
    ctx.log("[TESTER] Creating kanban tasks...")
    for task_id, subject in _TEST_TASKS:
        ctx.send_task_created(task_id, subject)
        time.sleep(0.2)

    # Read existing tests to understand patterns
    _tool_cycle(ctx, "TESTER", TOOLS_HEAVY, _AUTH_FILES, num_tools=3, pause_range=(1.5, 3.0))

    # Spawn test-generation subagent
    tgen_name = random.choice(AGENT_NAMES)
    ctx.log(f"[TESTER] Spawning test generator: {tgen_name}...")
    t_gen = threading.Thread(
        target=_subagent_lifecycle,
        args=(
            ctx, "sub-test-1", tgen_name,
            "Generate unit test cases for JWT rotation edge cases",
            0, TOOLS_WRITE, _AUTH_FILES, 5,
        ),
    )
    t_gen.start()

    # Write tests concurrently
    _tool_cycle(ctx, "TESTER", TOOLS_WRITE, _AUTH_FILES, num_tools=4, pause_range=(2.0, 4.0))
    ctx.send_task_completed("task-test-01", _TEST_TASKS[0][1])

    t_gen.join()
    ctx.send_task_completed("task-test-02", _TEST_TASKS[1][1])

    # Run the tests (Bash heavy)
    bash_files = ["tests/test_jwt.py", "tests/test_oauth2.py"]
    for _ in range(3):
        tokens = ctx.increment_context(input_delta=8000, output_delta=4000)
        ctx.send_event(
            "pre_tool_use",
            {
                "tool_name": "Bash",
                "tool_input": {"command": "pytest tests/ -x -v --timeout=30"},
                "agent_id": "main",
                **tokens,
            },
        )
        if ctx.check_and_trigger_compaction():
            ctx.log("[TESTER] Compaction triggered during test run!")
            time.sleep(COMPACTION_ANIMATION_DURATION)
            ctx.finish_compaction()
        time.sleep(random.uniform(4.0, 7.0))
        ctx.send_event("post_tool_use", {"tool_name": "Bash", "agent_id": "main"})
        time.sleep(1)

    ctx.send_task_completed("task-test-03", _TEST_TASKS[2][1])

    # E2E tests
    _tool_cycle(ctx, "TESTER", TOOLS_WRITE, _AUTH_FILES, num_tools=3, pause_range=(2.0, 4.0))
    ctx.send_task_completed("task-test-04", _TEST_TASKS[3][1])

    ctx.log("[TESTER] All tests written and passing, going idle.")
    ctx.send_teammate_idle()
    time.sleep(3)
    ctx.send_event("session_end")
    ctx.log("[TESTER] Session ended.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run(ctx: SimulationContext) -> None:
    """Execute the Agent Teams scenario.

    Runs lead + 3 teammate sessions concurrently, each in its own thread.
    All sessions use the same team_name so they merge into one room view.

    Args:
        ctx: Base simulation context (session_id used as prefix for child contexts).
    """
    base_id = ctx.session_id

    lead_ctx = ctx.fork(f"{base_id}_lead", team_name=TEAM_NAME)
    impl_ctx = ctx.fork(f"{base_id}_impl", team_name=TEAM_NAME, teammate_name="implementer")
    rev_ctx = ctx.fork(f"{base_id}_reviewer", team_name=TEAM_NAME, teammate_name="reviewer")
    test_ctx = ctx.fork(f"{base_id}_tester", team_name=TEAM_NAME, teammate_name="tester")

    ctx.log(f"\n{'='*60}")
    ctx.log(f"AGENT TEAMS SCENARIO — team: {TEAM_NAME}")
    ctx.log(f"  Lead:        {lead_ctx.session_id}")
    ctx.log(f"  Implementer: {impl_ctx.session_id}")
    ctx.log(f"  Reviewer:    {rev_ctx.session_id}")
    ctx.log(f"  Tester:      {test_ctx.session_id}")
    ctx.log(f"{'='*60}\n")

    threads = [
        threading.Thread(target=_run_lead, args=(lead_ctx,), name="lead"),
        threading.Thread(target=_run_implementer, args=(impl_ctx,), name="impl"),
        threading.Thread(target=_run_reviewer, args=(rev_ctx,), name="reviewer"),
        threading.Thread(target=_run_tester, args=(test_ctx,), name="tester"),
    ]

    for t in threads:
        t.start()
        time.sleep(1.5)

    for t in threads:
        t.join()

    ctx.log("\n[teams] All sessions complete.")
