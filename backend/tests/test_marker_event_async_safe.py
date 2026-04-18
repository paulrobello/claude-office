"""Tests: _handle_marker_event must not block the event loop during read_marker.

Two assertions:
1. 10 concurrent handler calls all complete under 2s (contract / regression).
2. Two concurrent calls with a time.sleep(0.2) mock finish in < 0.35s,
   proving they overlap in threads rather than serialising on the event loop.
   This test FAILS before the asyncio.to_thread fix is applied.
"""
from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest

from app.core.event_processor import EventProcessor


def _base_payload(tmp_path) -> dict:
    return {
        "orchestrator_session_id": "orc-1",
        "primary_repo": str(tmp_path),
        "workdocs_dir": str(tmp_path / "workdocs"),
        "model_config": {},
        "phase": "A",
    }


@pytest.mark.asyncio
async def test_ten_concurrent_marker_events_complete_quickly(tmp_path, monkeypatch) -> None:
    """10 concurrent _handle_marker_event calls must all complete under 2s."""
    monkeypatch.setenv("HOME", str(tmp_path))
    ep = EventProcessor()
    base = _base_payload(tmp_path)

    with (
        patch.object(EventProcessor, "process_event", new_callable=AsyncMock),
        patch("app.core.event_processor.get_plan_watcher", return_value=None),
        patch("app.core.event_processor.get_marker_watcher", return_value=None),
        patch("app.core.event_processor.read_marker", return_value=None),
    ):
        t0 = time.monotonic()
        await asyncio.gather(
            *(
                ep._handle_marker_event("run_start", {**base, "run_id": f"ral-{i:02d}"})
                for i in range(10)
            )
        )
        elapsed = time.monotonic() - t0

    assert elapsed < 2.0, f"10 concurrent marker events took {elapsed:.3f}s, expected < 2s"


@pytest.mark.asyncio
async def test_concurrent_marker_reads_overlap_in_threads(tmp_path, monkeypatch) -> None:
    """read_marker must be off the event loop (asyncio.to_thread).

    Two concurrent _handle_marker_event calls each mock read_marker with
    time.sleep(0.2).  If the event loop is blocked (no to_thread), the calls
    serialise and total wall time is ~0.4 s.  With to_thread they overlap and
    finish in ~0.2 s.  Assert total < 0.35 s.

    This test FAILS before the asyncio.to_thread fix.
    """
    monkeypatch.setenv("HOME", str(tmp_path))
    ep = EventProcessor()
    base = _base_payload(tmp_path)

    def slow_read(_path):
        time.sleep(0.2)
        return None

    with (
        patch.object(EventProcessor, "process_event", new_callable=AsyncMock),
        patch("app.core.event_processor.get_plan_watcher", return_value=None),
        patch("app.core.event_processor.get_marker_watcher", return_value=None),
        patch("app.core.event_processor.read_marker", side_effect=slow_read),
    ):
        t0 = time.monotonic()
        await asyncio.gather(
            ep._handle_marker_event("run_start", {**base, "run_id": "ral-01"}),
            ep._handle_marker_event("run_start", {**base, "run_id": "ral-02"}),
        )
        elapsed = time.monotonic() - t0

    assert elapsed < 0.35, (
        f"Two concurrent marker reads took {elapsed:.3f}s — "
        "event loop is likely blocked by synchronous read_marker. "
        "Expected < 0.35s with asyncio.to_thread overlap."
    )
