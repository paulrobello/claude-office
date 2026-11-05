"""Regression tests: history / conversation entry ids must be unique.

The frontend renders ``GameState.history`` and ``ConversationEntry`` lists with
``key={entry.id}``. Those ids used to be ``str(timestamp.timestamp())``, which
collides whenever a producer sends several events inside the same second (a
hook with second precision, or any non-Claude producer replaying a burst).

Duplicate React keys make entries render duplicated or omitted, which surfaced
as ``Encountered two children with the same key`` in the sidebar.

The id is now ``<timestamp>-<EventRecord primary key>[-<role suffix>]``, so
uniqueness comes from the persisted event row rather than from the timestamp.
These tests pin the helper's contract; the handler-level collision cases live in
``test_live_entry_ids.py``.
"""

from datetime import UTC, datetime

from app.core.event_processor import EventProcessor
from app.models.events import EventType, SessionEvent, SessionEventData


def _event(session_id: str = "session_1") -> SessionEvent:
    """Build a minimal event with a fixed, second-precision timestamp."""
    return SessionEvent(
        event_type=EventType.SESSION_START,
        session_id=session_id,
        timestamp=datetime(2026, 10, 28, 15, 41, 3, tzinfo=UTC),
        data=SessionEventData(),
    )


def test_entry_id_unique_for_events_sharing_a_timestamp() -> None:
    """Ten events at the same timestamp must yield ten distinct entry ids."""
    processor = EventProcessor()
    event = _event()
    ids = {processor.get_entry_id(event, row_id) for row_id in range(1, 11)}
    assert len(ids) == 10


def test_entry_id_keeps_timestamp_prefix() -> None:
    """The timestamp stays in the id so ordering/debugging are unaffected."""
    processor = EventProcessor()
    entry_id = processor.get_entry_id(_event(), 7)
    assert entry_id.startswith("1793202063.0-")
    assert entry_id.endswith("-7")


def test_entry_id_suffix_stays_distinct() -> None:
    """Role suffixes (``_tool`` / ``_thinking``) must not collide either.

    A single PRE_TOOL_USE can append both a thinking entry and a tool entry, so
    the two ids must differ.
    """
    processor = EventProcessor()
    event = _event()
    ids = {
        processor.get_entry_id(event, 3),
        processor.get_entry_id(event, 3, suffix="_tool"),
        processor.get_entry_id(event, 3, suffix="_thinking"),
    }
    assert len(ids) == 3


def test_entry_id_depends_on_the_row_id_not_the_process() -> None:
    """Two processors must agree: the id is derived from persisted data only.

    No process-local counter is involved, so ids do not depend on how many
    entries this particular ``EventProcessor`` happened to build before.
    """
    event = _event()
    first = EventProcessor().get_entry_id(event, 5)
    second = EventProcessor()
    for row_id in range(1, 6):
        second.get_entry_id(event, row_id)
    assert second.get_entry_id(event, 5) == first
