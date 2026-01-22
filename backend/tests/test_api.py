import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.event_processor import event_processor
from app.main import app
from app.models.events import Event, EventData, EventType

client = TestClient(app)


def test_receive_event():
    response = client.post(
        "/api/v1/events",
        json={
            "event_type": "session_start",
            "session_id": "test_session",
            "timestamp": "2026-01-15T10:00:00",
            "data": {},
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "accepted"


def test_delete_single_session():
    session_id = f"delete-session-{uuid4()}"
    seed_event = Event(
        event_type=EventType.SESSION_START,
        session_id=session_id,
        timestamp=datetime.now(UTC),
        data=EventData(),
    )
    asyncio.run(event_processor.process_event(seed_event))

    list_response = client.get("/api/v1/sessions")
    assert list_response.status_code == 200
    assert any(session["id"] == session_id for session in list_response.json())

    delete_response = client.delete(f"/api/v1/sessions/{session_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "success"

    list_after_delete = client.get("/api/v1/sessions")
    assert list_after_delete.status_code == 200
    assert session_id not in [session["id"] for session in list_after_delete.json()]
