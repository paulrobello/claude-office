from datetime import UTC, datetime

from app.models.events import Event, EventData, EventType


def test_run_event_types_exist():
    assert EventType.RUN_START == "run_start"
    assert EventType.RUN_PHASE_CHANGE == "run_phase_change"
    assert EventType.RUN_END == "run_end"
    assert EventType.ROLE_SESSION_JOINED == "role_session_joined"


def test_event_data_accepts_run_fields():
    e = Event(
        event_type=EventType.RUN_PHASE_CHANGE,
        session_id="orchestrator-01HX",
        timestamp=datetime.now(UTC),
        data=EventData(
            run_id="ral-20260418-a7f3",
            from_phase="A",
            to_phase="B",
            ralph_role=None,
        ),
    )
    assert e.data.run_id == "ral-20260418-a7f3"
    assert e.data.from_phase == "A"
    assert e.data.to_phase == "B"
