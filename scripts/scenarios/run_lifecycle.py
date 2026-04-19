"""Run lifecycle simulation scenario.

Demonstrates the full Ralph run lifecycle on the campus view (~90 seconds):

  1. Run appears on campus (office-appear animation)
  2. Designer, coder, verifier join sequentially (nook animations)
  3. Phase transitions A → B → C → D (phase-tint animation)
  4. Plan tasks progress todo → in_progress → done (task-slide animation)
  5. Run ends with completed outcome (office-dim animation)

Mechanism:
  - Writes a .panoptica-run.json marker file to ~/.panoptica-sim/<run_id>/workdocs/
  - Sends session_start events so the backend registers the path with MarkerWatcher
  - MarkerWatcher detects the file, fires run_start, registers PlanWatcher
  - PlanWatcher polls PLAN.md and broadcasts run_state with task updates
  - Marker file updates trigger phase-change events via MarkerWatcher
  - All events land on the _run:<run_id> WebSocket channel that the frontend
    subscribes to via useRunList / useRunEvents
"""

from __future__ import annotations

import json
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

from scripts.scenarios._base import SimulationContext

# Must match _RUN_ID_RE: ral-[0-9]{8}-[0-9a-f]{4}
RUN_ID = "ral-20260418-a7f3"
ORC_SESSION = "sim-ralph-orc-01"
DESIGNER_SESSION = "sim-ralph-dsn-01"
CODER_SESSION = "sim-ralph-cod-01"
VERIFIER_SESSION = "sim-ralph-ver-01"

# Backend API base — must match the running backend port (default: 8000)
_API_EVENTS = "http://localhost:8000/api/v1/events"

# Sleep duration between task updates (seconds). Allows MarkerWatcher (1s poll),
# PlanWatcher (1s poll), and frontend REST poll (5s) to all propagate.
_TASK_SLEEP = 4


def _write_marker(
    workdocs: Path,
    phase: str,
    started_at: str,
    ended_at: str | None = None,
) -> None:
    """Write or overwrite the .panoptica-run.json marker file."""
    workdocs.mkdir(parents=True, exist_ok=True)
    marker = {
        "run_id": RUN_ID,
        "primary_repo": str(workdocs.parent),
        "workdocs_dir": str(workdocs),
        "started_at": started_at,
        "ended_at": ended_at,
        "phase": phase,
        "model_config": {
            "designer": "claude-opus-4-6",
            "coder": "claude-sonnet-4-6",
            "verifier": "claude-opus-4-6",
        },
    }
    (workdocs / ".panoptica-run.json").write_text(json.dumps(marker))


def _write_plan(workdocs: Path, statuses: dict[str, str]) -> None:
    """Write PLAN.md with tasks in given statuses.

    statuses maps plan-task-N → "todo" | "in_progress" | "done".
    Format matches plan_parser.py: `- [mark] plan-task-N: title`
    """
    mark_map = {"todo": " ", "in_progress": "~", "done": "x"}
    titles = {
        "plan-task-1": "Design spec and architecture",
        "plan-task-2": "Implement core feature",
        "plan-task-3": "Verification and testing",
    }
    lines = [
        f"- [{mark_map.get(status, ' ')}] {tid}: {titles.get(tid, tid)}"
        for tid, status in statuses.items()
    ]
    (workdocs / "PLAN.md").write_text("\n".join(lines) + "\n")


def _send_session_start(
    ctx: SimulationContext,
    session_id: str,
    project_dir: str,
    run_id: str | None = None,
    ralph_role: str | None = None,
) -> None:
    """POST a session_start event to bootstrap run membership."""
    data: dict[str, str] = {"project_dir": project_dir}
    if run_id:
        data["run_id"] = run_id
    if ralph_role:
        data["ralph_role"] = ralph_role

    payload: dict[str, object] = {
        "event_type": "session_start",
        "session_id": session_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }
    try:
        requests.post(_API_EVENTS, json=payload, timeout=10).raise_for_status()
        ctx.log(f"[run_lifecycle]   session_start sent: {session_id}")
    except Exception as exc:
        ctx.log(f"[run_lifecycle]   WARN session_start failed ({session_id}): {exc}")


def run(ctx: SimulationContext) -> None:
    """Execute the run lifecycle scenario."""
    ctx.log(f"[run_lifecycle] Starting — run_id={RUN_ID}")

    sim_dir = Path.home() / ".panoptica-sim" / RUN_ID
    workdocs = sim_dir / "workdocs"
    started_at = datetime.now(timezone.utc).isoformat()

    try:
        # ------------------------------------------------------------------ #
        # Phase A: run_start — office appears on campus                       #
        # ------------------------------------------------------------------ #
        ctx.log("[run_lifecycle] Phase A: bootstrapping run...")
        _write_marker(workdocs, "A", started_at=started_at)
        _write_plan(workdocs, {
            "plan-task-1": "todo",
            "plan-task-2": "todo",
            "plan-task-3": "todo",
        })

        # session_start triggers backend to read marker + register MarkerWatcher
        # (no run_id/ralph_role → classified as orchestrator)
        _send_session_start(ctx, ORC_SESSION, str(sim_dir))
        ctx.log("[run_lifecycle] Waiting for run to appear on campus...")
        time.sleep(3)

        # Designer joins → nook arrives
        ctx.log("[run_lifecycle] Designer joining run...")
        _send_session_start(ctx, DESIGNER_SESSION, str(sim_dir),
                            run_id=RUN_ID, ralph_role="designer")
        time.sleep(2)

        # Task 1 goes in_progress
        ctx.log("[run_lifecycle] Plan task-1 → in_progress")
        _write_plan(workdocs, {
            "plan-task-1": "in_progress",
            "plan-task-2": "todo",
            "plan-task-3": "todo",
        })
        time.sleep(_TASK_SLEEP)

        # ------------------------------------------------------------------ #
        # Phase B: implementation                                             #
        # ------------------------------------------------------------------ #
        ctx.log("[run_lifecycle] Phase B: implementation...")
        _write_marker(workdocs, "B", started_at=started_at)
        time.sleep(2)

        # Coder joins
        ctx.log("[run_lifecycle] Coder joining run...")
        _send_session_start(ctx, CODER_SESSION, str(sim_dir),
                            run_id=RUN_ID, ralph_role="coder")
        time.sleep(2)

        # Task 1 done, task 2 in_progress
        ctx.log("[run_lifecycle] Plan task-1 → done, task-2 → in_progress")
        _write_plan(workdocs, {
            "plan-task-1": "done",
            "plan-task-2": "in_progress",
            "plan-task-3": "todo",
        })
        time.sleep(_TASK_SLEEP)

        # ------------------------------------------------------------------ #
        # Phase C: quality assurance                                          #
        # ------------------------------------------------------------------ #
        ctx.log("[run_lifecycle] Phase C: quality assurance...")
        _write_marker(workdocs, "C", started_at=started_at)
        time.sleep(2)

        # Verifier joins
        ctx.log("[run_lifecycle] Verifier joining run...")
        _send_session_start(ctx, VERIFIER_SESSION, str(sim_dir),
                            run_id=RUN_ID, ralph_role="verifier")
        time.sleep(2)

        # Task 2 done, task 3 in_progress
        ctx.log("[run_lifecycle] Plan task-2 → done, task-3 → in_progress")
        _write_plan(workdocs, {
            "plan-task-1": "done",
            "plan-task-2": "done",
            "plan-task-3": "in_progress",
        })
        time.sleep(_TASK_SLEEP)

        # ------------------------------------------------------------------ #
        # Phase D: wrap-up                                                    #
        # ------------------------------------------------------------------ #
        ctx.log("[run_lifecycle] Phase D: wrap-up...")
        _write_marker(workdocs, "D", started_at=started_at)
        time.sleep(2)

        # All tasks done
        ctx.log("[run_lifecycle] All tasks done")
        _write_plan(workdocs, {
            "plan-task-1": "done",
            "plan-task-2": "done",
            "plan-task-3": "done",
        })
        time.sleep(_TASK_SLEEP)

        # ------------------------------------------------------------------ #
        # Run ends — office dims                                              #
        # ------------------------------------------------------------------ #
        ctx.log("[run_lifecycle] Ending run (outcome: completed)...")
        ended_at = datetime.now(timezone.utc).isoformat()
        _write_marker(workdocs, "done", started_at=started_at, ended_at=ended_at)
        time.sleep(5)

        ctx.log("[run_lifecycle] Done.")

    finally:
        # Give the frontend a moment to render the dim animation before cleanup
        time.sleep(3)
        if sim_dir.exists():
            shutil.rmtree(sim_dir, ignore_errors=True)
            ctx.log("[run_lifecycle] Temp directory cleaned up.")
