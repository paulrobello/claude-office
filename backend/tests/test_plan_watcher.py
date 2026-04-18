import asyncio
import logging
from pathlib import Path

import pytest

from app.core.plan_watcher import MAX_PLAN_BYTES, PlanWatcher
from app.models.runs import PlanTaskStatus


@pytest.mark.asyncio
async def test_plan_watcher_fires_on_change(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("PANOPTICA_PLAN_POLL_INTERVAL", "0.05")
    plan = tmp_path / "PLAN.md"
    plan.write_text("- [ ] plan-task-1: first\n")

    updates: list[tuple[str, list]] = []

    async def cb(run_id: str, tasks) -> None:
        updates.append((run_id, list(tasks)))

    w = PlanWatcher(on_update=cb)
    w.register("ral-1", plan)
    await w.start()
    await asyncio.sleep(0.15)
    assert updates, "expected first update"
    assert updates[0][0] == "ral-1"
    assert updates[0][1][0].status == PlanTaskStatus.TODO

    plan.write_text("- [x] plan-task-1: first\n")
    await asyncio.sleep(0.2)
    await w.stop()

    statuses = [u[1][0].status for u in updates]
    assert PlanTaskStatus.DONE in statuses


@pytest.mark.asyncio
async def test_plan_watcher_no_file_is_noop(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("PANOPTICA_PLAN_POLL_INTERVAL", "0.05")
    updates: list = []

    async def cb(run_id: str, tasks) -> None:
        updates.append((run_id, tasks))

    w = PlanWatcher(on_update=cb)
    w.register("ral-1", tmp_path / "PLAN.md")
    await w.start()
    await asyncio.sleep(0.15)
    await w.stop()
    assert updates == []


@pytest.mark.asyncio
async def test_plan_watcher_warn_debug_recovery_cadence(tmp_path: Path, caplog):
    """First missing-file failure → WARNING; subsequent → DEBUG; heal → INFO recovery."""
    missing = tmp_path / "PLAN.md"

    async def noop_cb(run_id: str, tasks) -> None:
        pass

    w = PlanWatcher(on_update=noop_cb)
    w.register("ral-test", missing)
    state = w._states["ral-test"]

    with caplog.at_level(logging.DEBUG, logger="app.core.plan_watcher"):
        await w._poll_one(state)  # poll 1: first failure → WARNING
        await w._poll_one(state)  # poll 2: second failure → DEBUG
        await w._poll_one(state)  # poll 3: third failure → DEBUG

        missing.write_text("- [ ] plan-task-1: test\n")
        await w._poll_one(state)  # poll 4: file healed → INFO recovery

    watcher_records = [(r.levelname, r.message) for r in caplog.records
                       if r.name == "app.core.plan_watcher"]

    assert watcher_records[0][0] == "WARNING", f"expected WARNING first, got {watcher_records}"
    assert watcher_records[1][0] == "DEBUG", f"expected DEBUG second, got {watcher_records}"
    assert watcher_records[2][0] == "DEBUG", f"expected DEBUG third, got {watcher_records}"
    assert any(
        r[0] == "INFO" and "recover" in r[1].lower() for r in watcher_records[3:]
    ), f"expected INFO recovery after heal, got {watcher_records}"


@pytest.mark.asyncio
async def test_plan_watcher_mtime_size_fastpath_skips_hash(tmp_path: Path, monkeypatch):
    """Unchanged file: hash must be computed at most once across 3 polls."""
    import hashlib as _hashlib
    plan = tmp_path / "PLAN.md"
    plan.write_text("- [ ] plan-task-1: stable\n")

    hash_calls = 0
    real_sha256 = _hashlib.sha256

    def counting_sha256(data, *args, **kwargs):
        nonlocal hash_calls
        hash_calls += 1
        return real_sha256(data, *args, **kwargs)

    monkeypatch.setattr("app.core.plan_watcher.hashlib.sha256", counting_sha256)

    updates: list = []

    async def cb(run_id: str, tasks) -> None:
        updates.append((run_id, tasks))

    w = PlanWatcher(on_update=cb)
    w.register("ral-1", plan)
    state = w._states["ral-1"]

    await w._poll_one(state)  # tick 1: establishes baseline
    await w._poll_one(state)  # tick 2: mtime+size unchanged → skip
    await w._poll_one(state)  # tick 3: mtime+size unchanged → skip

    assert hash_calls <= 1, f"expected at most 1 hash call, got {hash_calls}"


@pytest.mark.asyncio
async def test_plan_watcher_rejects_oversized_file(tmp_path: Path, caplog):
    """Files over MAX_PLAN_BYTES must log WARN and not invoke the callback."""
    plan = tmp_path / "PLAN.md"
    # Generate 2 MiB of plausible-looking task lines
    line = "- [ ] plan-task-1: some task title that looks realistic\n"
    plan.write_bytes((line * (2 * 1024 * 1024 // len(line) + 1)).encode()[:2 * 1024 * 1024])

    updates: list = []

    async def cb(run_id: str, tasks) -> None:
        updates.append((run_id, tasks))

    w = PlanWatcher(on_update=cb)
    w.register("ral-oversized", plan)
    state = w._states["ral-oversized"]

    with caplog.at_level(logging.WARNING, logger="app.core.plan_watcher"):
        await w._poll_one(state)

    assert updates == [], "callback must not be invoked for oversized file"
    warn_records = [
        r for r in caplog.records
        if r.levelno == logging.WARNING and r.name == "app.core.plan_watcher"
    ]
    assert warn_records, "expected a WARNING log for oversized file"
    assert any(
        str(MAX_PLAN_BYTES) in r.message
        or "MiB" in r.message
        or "size" in r.message.lower()
        for r in warn_records
    ), f"WARN log must mention size cap, got: {[r.message for r in warn_records]}"
