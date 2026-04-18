"""Tests for GET /api/v1/runs and _run: WebSocket channel (Plan 2 Task 1)."""

import contextlib
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.broadcast_service import RUN_ID_RE
from app.core.event_processor import event_processor
from app.main import app, websocket_endpoint
from app.models.runs import Run, RunOutcome, RunPhase

client = TestClient(app)


def _make_run(run_id: str, *, ended: bool = False) -> Run:
    return Run(
        run_id=run_id,
        orchestrator_session_id=None,
        primary_repo="tesseron/panoptica",
        workdocs_dir="/tmp/workdocs",
        phase=RunPhase.B,
        started_at=datetime(2026, 4, 18, 12, 0, 0, tzinfo=UTC),
        ended_at=datetime(2026, 4, 18, 13, 0, 0, tzinfo=UTC) if ended else None,
        outcome=RunOutcome.COMPLETED if ended else RunOutcome.IN_PROGRESS,
    )


class TestListRuns:
    def setup_method(self) -> None:
        event_processor.get_run_aggregator()._runs.clear()

    def test_empty_list_when_no_runs(self) -> None:
        response = client.get("/api/v1/runs")
        assert response.status_code == 200
        assert response.json() == []

    def test_active_runs_appear(self) -> None:
        run = _make_run("ral-20260418-a7f3")
        event_processor.get_run_aggregator()._runs[run.run_id] = run

        response = client.get("/api/v1/runs")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["runId"] == "ral-20260418-a7f3"

    def test_ended_runs_excluded(self) -> None:
        active = _make_run("ral-20260418-a7f3")
        ended = _make_run("ral-20260418-b8e4", ended=True)
        event_processor.get_run_aggregator()._runs[active.run_id] = active
        event_processor.get_run_aggregator()._runs[ended.run_id] = ended

        response = client.get("/api/v1/runs")

        assert response.status_code == 200
        run_ids = [r["runId"] for r in response.json()]
        assert "ral-20260418-a7f3" in run_ids
        assert "ral-20260418-b8e4" not in run_ids

    def test_multiple_active_runs(self) -> None:
        for suffix in ["a7f3", "b8e4", "c9f5"]:
            run = _make_run(f"ral-20260418-{suffix}")
            event_processor.get_run_aggregator()._runs[run.run_id] = run

        response = client.get("/api/v1/runs")

        assert response.status_code == 200
        assert len(response.json()) == 3


class TestRunWebSocketValidation:
    """Unit tests for _run: channel ID validation."""

    def test_valid_run_id_matches(self) -> None:
        assert RUN_ID_RE.match("ral-20260418-a7f3") is not None

    def test_valid_run_id_zero_hex(self) -> None:
        assert RUN_ID_RE.match("ral-20260418-0000") is not None

    def test_malformed_run_id_rejected(self) -> None:
        assert RUN_ID_RE.match("invalid-id") is None

    def test_malformed_run_id_too_short_rejected(self) -> None:
        assert RUN_ID_RE.match("ral-abc") is None

    def test_malformed_missing_date_part(self) -> None:
        assert RUN_ID_RE.match("ral-a7f3") is None

    def test_malformed_wrong_prefix(self) -> None:
        assert RUN_ID_RE.match("run-20260418-a7f3") is None

    @pytest.mark.asyncio
    async def test_ws_endpoint_accepts_valid_run_id(self) -> None:
        """WS endpoint connects when run_id is valid."""
        ws = AsyncMock()
        ws.client_state = MagicMock()
        with patch("app.main.manager.connect", new_callable=AsyncMock) as mock_connect:
            mock_connect.side_effect = Exception("stop after connect")
            with contextlib.suppress(Exception):
                await websocket_endpoint(ws, "_run:ral-20260418-a7f3")
            mock_connect.assert_called_once_with(ws, "_run:ral-20260418-a7f3")

    @pytest.mark.asyncio
    async def test_ws_endpoint_rejects_invalid_run_id(self) -> None:
        """WS endpoint accepts then closes with 1008 when run_id is malformed."""
        ws = AsyncMock()
        ws.client_state = MagicMock()
        with patch("app.main.manager.connect", new_callable=AsyncMock) as mock_connect:
            await websocket_endpoint(ws, "_run:invalid-id")
            mock_connect.assert_not_called()
            ws.accept.assert_awaited_once()
            ws.close.assert_awaited_once_with(code=1008, reason="Invalid run ID format")
