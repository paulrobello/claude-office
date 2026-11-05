"""Regression tests: live handler entry ids survive timestamp collisions.

CodeRabbit review on PR #62 (``backend/app/core/event_processor.py:604``): the
original patch only made the history-entry helper unique, while the live
conversation handlers kept building ids from ``str(timestamp.timestamp())``.

Two ``PRE_TOOL_USE`` events sharing a timestamp therefore produced the same
``_tool`` key (and the same ``_thinking`` key), and repeated prompts/responses
collided the same way. The frontend renders the conversation list with
``key={entry.id}``, so those duplicates made entries render twice or vanish.

These tests drive the real pipeline — ``EventProcessor.process_event`` →
enricher dispatch → ``tool_handler`` / ``conversation_handler`` — because the
handler-only helper tests could not catch the original bug.
"""

import asyncio
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import delete, event, select
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.event_processor import EventProcessor
from app.core.state_machine import StateMachine
from app.db.database import (
    AsyncSessionLocal,
    Base,
    get_engine,
    override_engine,
)
from app.db.models import EventRecord, SessionRecord
from app.models.events import (
    AnyEvent,
    EventType,
    LifecycleEvent,
    LifecycleEventData,
    PromptEvent,
    PromptEventData,
    SessionEvent,
    SessionEventData,
    ToolEvent,
    ToolEventData,
)

# One fixed, second-precision timestamp: every event in a test shares it, which
# is exactly the collision case (hooks that only carry seconds, or a burst
# replayed onto /api/v1/events).
TS = datetime(2026, 10, 28, 15, 41, 3, tzinfo=UTC)


@pytest.fixture(scope="module", autouse=True)
def concurrent_db_engine(tmp_path_factory: pytest.TempPathFactory) -> Iterator[None]:
    """Run this module on a WAL-mode file database instead of ``:memory:``.

    The default test engine (tests/conftest.py) is a ``:memory:`` database on
    a StaticPool — every session shares ONE connection, so a read-only
    session's exit rollback (``close()`` ends its transaction) destroys any
    other session's uncommitted writes on that same connection. Concurrent
    event processing — the subject of ``test_concurrent_first_events_apply_
    exactly_once`` — therefore crashed in ``_persist_event`` before any
    assertion could run. A file-backed engine gives concurrent sessions
    independent transactions; the pragmas mirror the production setup in
    ``app/db/database.py``.
    """
    db_path = tmp_path_factory.mktemp("entry-ids-db") / "test.db"
    test_engine: AsyncEngine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        echo=False,
        connect_args={"check_same_thread": False, "timeout": 15},
    )

    @event.listens_for(test_engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    previous_engine = get_engine()
    override_engine(test_engine)

    async def _create_tables() -> None:
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def _dispose() -> None:
        await test_engine.dispose()

    asyncio.run(_create_tables())
    yield
    asyncio.run(_dispose())
    override_engine(previous_engine)


async def _wipe(session_id: str) -> None:
    """Drop any rows a previous test left behind for this session."""
    async with AsyncSessionLocal() as db:
        await db.execute(delete(EventRecord).where(EventRecord.session_id == session_id))
        await db.execute(delete(SessionRecord).where(SessionRecord.id == session_id))
        await db.commit()


def _start(session_id: str) -> SessionEvent:
    return SessionEvent(
        event_type=EventType.SESSION_START,
        session_id=session_id,
        timestamp=TS,
        data=SessionEventData(project_name="entry-id-test"),
    )


def _tool(session_id: str, tool_name: str, thinking: str | None = None) -> ToolEvent:
    return ToolEvent(
        event_type=EventType.PRE_TOOL_USE,
        session_id=session_id,
        timestamp=TS,
        data=ToolEventData(tool_name=tool_name, thinking=thinking),
    )


def _prompt(session_id: str, text: str) -> PromptEvent:
    return PromptEvent(
        event_type=EventType.USER_PROMPT_SUBMIT,
        session_id=session_id,
        timestamp=TS,
        data=PromptEventData(prompt=text),
    )


def _stop(session_id: str, transcript_path: str) -> LifecycleEvent:
    return LifecycleEvent(
        event_type=EventType.STOP,
        session_id=session_id,
        timestamp=TS,
        data=LifecycleEventData(transcript_path=transcript_path),
    )


def _ids(entries: list[Any]) -> list[str]:
    return [str(entry["id"]) for entry in entries]


def _assert_unique(ids: list[str]) -> None:
    assert len(ids) == len(set(ids)), f"duplicate entry ids: {ids}"


@pytest.mark.asyncio
async def test_two_tool_events_same_timestamp_get_distinct_ids() -> None:
    """Two PRE_TOOL_USE at the same timestamp must not share a ``_tool`` key."""
    ep = EventProcessor()
    sid = "live-ids-tool"
    await _wipe(sid)
    try:
        await ep.process_event(_start(sid))
        await ep.process_event(_tool(sid, "Read", thinking="first thought"))
        await ep.process_event(_tool(sid, "Bash", thinking="second thought"))

        sm = ep.sessions[sid]
        ids = _ids(sm.conversation)
        _assert_unique(ids)

        tool_ids = [e["id"] for e in sm.conversation if e["role"] == "tool"]
        thinking_ids = [e["id"] for e in sm.conversation if e["role"] == "thinking"]
        assert len(tool_ids) == 2
        assert len(set(tool_ids)) == 2
        assert len(thinking_ids) == 2
        assert len(set(thinking_ids)) == 2
        # The role suffix is preserved, so the ids stay debuggable.
        assert all(entry_id.endswith("_tool") for entry_id in tool_ids)
        assert all(entry_id.endswith("_thinking") for entry_id in thinking_ids)
    finally:
        await _wipe(sid)


@pytest.mark.asyncio
async def test_repeated_prompts_same_timestamp_get_distinct_ids() -> None:
    """Repeated USER_PROMPT_SUBMIT events must keep distinct conversation ids."""
    ep = EventProcessor()
    sid = "live-ids-prompt"
    await _wipe(sid)
    try:
        await ep.process_event(_start(sid))
        for i in range(3):
            await ep.process_event(_prompt(sid, f"prompt {i}"))

        sm = ep.sessions[sid]
        _assert_unique(_ids(sm.conversation))
        user_ids = [e["id"] for e in sm.conversation if e["role"] == "user"]
        assert len(user_ids) == 3
        assert len(set(user_ids)) == 3
    finally:
        await _wipe(sid)


@pytest.mark.asyncio
async def test_repeated_responses_same_timestamp_get_distinct_ids(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Repeated STOP events must keep distinct assistant conversation ids."""
    transcript = tmp_path / "transcript.jsonl"
    transcript.write_text("", encoding="utf-8")
    responses = iter(["first response", "second response"])

    def fake_last_response(_path: str) -> str:
        return next(responses)

    monkeypatch.setattr(
        "app.core.handlers.conversation_handler.get_last_assistant_response",
        fake_last_response,
    )

    ep = EventProcessor()
    sid = "live-ids-stop"
    await _wipe(sid)
    try:
        await ep.process_event(_start(sid))
        stop = _stop(sid, str(transcript))
        await ep.process_event(stop)
        await ep.process_event(stop)

        sm = ep.sessions[sid]
        assistant_ids = [e["id"] for e in sm.conversation if e["role"] == "assistant"]
        assert len(assistant_ids) == 2
        assert len(set(assistant_ids)) == 2
        _assert_unique(_ids(sm.conversation))
    finally:
        await _wipe(sid)


@pytest.mark.asyncio
async def test_history_and_conversation_ids_are_unique_together() -> None:
    """A burst of same-timestamp events leaves no duplicate key anywhere.

    Covers both lists the frontend keys by ``entry.id``: ``history`` and
    ``conversation``.
    """
    ep = EventProcessor()
    sid = "live-ids-burst"
    await _wipe(sid)
    try:
        await ep.process_event(_start(sid))
        for i in range(5):
            await ep.process_event(_prompt(sid, f"prompt {i}"))
            await ep.process_event(_tool(sid, f"Tool{i}", thinking=f"thinking {i}"))

        sm = ep.sessions[sid]
        _assert_unique(_ids(sm.history))
        _assert_unique(_ids(sm.conversation))
    finally:
        await _wipe(sid)


@pytest.mark.asyncio
async def test_first_event_of_an_uncached_session_is_recorded_once() -> None:
    """The just-persisted event must not be replayed *and* appended live.

    ``_persist_event`` commits the current row before the state machine is
    restored, so the restore used to replay that row (history entry + state
    transition + conversation entries) and the live path then applied it a
    second time — duplicate entries under identical ids
    (``backend/app/core/event_processor.py:828``).
    """
    ep = EventProcessor()
    sid = "live-ids-no-double"
    await _wipe(sid)
    try:
        await ep.process_event(_start(sid))
        sm = ep.sessions[sid]
        # session_start + the prompt below.
        assert len(sm.history) == 1

        await ep.process_event(_prompt(sid, "only once please"))
        assert len(sm.history) == 2
        user_entries = [e for e in sm.conversation if e["role"] == "user"]
        assert len(user_entries) == 1
        _assert_unique(_ids(sm.history))
    finally:
        await _wipe(sid)


@pytest.mark.asyncio
async def test_restore_skips_the_row_persisted_for_the_current_event() -> None:
    """Restoring must exclude the current event's row, and keep the others.

    The restored machine is built from the *past*; the live path owns the
    current event. Splitting the work this way is what keeps the ids of a
    restored session distinct from the live ones.
    """
    ep = EventProcessor()
    sid = "live-ids-exclude"
    await _wipe(sid)
    try:
        await ep.process_event(_start(sid))
        await ep.process_event(_prompt(sid, "earlier prompt"))

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(EventRecord.id).where(EventRecord.session_id == sid))
            row_ids = [row[0] for row in result.all()]
        current_row = max(row_ids)

        full = await ep._build_restored_state_machine(sid)  # pyright: ignore[reportPrivateUsage]
        assert full is not None
        excluded = await ep._build_restored_state_machine(  # pyright: ignore[reportPrivateUsage]
            sid, exclude_row_id=current_row
        )
        assert excluded is not None
        assert len(excluded.history) == len(full.history) - 1
        assert len(excluded.conversation) == len(full.conversation) - 1
        _assert_unique(_ids(full.history))
        _assert_unique(_ids(full.conversation))
    finally:
        await _wipe(sid)


@pytest.mark.asyncio
async def test_concurrent_first_events_apply_exactly_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two events racing on an uncached session each apply exactly once.

    F1 (restore race): both events commit, then both used to run their own
    restore; each restore contained the peer's just-committed row, so the peer
    was applied once by that restore and once more by its own live path — a
    duplicated ``ts-rowid`` history id and a doubled transition. The pipeline
    now single-flights the restore and skips live application for any event
    whose entry id the restored machine already recorded.
    """
    ep = EventProcessor()
    sid = "live-ids-race"
    await _wipe(sid)

    transitions: list[EventType] = []
    original_transition = StateMachine.transition

    def counting_transition(self: StateMachine, event: AnyEvent) -> None:
        transitions.append(event.event_type)
        original_transition(self, event)

    monkeypatch.setattr(StateMachine, "transition", counting_transition)

    # Widen the race window so both events are committed before either restore
    # queries: without this the restores rarely overlap on a fast local DB and
    # the bug this guards against does not reproduce.
    original_restore = ep._build_restored_state_machine  # pyright: ignore[reportPrivateUsage]

    async def delayed_restore(
        session_id: str, exclude_row_id: int | None = None
    ) -> StateMachine | None:
        await asyncio.sleep(0.05)
        return await original_restore(session_id, exclude_row_id=exclude_row_id)

    monkeypatch.setattr(ep, "_build_restored_state_machine", delayed_restore)

    try:
        await asyncio.gather(
            ep.process_event(_prompt(sid, "first")),
            ep.process_event(_prompt(sid, "second")),
        )

        sm = ep.sessions[sid]
        # One synthetic recovered session_start (neither prompt carries one)
        # plus the two prompts: exactly three applications.
        assert len(sm.history) == 3, [e["id"] for e in sm.history]
        _assert_unique(_ids(sm.history))

        start_transitions = transitions.count(EventType.SESSION_START)
        prompt_transitions = transitions.count(EventType.USER_PROMPT_SUBMIT)
        # The recovered session_start may legitimately skip its transition: it
        # must not reset a session another racing event already brought live
        # (pre-existing pipeline behavior). It is still recorded exactly once
        # in history. The prompts must each transition exactly once — a
        # restore/live double-apply would push this to 3.
        assert start_transitions <= 1, f"session_start transitioned {start_transitions}x"
        assert prompt_transitions == 2, f"prompts transitioned {prompt_transitions}x"

        user_entries = [e for e in sm.conversation if e["role"] == "user"]
        assert len(user_entries) == 2
        _assert_unique(_ids(sm.conversation))
    finally:
        await _wipe(sid)
