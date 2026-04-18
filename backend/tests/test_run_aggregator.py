from datetime import UTC, datetime
from pathlib import Path

from app.core.marker_file import MarkerFile
from app.core.run_aggregator import RunAggregator
from app.models.runs import Role, RunOutcome, RunPhase


def _marker(run_id="ral-1", phase="A", ended_at=None) -> MarkerFile:
    return MarkerFile(
        run_id=run_id,
        orchestrator_session_id="orc-1",
        primary_repo="/repo",
        workdocs_dir="/repo/workdocs",
        started_at=datetime(2026, 4, 18, tzinfo=UTC),
        ended_at=ended_at,
        phase=phase,
        model_config_dict={"coder": "claude-sonnet-4-6"},
        source_path=Path("/repo/workdocs/.panoptica-run.json"),
    )


def test_upsert_from_marker_creates_run():
    agg = RunAggregator()
    diff = agg.upsert_from_marker(_marker())
    assert diff.created is True
    run = agg.get("ral-1")
    assert run is not None
    assert run.phase == RunPhase.A
    assert run.outcome == RunOutcome.IN_PROGRESS


def test_upsert_detects_phase_change():
    agg = RunAggregator()
    agg.upsert_from_marker(_marker(phase="A"))
    diff = agg.upsert_from_marker(_marker(phase="B"))
    assert diff.created is False
    assert diff.phase_changed == ("A", "B")


def test_upsert_detects_end():
    agg = RunAggregator()
    agg.upsert_from_marker(_marker())
    ended = _marker(ended_at=datetime(2026, 4, 18, 16, tzinfo=UTC))
    diff = agg.upsert_from_marker(ended)
    assert diff.ended is True
    run = agg.get("ral-1")
    assert run.outcome == RunOutcome.COMPLETED
    assert run.ended_at is not None


def test_add_member_session_and_leave():
    agg = RunAggregator()
    agg.upsert_from_marker(_marker())
    agg.add_member(
        "ral-1", session_id="s1", role=Role.CODER, task_id="plan-task-5", is_orchestrator=False
    )
    run = agg.get("ral-1")
    assert "s1" in run.member_session_ids
    agg.remove_member("ral-1", session_id="s1")
    run = agg.get("ral-1")
    assert "s1" not in run.member_session_ids


def test_add_orchestrator_sets_orchestrator_session_id():
    agg = RunAggregator()
    agg.upsert_from_marker(_marker())
    agg.add_member("ral-1", session_id="orc-1", role=None, task_id=None, is_orchestrator=True)
    assert agg.get("ral-1").orchestrator_session_id == "orc-1"


def test_end_by_orchestrator_stop():
    agg = RunAggregator()
    agg.upsert_from_marker(_marker())
    agg.add_member("ral-1", session_id="orc-1", role=None, task_id=None, is_orchestrator=True)
    diff = agg.end_if_orchestrator_stopped("orc-1")
    assert diff is not None
    assert diff.ended is True
    # Second trigger is a no-op
    assert agg.end_if_orchestrator_stopped("orc-1") is None


def test_list_active_runs():
    agg = RunAggregator()
    agg.upsert_from_marker(_marker("ral-1"))
    agg.upsert_from_marker(_marker("ral-2"))
    assert {r.run_id for r in agg.list_active()} == {"ral-1", "ral-2"}
