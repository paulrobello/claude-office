import pytest
from datetime import UTC, datetime

from app.core.event_processor import event_processor
from app.core.project_registry import ProjectRegistry
from app.core.state_machine import StateMachine
from app.models.agents import Agent, AgentState, BossState


@pytest.fixture(autouse=True)
def clean_processor():
    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()
    yield
    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()


@pytest.mark.asyncio
async def test_project_grouped_state_empty():
    result = await event_processor.get_project_grouped_state()
    assert result is None


@pytest.mark.asyncio
async def test_project_grouped_state_single_project():
    sm = StateMachine()
    sm.boss_state = BossState.WORKING
    event_processor.sessions["sess-1"] = sm
    event_processor.project_registry.register_session("sess-1", "proj-a", "/a")

    result = await event_processor.get_project_grouped_state()
    assert result is not None
    assert len(result.projects) == 1
    assert result.projects[0].key == "proj-a"
    assert result.projects[0].session_count == 1


@pytest.mark.asyncio
async def test_project_grouped_state_multiple_projects():
    sm1 = StateMachine()
    sm2 = StateMachine()
    event_processor.sessions["s1"] = sm1
    event_processor.sessions["s2"] = sm2
    event_processor.project_registry.register_session("s1", "proj-a", "/a")
    event_processor.project_registry.register_session("s2", "proj-b", "/b")

    result = await event_processor.get_project_grouped_state()
    assert result is not None
    assert len(result.projects) == 2
    keys = {p.key for p in result.projects}
    assert keys == {"proj-a", "proj-b"}


@pytest.mark.asyncio
async def test_project_grouped_agents_have_project_key():
    sm = StateMachine()
    agent = Agent(
        id="agent-1",
        name="Finder Fred",
        color="#3B82F6",
        number=1,
        state=AgentState.WORKING,
    )
    sm.agents["agent-1"] = agent
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session("s1", "proj-a", "/a")

    result = await event_processor.get_project_grouped_state()
    assert result is not None
    assert len(result.projects[0].agents) >= 1
    for a in result.projects[0].agents:
        assert a.project_key == "proj-a"
