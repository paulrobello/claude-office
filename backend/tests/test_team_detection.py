# backend/tests/test_team_detection.py
"""Tests for team detection and orchestrator routing in EventProcessor."""

import asyncio
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.event_processor import EventProcessor
from app.db.database import Base, override_engine
from app.models.events import Event, EventData, EventType


@pytest.fixture(autouse=True, scope="module")
def ensure_test_db() -> None:
    """Ensure a fresh in-memory DB is available for this module.

    test_task_persistence.py overrides the global engine and then disposes
    it.  This fixture re-initialises a clean engine so our tests are not
    affected by execution order.
    """
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async def _setup() -> None:
        import app.db.models  # noqa: F401  # pyright: ignore[reportUnusedImport]

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_setup())
    override_engine(engine)


def _make_event(event_type: EventType, session_id: str = "s1", **kwargs: Any) -> Event:
    return Event(
        event_type=event_type,
        session_id=session_id,
        data=EventData(**kwargs),
    )


class TestTeamDetection:
    @pytest.mark.asyncio
    async def test_lead_session_detected_when_no_teammate_name(self) -> None:
        ep = EventProcessor()
        event = _make_event(
            EventType.SESSION_START,
            session_id="lead-sess",
            team_name="squad",
            project_name="myapp",
        )
        await ep.process_event(event)
        sm = ep.sessions.get("lead-sess")
        assert sm is not None
        assert sm.team_name == "squad"
        assert sm.is_lead is True

    @pytest.mark.asyncio
    async def test_teammate_session_detected_when_teammate_name_present(self) -> None:
        ep = EventProcessor()
        event = _make_event(
            EventType.SESSION_START,
            session_id="tm-sess",
            team_name="squad",
            teammate_name="implementer",
            project_name="myapp",
        )
        await ep.process_event(event)
        sm = ep.sessions.get("tm-sess")
        assert sm is not None
        assert sm.team_name == "squad"
        assert sm.teammate_name == "implementer"
        assert sm.is_lead is False

    @pytest.mark.asyncio
    async def test_orchestrator_created_for_room(self) -> None:
        ep = EventProcessor()
        # Solo session gets an orchestrator for its room
        event = _make_event(
            EventType.SESSION_START,
            session_id="solo-sess",
            project_name="panoptica",
        )
        await ep.process_event(event)
        sm = ep.sessions.get("solo-sess")
        if sm and sm.room_id:
            assert sm.room_id in ep.orchestrators  # pyright: ignore[reportAttributeAccessIssue]


class TestOrchestratorUpdated:
    @pytest.mark.asyncio
    async def test_orchestrator_updated_on_event(self) -> None:
        ep = EventProcessor()
        event = _make_event(
            EventType.SESSION_START,
            session_id="s1",
            project_name="myapp",
        )
        await ep.process_event(event)
        sm = ep.sessions.get("s1")
        if sm and sm.room_id:
            orch = ep.orchestrators.get(sm.room_id)  # pyright: ignore[reportAttributeAccessIssue, reportUnknownVariableType]
            assert orch is not None
