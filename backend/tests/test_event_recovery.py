"""Session-start recovery tests (PR #61 review remediation).

Covers the backend-authoritative recovery: a session whose real session_start
never reached the backend gets a synthetic one (source="recovered") persisted
WITHOUT the destructive history wipe a real session_start performs.
"""

import pytest
from sqlalchemy import delete, select

from app.core.event_processor import EventProcessor
from app.db.database import AsyncSessionLocal
from app.db.models import EventRecord, SessionRecord
from app.models.events import (
    EventDataBase,
    EventType,
    PromptEvent,
    PromptEventData,
    SessionEvent,
    SessionEventData,
)


async def _record_count(session_id: str) -> int:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(EventRecord).where(EventRecord.session_id == session_id))
        return len(result.scalars().all())


async def _wipe(session_id: str) -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(delete(EventRecord).where(EventRecord.session_id == session_id))
        await db.execute(delete(SessionRecord).where(SessionRecord.id == session_id))
        await db.commit()


def _prompt(session_id: str, source: str | None = None) -> PromptEvent:
    return PromptEvent(
        event_type=EventType.USER_PROMPT_SUBMIT,
        session_id=session_id,
        data=PromptEventData(prompt="hello", source=source),
    )


def _real_start(session_id: str) -> SessionEvent:
    return SessionEvent(
        event_type=EventType.SESSION_START,
        session_id=session_id,
        data=SessionEventData(project_name="recovery-test"),
    )


@pytest.mark.asyncio
async def test_missing_session_start_is_recovered() -> None:
    """A session whose first event is not session_start gets a synthetic one."""
    ep = EventProcessor()
    sid = "rec-test-1"
    await _wipe(sid)
    try:
        await ep.process_event(_prompt(sid))
        assert await _record_count(sid) == 2  # synthetic start + the real prompt
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(EventRecord.id).where(
                    EventRecord.session_id == sid,
                    EventRecord.event_type == EventType.SESSION_START.value,
                )
            )
            assert result.first() is not None
    finally:
        await _wipe(sid)


@pytest.mark.asyncio
async def test_known_session_is_not_re_recovered() -> None:
    """A session whose session_start WAS delivered gets no synthetic replay."""
    ep = EventProcessor()
    sid = "rec-test-2"
    await _wipe(sid)
    try:
        await ep.process_event(_real_start(sid))
        await ep.process_event(_prompt(sid))
        assert await _record_count(sid) == 2  # real start + prompt, no synthetic
    finally:
        await _wipe(sid)


@pytest.mark.asyncio
async def test_recovered_start_does_not_wipe_history() -> None:
    """A recovered session_start persists without the destructive delete."""
    ep = EventProcessor()
    sid = "rec-test-3"
    await _wipe(sid)
    try:
        await ep.process_event(_real_start(sid))
        await ep.process_event(_prompt(sid))
        await ep.process_event(_prompt(sid))
        assert await _record_count(sid) == 3

        # Simulate a producer losing its delivery state: a recovered replay
        # of session_start must not delete the session's history.
        prompt = _prompt(sid)
        await ep.process_event(ep._build_recovered_start(prompt))  # pyright: ignore[reportPrivateUsage]
        assert await _record_count(sid) == 4  # +1 recovered record, nothing wiped
    finally:
        await _wipe(sid)


@pytest.mark.asyncio
async def test_opencode_child_sessions_not_recovered() -> None:
    """Events tagged source=opencode (child @agent sessions) stay excluded."""
    ep = EventProcessor()
    sid = "rec-test-4"
    await _wipe(sid)
    try:
        await ep.process_event(_prompt(sid, source="opencode"))
        assert await _record_count(sid) == 1  # prompt only, no synthetic start
    finally:
        await _wipe(sid)


@pytest.mark.asyncio
async def test_db_wipe_triggers_recheck() -> None:
    """After a DB wipe, cleared recovery state lets sessions re-synthesize."""
    ep = EventProcessor()
    sid = "rec-test-5"
    await _wipe(sid)
    try:
        await ep.process_event(_prompt(sid))
        assert await _record_count(sid) == 2
        await _wipe(sid)  # records gone (e.g. clear-sessions / compose down -v)
        await ep.clear_all_sessions()  # must clear the recovery-checked set
        await ep.process_event(_prompt(sid))
        assert await _record_count(sid) == 2  # re-synthesized
    finally:
        await _wipe(sid)


@pytest.mark.asyncio
async def test_recovered_start_preserves_live_state() -> None:
    """A recovered session_start must not reset a live session's whiteboard."""
    ep = EventProcessor()
    sid = "rec-test-6"
    await _wipe(sid)
    try:
        await ep.process_event(_real_start(sid))
        sm = ep.sessions[sid]
        news_before = list(sm.whiteboard.news_items)
        assert news_before  # the real session_start added its news item

        prompt = _prompt(sid)
        await ep.process_event(ep._build_recovered_start(prompt))  # pyright: ignore[reportPrivateUsage]
        assert sm.whiteboard.news_items == news_before  # untouched by the replay
    finally:
        await _wipe(sid)


@pytest.mark.asyncio
async def test_recovered_start_carries_session_context() -> None:
    """The synthetic event copies the generic context fields from its source event."""
    ep = EventProcessor()
    source = _prompt("rec-test-7")
    source.data.project_name = "myproj"
    source.data.working_dir = "/Users/x/Repos/myproj"
    recovered = ep._build_recovered_start(source)  # pyright: ignore[reportPrivateUsage]
    assert recovered.event_type == EventType.SESSION_START
    assert recovered.data.source == "recovered"
    assert recovered.data.project_name == "myproj"
    assert recovered.data.working_dir == "/Users/x/Repos/myproj"
    # Only EventDataBase fields are copied (no family-specific payload leakage).
    assert set(recovered.data.model_dump(exclude_none=True)) <= (
        set(EventDataBase.model_fields) | {"source"}
    )
