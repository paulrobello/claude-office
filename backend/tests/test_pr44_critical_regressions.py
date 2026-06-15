"""Regression tests for the critical fixes shipped in PR #44.

Each test pins down a specific bug that was fixed during the full-system QA
sweep so it cannot silently regress:

* ``context_utilization`` division-by-zero when the context window is 0.
* ``TranscriptPoller.stop_polling`` deadlock (lock held while awaiting the
  cancelled poll task).
* ``EventProcessor`` session-creation race (concurrent events for a brand-new
  session must not clobber each other's StateMachine).
* Session restore crashing on an unknown persisted ``event_type``.
* ``GitService`` multi-session correctness (per-root change detection and
  session-scoped status resolution).
"""

# pyright: reportPrivateUsage=false

import asyncio
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.event_processor import EventProcessor
from app.core.token_tracker import TokenTracker
from app.core.transcript_poller import TranscriptPoller
from app.db.database import AsyncSessionLocal, Base, override_engine
from app.db.models import EventRecord, SessionRecord
from app.models.events import Event, EventData, EventType
from app.models.git import GitStatus
from app.services.git_service import GitService


@pytest.fixture(autouse=True, scope="module")
def ensure_test_db() -> None:
    """Provide a fresh in-memory DB for this module (order-independent).

    Other modules override and dispose the global engine, so we re-initialise a
    clean one here just like ``test_team_detection.py`` does.
    """
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async def _setup() -> None:
        import app.db.models  # noqa: F401  # pyright: ignore[reportUnusedImport]

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_setup())
    override_engine(engine)


# ---------------------------------------------------------------------------
# context_utilization division-by-zero
# ---------------------------------------------------------------------------


def test_context_utilization_handles_zero_max_context() -> None:
    """A 0-token context window must yield 0.0, not raise ZeroDivisionError."""
    tracker = TokenTracker(
        total_input_tokens=100,
        total_output_tokens=50,
        max_context_tokens=0,
    )
    # Regression: previously ``total_tokens / max_context_tokens`` raised.
    assert tracker.context_utilization == 0.0


def test_context_utilization_normal_window() -> None:
    """Sanity check that the guard did not break the happy path."""
    tracker = TokenTracker(
        total_input_tokens=50_000,
        total_output_tokens=50_000,
        max_context_tokens=200_000,
    )
    # 100_000 / 200_000 is exactly representable in float.
    assert tracker.context_utilization == 0.5


# ---------------------------------------------------------------------------
# TranscriptPoller.stop_polling deadlock
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stop_polling_does_not_deadlock() -> None:
    """stop_polling must not hold the lock while awaiting the cancelled task."""
    callback = AsyncMock()
    poller = TranscriptPoller(callback)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
        f.write("")
        temp_path = f.name

    try:
        with patch("app.core.transcript_poller.POLL_INTERVAL_SECONDS", 0.01):
            await poller.start_polling("agent1", "session1", temp_path)
            # Let the poll loop run a few iterations so it is actively contending
            # for the lock when stop_polling cancels it.
            await asyncio.sleep(0.05)
            # Regression: stop_polling used to ``await agent.poll_task`` while
            # still holding ``self._lock``, deadlocking against the poll loop.
            # Bound with a timeout so a regression fails fast instead of hanging.
            await asyncio.wait_for(poller.stop_polling("agent1"), timeout=2.0)

        assert "agent1" not in poller._agents
    finally:
        Path(temp_path).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# EventProcessor concurrent session-creation race
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_concurrent_events_share_one_state_machine() -> None:
    """Concurrent events for a new session must not lose updates.

    Before the ``_sessions_lock`` guard, two events racing on a brand-new
    session could each create a fresh StateMachine, the second clobbering the
    first and discarding the first event's conversation entry.

    Persistence is stubbed so the restore path stays empty — this isolates the
    in-memory create-under-lock logic from DB replay, which is what the lock
    actually protects.
    """
    ep = EventProcessor()
    session_id = "race-session"
    count = 20

    events = [
        Event(
            event_type=EventType.USER_PROMPT_SUBMIT,
            session_id=session_id,
            data=EventData(prompt=f"prompt number {i}", project_name="app"),
        )
        for i in range(count)
    ]

    with patch.object(ep, "_persist_event", new=AsyncMock()):
        await asyncio.gather(*(ep.process_event(evt) for evt in events))

    sm = ep.sessions.get(session_id)
    assert sm is not None
    # Every prompt must be recorded on the single shared StateMachine — none
    # lost to a clobbered/recreated instance.
    assert len(sm.conversation) == count


# ---------------------------------------------------------------------------
# Session restore crash on unknown event_type
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_restore_session_skips_unknown_event_type() -> None:
    """An unknown persisted event_type is skipped, not fatal to restoration."""
    session_id = "replay-unknown-type"
    now = datetime.now(UTC)

    async with AsyncSessionLocal() as db:
        db.add(SessionRecord(id=session_id, project_name="app"))
        db.add(
            EventRecord(
                session_id=session_id,
                timestamp=now,
                event_type=EventType.SESSION_START.value,
                data={"project_name": "app"},
            )
        )
        # A bogus event_type that EventType(...) cannot parse.
        db.add(
            EventRecord(
                session_id=session_id,
                timestamp=now,
                event_type="totally_bogus_event_type",
                data={},
            )
        )
        await db.commit()

    ep = EventProcessor()
    # Regression: EventType("totally_bogus_event_type") raised ValueError and
    # aborted the whole restore. It must now be skipped instead.
    await ep._restore_session(session_id)

    assert session_id in ep.sessions


# ---------------------------------------------------------------------------
# GitService multi-session correctness
# ---------------------------------------------------------------------------


def _status(branch: str, repo_path: str) -> GitStatus:
    return GitStatus(
        branch=branch,
        ahead=0,
        behind=0,
        changed_files=[],
        commits=[],
        last_updated=datetime.now(UTC),
        repo_path=repo_path,
    )


def test_git_status_changed_tracks_each_root_independently() -> None:
    """Distinct project roots keep separate change-detection baselines.

    With a single ``_last_status`` field, polling root A then root B made each
    look perpetually "changed" because they overwrote each other's baseline.
    """
    svc = GitService()
    status_a = _status("main", "/repo/a")
    status_b = _status("dev", "/repo/b")

    # First sighting of each root is reported as changed.
    assert svc._status_changed(status_a, "/repo/a") is True
    svc._last_status["/repo/a"] = status_a

    # Polling a different root must not be measured against root A's baseline.
    assert svc._status_changed(status_b, "/repo/b") is True
    svc._last_status["/repo/b"] = status_b

    # Re-polling each unchanged root now reports no change.
    assert svc._status_changed(status_a, "/repo/a") is False
    assert svc._status_changed(status_b, "/repo/b") is False


def test_git_get_status_resolves_root_by_session(tmp_path: Path) -> None:
    """get_status resolves the caller's own root, never an arbitrary one."""
    svc = GitService()
    svc.configure(session_id="A", project_root=str(tmp_path / "a"))
    svc.configure(session_id="B", project_root=str(tmp_path / "b"))

    # Ambiguous (two roots, no session) must not guess — returns None.
    assert svc.get_status() is None
    # Unknown session resolves to no root.
    assert svc.get_status(session_id="unknown") is None
    # A known session resolves to its own (here non-existent) root without error.
    assert svc.get_status(session_id="A") is None
