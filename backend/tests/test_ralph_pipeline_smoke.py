# backend/tests/test_ralph_pipeline_smoke.py
import asyncio
import json
from pathlib import Path

from app.core.marker_file import marker_path_for_cwd, read_marker
from app.core.marker_watcher import MarkerWatcher
from app.core.plan_watcher import PlanWatcher
from app.core.run_aggregator import RunAggregator
from app.core.session_tagger import classify_session
from app.models.runs import PlanTaskStatus, Role, RunPhase


def _write_marker(cwd: Path, phase: str = "A", ended_at: str | None = None) -> None:
    wd = cwd / "workdocs"
    wd.mkdir(exist_ok=True)
    (wd / ".panoptica-run.json").write_text(
        json.dumps(
            {
                "run_id": "ral-smoke",
                "orchestrator_session_id": "orc-1",
                "primary_repo": str(cwd),
                "workdocs_dir": str(wd),
                "started_at": "2026-04-18T14:32:07Z",
                "ended_at": ended_at,
                "phase": phase,
                "model_config": {"coder": "claude-sonnet-4-6", "designer": "claude-opus-4-7"},
            }
        )
    )


def _write_plan(cwd: Path, *lines: str) -> None:
    (cwd / "workdocs" / "PLAN.md").write_text("\n".join(lines) + "\n")


async def test_ralph_smoke_end_to_end(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("PANOPTICA_MARKER_POLL_INTERVAL", "0.05")
    monkeypatch.setenv("PANOPTICA_PLAN_POLL_INTERVAL", "0.05")

    agg = RunAggregator()
    received_events: list[tuple[str, dict]] = []

    async def on_marker_event(etype: str, payload: dict) -> None:
        received_events.append((etype, payload))
        if etype == "run_start":
            # Simulate lifecycle wiring: aggregator + plan_watcher.register
            marker = read_marker(marker_path_for_cwd(Path(payload["primary_repo"])))
            assert marker is not None
            agg.upsert_from_marker(marker)
            plan_watcher.register("ral-smoke", Path(payload["workdocs_dir"]) / "PLAN.md")
        elif etype == "run_phase_change":
            marker = read_marker(marker_path_for_cwd(Path(payload["primary_repo"])))
            assert marker is not None
            agg.upsert_from_marker(marker)

    async def on_plan_update(run_id: str, tasks) -> None:
        run = agg.get(run_id)
        if run is not None:
            run.plan_tasks = list(tasks)

    marker_watcher = MarkerWatcher(on_event=on_marker_event)
    plan_watcher = PlanWatcher(on_update=on_plan_update)

    # Step 1: Orchestrator writes marker + PLAN.md
    _write_marker(tmp_path, phase="A")
    _write_plan(tmp_path, "- [ ] plan-task-1: scaffold", "- [ ] plan-task-2: tests")

    marker_watcher.register(tmp_path)
    await marker_watcher.start()
    await plan_watcher.start()
    await asyncio.sleep(0.2)

    run = agg.get("ral-smoke")
    assert run is not None, "run_start should have populated aggregator"
    assert run.phase == RunPhase.A

    # Step 2: Orchestrator session joins (marker-only → orchestrator)
    tag = classify_session(
        session_id="orc-1",
        cwd=tmp_path,
        env={},
        marker=read_marker(marker_path_for_cwd(tmp_path)),
    )
    assert tag is not None and tag.is_orchestrator
    agg.add_member("ral-smoke", session_id="orc-1", role=None, task_id=None, is_orchestrator=True)

    # Step 3: Phase A designer session joins (env + marker)
    tag = classify_session(
        session_id="designer-1",
        cwd=tmp_path,
        env={"RALPH_RUN_ID": "ral-smoke", "RALPH_ROLE": "designer"},
        marker=read_marker(marker_path_for_cwd(tmp_path)),
    )
    assert tag is not None and tag.role == Role.DESIGNER
    agg.add_member(
        "ral-smoke",
        session_id="designer-1",
        role=Role.DESIGNER,
        task_id=None,
        is_orchestrator=False,
    )

    # Step 4: Phase transitions A → B
    _write_marker(tmp_path, phase="B")
    await asyncio.sleep(0.15)
    assert agg.get("ral-smoke").phase == RunPhase.B
    assert any(t == "run_phase_change" for t, _ in received_events)

    # Step 5: PLAN.md progresses (note: parser uses [~] for in-progress, not [🔧])
    _write_plan(tmp_path, "- [x] plan-task-1: scaffold", "- [~] plan-task-2: tests")
    await asyncio.sleep(0.15)
    plan_tasks = agg.get("ral-smoke").plan_tasks
    assert {t.id: t.status for t in plan_tasks} == {
        "plan-task-1": PlanTaskStatus.DONE,
        "plan-task-2": PlanTaskStatus.IN_PROGRESS,
    }

    # Step 6: Ad-hoc session elsewhere is NOT tagged
    ad_hoc_dir = tmp_path.parent / "other"
    ad_hoc_dir.mkdir()
    ad_hoc_tag = classify_session(session_id="ad-1", cwd=ad_hoc_dir, env={}, marker=None)
    assert ad_hoc_tag is None

    # Step 7: Run ends
    _write_marker(tmp_path, phase="B", ended_at="2026-04-18T16:00:00Z")
    await asyncio.sleep(0.15)
    # Orchestrator stop triggers end — idempotent with marker end
    agg.end_if_orchestrator_stopped("orc-1")
    # Either marker-end or orchestrator-stop ended it first; both paths mark outcome
    run = agg.get("ral-smoke")
    assert run.ended_at is not None
    assert any(t == "run_end" for t, _ in received_events)

    await marker_watcher.stop()
    await plan_watcher.stop()
