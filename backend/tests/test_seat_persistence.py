import pytest
from sqlalchemy import select

from app.db.database import AsyncSessionLocal, Base, get_engine
from app.db.models import AgentSeatPreference


@pytest.fixture(autouse=True)
async def setup_db():
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_create_seat_preference():
    async with AsyncSessionLocal() as session:
        pref = AgentSeatPreference(
            session_id="sess-1",
            agent_id="agent-1",
            desk=3,
            color="#3B82F6",
            room_key="my-project",
        )
        session.add(pref)
        await session.commit()

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AgentSeatPreference).where(AgentSeatPreference.agent_id == "agent-1")
        )
        pref = result.scalar_one()
        assert pref.desk == 3
        assert pref.room_key == "my-project"
        assert pref.color == "#3B82F6"


@pytest.mark.asyncio
async def test_update_seat_preference():
    async with AsyncSessionLocal() as session:
        pref = AgentSeatPreference(
            session_id="sess-1",
            agent_id="agent-2",
            desk=1,
            color="#22C55E",
            room_key="proj-a",
        )
        session.add(pref)
        await session.commit()

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AgentSeatPreference).where(AgentSeatPreference.agent_id == "agent-2")
        )
        pref = result.scalar_one()
        pref.desk = 5
        await session.commit()

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AgentSeatPreference).where(AgentSeatPreference.agent_id == "agent-2")
        )
        pref = result.scalar_one()
        assert pref.desk == 5
