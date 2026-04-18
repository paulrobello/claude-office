import json
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.core.handlers.session_handler import handle_session_end, handle_session_start
from app.core.run_aggregator import RunAggregator
from app.core.state_machine import StateMachine
from app.models.events import Event, EventData, EventType
from app.models.runs import Role


def _marker_at(cwd: Path) -> None:
    wd = cwd / "workdocs"
    wd.mkdir(exist_ok=True)
    (wd / ".panoptica-run.json").write_text(
        json.dumps(
            {
                "run_id": "ral-1",
                "orchestrator_session_id": None,
                "primary_repo": str(cwd),
                "workdocs_dir": str(wd),
                "started_at": "2026-04-18T14:32:07Z",
                "ended_at": None,
                "phase": "A",
                "model_config": {"coder": "claude-sonnet-4-6"},
            }
        )
    )


@pytest.mark.asyncio
@patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock)
async def test_handle_session_start_tags_session_from_env_and_marker(
    mock_broadcast: AsyncMock, tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    _marker_at(tmp_path)
    agg = RunAggregator()
    sm = StateMachine()

    event = Event(
        event_type=EventType.SESSION_START,
        session_id="s1",
        timestamp=datetime.now(UTC),
        data=EventData(
            project_dir=str(tmp_path),
            run_id="ral-1",
            ralph_role="coder",
            ralph_task_id="plan-task-5",
        ),
    )

    await handle_session_start(
        sm=sm,
        event=event,
        ensure_task_file_poller_fn=lambda: None,
        run_aggregator=agg,
    )

    assert sm.run_id == "ral-1"
    assert sm.role == Role.CODER
    assert sm.task_id == "plan-task-5"
    assert "s1" in agg.get("ral-1").member_session_ids


@pytest.mark.asyncio
@patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock)
async def test_handle_session_start_no_aggregator_is_noop(
    mock_broadcast: AsyncMock, tmp_path: Path
) -> None:
    """Passing no aggregator (old callers) must not break."""
    sm = StateMachine()

    event = Event(
        event_type=EventType.SESSION_START,
        session_id="s2",
        timestamp=datetime.now(UTC),
        data=EventData(project_dir=str(tmp_path)),
    )

    await handle_session_start(
        sm=sm,
        event=event,
        ensure_task_file_poller_fn=lambda: None,
        run_aggregator=None,
    )

    assert sm.run_id is None


@pytest.mark.asyncio
@patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock)
async def test_handle_session_end_removes_member(
    mock_broadcast: AsyncMock, tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    from app.core.marker_file import marker_path_for_cwd, read_marker

    agg = RunAggregator()
    _marker_at(tmp_path)
    marker = read_marker(marker_path_for_cwd(tmp_path))
    agg.upsert_from_marker(marker)
    agg.add_member("ral-1", session_id="s3", role=Role.CODER, task_id=None, is_orchestrator=False)

    sm = StateMachine()
    sm.run_id = "ral-1"
    sm.role = Role.CODER

    event = Event(
        event_type=EventType.SESSION_END,
        session_id="s3",
        timestamp=datetime.now(UTC),
        data=EventData(),
    )

    await handle_session_end(sm=sm, event=event, run_aggregator=agg)

    assert "s3" not in agg.get("ral-1").member_session_ids


@pytest.mark.asyncio
@patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock)
async def test_handle_session_end_orchestrator_stop_ends_run(
    mock_broadcast: AsyncMock, tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    from app.core.marker_file import marker_path_for_cwd, read_marker

    agg = RunAggregator()
    _marker_at(tmp_path)
    marker = read_marker(marker_path_for_cwd(tmp_path))
    agg.upsert_from_marker(marker)
    agg.add_member("ral-1", session_id="orc-1", role=None, task_id=None, is_orchestrator=True)

    sm = StateMachine()
    sm.run_id = "ral-1"

    event = Event(
        event_type=EventType.SESSION_END,
        session_id="orc-1",
        timestamp=datetime.now(UTC),
        data=EventData(),
    )

    await handle_session_end(sm=sm, event=event, run_aggregator=agg)

    run = agg.get("ral-1")
    assert run.ended_at is not None


@pytest.mark.asyncio
@patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock)
async def test_real_state_machine_carries_ralph_attribution(mock_broadcast, tmp_path, monkeypatch):
    """Real StateMachine (not SimpleNamespace) must receive run attribution."""
    monkeypatch.setenv("HOME", str(tmp_path))
    _marker_at(tmp_path)
    agg = RunAggregator()
    sm = StateMachine()

    event = Event(
        event_type=EventType.SESSION_START,
        session_id="s-real",
        timestamp=datetime.now(UTC),
        data=EventData(
            project_dir=str(tmp_path),
            run_id="ral-1",
            ralph_role="coder",
            ralph_task_id="plan-task-5",
        ),
    )

    await handle_session_start(
        sm=sm,
        event=event,
        ensure_task_file_poller_fn=lambda: None,
        run_aggregator=agg,
    )

    assert sm.run_id == "ral-1"
    assert sm.role == Role.CODER
    assert sm.task_id == "plan-task-5"
    assert "s-real" in agg.get("ral-1").member_session_ids
