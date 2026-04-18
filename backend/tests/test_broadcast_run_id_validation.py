"""Tests: broadcast_run_state must reject malformed run_id values.

Verifies that:
1. A malicious run_id (e.g. "..:admin") is rejected: WARN logged, no broadcast.
2. An empty run_id is rejected similarly.
3. A valid run_id ("ral-20260418-a7f3") passes through to manager.broadcast.

These tests FAIL before the _RUN_ID_RE validation is applied.
"""
from __future__ import annotations

import logging
from unittest.mock import AsyncMock, patch

import pytest

from app.core.broadcast_service import broadcast_run_state


def _fake_run():
    run = AsyncMock()
    run.model_dump.return_value = {}
    return run


@pytest.mark.asyncio
async def test_malicious_run_id_no_broadcast(caplog):
    """A run_id containing '..' must not reach manager.broadcast."""
    mock_broadcast = AsyncMock()
    with patch("app.core.broadcast_service.manager") as mock_manager:
        mock_manager.broadcast = mock_broadcast
        with caplog.at_level(logging.WARNING, logger="app.core.broadcast_service"):
            await broadcast_run_state("..:admin", _fake_run())

    mock_broadcast.assert_not_called()
    assert any(
        "run_id" in r.message.lower() or "invalid" in r.message.lower()
        for r in caplog.records
    )


@pytest.mark.asyncio
async def test_spoof_run_id_no_broadcast(caplog):
    """A run_id with a colon-injection pattern must not reach manager.broadcast."""
    mock_broadcast = AsyncMock()
    with patch("app.core.broadcast_service.manager") as mock_manager:
        mock_manager.broadcast = mock_broadcast
        with caplog.at_level(logging.WARNING, logger="app.core.broadcast_service"):
            await broadcast_run_state("ral-X:spoof", _fake_run())

    mock_broadcast.assert_not_called()
    assert any(
        "run_id" in r.message.lower() or "invalid" in r.message.lower()
        for r in caplog.records
    )


@pytest.mark.asyncio
async def test_empty_run_id_no_broadcast(caplog):
    """An empty run_id must not reach manager.broadcast."""
    mock_broadcast = AsyncMock()
    with patch("app.core.broadcast_service.manager") as mock_manager:
        mock_manager.broadcast = mock_broadcast
        with caplog.at_level(logging.WARNING, logger="app.core.broadcast_service"):
            await broadcast_run_state("", _fake_run())

    mock_broadcast.assert_not_called()
    assert any(
        "run_id" in r.message.lower() or "invalid" in r.message.lower()
        for r in caplog.records
    )


@pytest.mark.asyncio
async def test_valid_run_id_broadcasts():
    """A properly formatted run_id must be forwarded to manager.broadcast."""
    mock_broadcast = AsyncMock()
    with patch("app.core.broadcast_service.manager") as mock_manager:
        mock_manager.broadcast = mock_broadcast
        await broadcast_run_state("ral-20260418-a7f3", _fake_run())

    mock_broadcast.assert_called_once()
    call_args = mock_broadcast.call_args
    channel = call_args.args[1] if call_args.args else call_args[0][1]
    assert channel == "_run:ral-20260418-a7f3"
