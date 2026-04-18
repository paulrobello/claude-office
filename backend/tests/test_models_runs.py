from datetime import UTC, datetime

from app.models.runs import (
    PlanTask,
    PlanTaskStatus,
    Role,
    Run,
    RunOutcome,
    RunPhase,
)
from app.models.sessions import Session


def test_role_values():
    assert Role.DESIGNER == "designer"
    assert Role.CODER == "coder"
    assert Role.CODER_CONTINUATION == "coder-continuation"
    assert Role.VERIFIER == "verifier"
    assert Role.REVIEWER == "reviewer"


def test_run_minimal_construction():
    run = Run(
        run_id="ral-20260418-a7f3",
        orchestrator_session_id=None,
        primary_repo="/tmp/repo",
        workdocs_dir="/tmp/repo/workdocs",
        phase=RunPhase.A,
        started_at=datetime.now(UTC),
        ended_at=None,
        outcome=RunOutcome.IN_PROGRESS,
        model_config_={"coder": "claude-sonnet-4-6"},
    )
    assert run.member_session_ids == set()
    assert run.plan_tasks == []
    assert run.token_usage is None
    assert run.cost_usd is None


def test_run_camelcase_serialisation():
    run = Run(
        run_id="ral-x",
        orchestrator_session_id="s1",
        primary_repo="/r",
        workdocs_dir="/r/workdocs",
        phase=RunPhase.B,
        started_at=datetime.now(UTC),
        ended_at=None,
        outcome=RunOutcome.IN_PROGRESS,
        model_config_={},
    )
    d = run.model_dump(by_alias=True)
    assert "runId" in d
    assert "primaryRepo" in d
    assert "modelConfig" in d


def test_plan_task_status_round_trip():
    t = PlanTask(id="plan-task-1", title="scaffold api", status=PlanTaskStatus.TODO)
    assert t.status == "todo"
    t.status = PlanTaskStatus.IN_PROGRESS
    assert t.status == "in_progress"


# Task 2 — Session run-attribution fields


def test_session_has_run_fields_nullable_by_default():
    s = Session(
        id="01HX",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        status="active",
        event_count=0,
        agent_count=0,
    )
    assert s.run_id is None
    assert s.role is None
    assert s.task_id is None


def test_session_accepts_run_fields():
    s = Session(
        id="01HX",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        status="active",
        event_count=0,
        agent_count=0,
        run_id="ral-20260418-a7f3",
        role=Role.CODER,
        task_id="plan-task-5",
    )
    assert s.run_id == "ral-20260418-a7f3"
    assert s.role == Role.CODER
    assert s.task_id == "plan-task-5"
