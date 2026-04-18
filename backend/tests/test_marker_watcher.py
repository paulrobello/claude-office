# backend/tests/test_marker_watcher.py
import asyncio
import json
from pathlib import Path

import pytest

from app.core.marker_watcher import MAX_WATCHED_PATHS, MarkerWatcher


def _write(tmp: Path, phase: str, ended_at: str | None = None, run_id: str = "ral-1") -> Path:
    wd = tmp / "workdocs"
    wd.mkdir(exist_ok=True)
    p = wd / ".panoptica-run.json"
    p.write_text(
        json.dumps(
            {
                "run_id": run_id,
                "orchestrator_session_id": "orc-1",
                "primary_repo": str(tmp),
                "workdocs_dir": str(wd),
                "started_at": "2026-04-18T14:32:07Z",
                "ended_at": ended_at,
                "phase": phase,
                "model_config": {"coder": "claude-sonnet-4-6"},
            }
        )
    )
    return p


@pytest.mark.asyncio
async def test_watcher_emits_run_start(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("PANOPTICA_MARKER_POLL_INTERVAL", "0.05")
    events: list[tuple[str, dict]] = []

    async def cb(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    w = MarkerWatcher(on_event=cb)
    _write(tmp_path, phase="A")
    w.register(tmp_path)
    await w.start()
    await asyncio.sleep(0.2)
    await w.stop()
    assert any(t == "run_start" for t, _ in events)


@pytest.mark.asyncio
async def test_watcher_emits_phase_change_and_end(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("PANOPTICA_MARKER_POLL_INTERVAL", "0.05")
    events: list[tuple[str, dict]] = []

    async def cb(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    w = MarkerWatcher(on_event=cb)
    _write(tmp_path, phase="A")
    w.register(tmp_path)
    await w.start()
    await asyncio.sleep(0.15)
    _write(tmp_path, phase="B")
    await asyncio.sleep(0.15)
    _write(tmp_path, phase="B", ended_at="2026-04-18T16:00:00Z")
    await asyncio.sleep(0.15)
    await w.stop()

    types = [t for t, _ in events]
    assert "run_start" in types
    assert "run_phase_change" in types
    assert "run_end" in types


def test_register_lru_evicts_oldest(tmp_path, caplog):
    """Registering MAX_WATCHED_PATHS+1 paths evicts the first with a WARN log."""
    import logging

    async def cb(event_type: str, payload: dict) -> None:
        pass

    w = MarkerWatcher(on_event=cb)
    dirs = []
    for i in range(MAX_WATCHED_PATHS + 1):
        d = tmp_path / f"run_{i:03d}"
        d.mkdir()
        dirs.append(d)

    with caplog.at_level(logging.WARNING, logger="app.core.marker_watcher"):
        for d in dirs:
            w.register(d)

    oldest = dirs[0].resolve()
    assert oldest not in w._paths, "Oldest path should have been evicted"

    for d in dirs[1:]:
        assert d.resolve() in w._paths, f"{d} should still be tracked"

    warn_records = [
        r for r in caplog.records
        if r.levelno == logging.WARNING and "evict" in r.message.lower()
    ]
    assert len(warn_records) == 1, f"Expected exactly 1 eviction WARNING, got {len(warn_records)}"


def test_reregister_existing_path_does_not_evict(tmp_path, caplog):
    """Re-registering an already-tracked path should not cause eviction."""
    import logging

    async def cb(event_type: str, payload: dict) -> None:
        pass

    w = MarkerWatcher(on_event=cb)
    dirs = []
    for i in range(MAX_WATCHED_PATHS):
        d = tmp_path / f"run_{i:03d}"
        d.mkdir()
        dirs.append(d)

    for d in dirs:
        w.register(d)

    with caplog.at_level(logging.WARNING, logger="app.core.marker_watcher"):
        w.register(dirs[0])

    assert len(w._paths) == MAX_WATCHED_PATHS
    warn_records = [
        r for r in caplog.records
        if r.levelno == logging.WARNING and "evict" in r.message.lower()
    ]
    assert len(warn_records) == 0


@pytest.mark.asyncio
async def test_watcher_ignores_missing_file(tmp_path, monkeypatch):
    monkeypatch.setenv("PANOPTICA_MARKER_POLL_INTERVAL", "0.05")
    events: list[tuple[str, dict]] = []

    async def cb(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    w = MarkerWatcher(on_event=cb)
    w.register(tmp_path)  # no marker file written
    await w.start()
    await asyncio.sleep(0.15)
    await w.stop()
    assert events == []
