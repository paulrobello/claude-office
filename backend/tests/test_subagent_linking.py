"""Tests for subagent resolution and fallback linking logic."""

from app.core.state_machine import ResolvedAgent, resolve_agent_for_stop
from app.models.agents import Agent, AgentState


def create_test_agent(
    agent_id: str,
    native_id: str | None = None,
    state: AgentState = AgentState.ARRIVING,
) -> Agent:
    """Create a test agent with minimal required fields."""
    return Agent(
        id=agent_id,
        native_id=native_id,
        name=f"Agent-{agent_id[-4:]}",
        color="#3B82F6",
        number=1,
        state=state,
    )


class TestResolveAgentForStop:
    """Tests for resolve_agent_for_stop function."""

    def test_direct_agent_id_match(self) -> None:
        """Should resolve by direct agent_id when present."""
        agents = {"agent_123": create_test_agent("agent_123", native_id="abc123")}
        arrival_queue = ["agent_123"]

        result = resolve_agent_for_stop(
            agents=agents,
            arrival_queue=arrival_queue,
            agent_id="agent_123",
            native_agent_id="abc123",
        )

        assert result is not None
        assert result.agent_id == "agent_123"
        assert result.agent.native_id == "abc123"
        assert not result.was_late_linked

    def test_agent_id_match_ignores_native_id(self) -> None:
        """Direct agent_id should take precedence over native_id lookup."""
        agents = {
            "agent_123": create_test_agent("agent_123", native_id="abc123"),
            "agent_456": create_test_agent("agent_456", native_id="def456"),
        }
        arrival_queue = ["agent_123", "agent_456"]

        # Even though native_id matches agent_456, agent_id should win
        result = resolve_agent_for_stop(
            agents=agents,
            arrival_queue=arrival_queue,
            agent_id="agent_123",
            native_agent_id="def456",  # This belongs to agent_456
        )

        assert result is not None
        assert result.agent_id == "agent_123"

    def test_native_id_match(self) -> None:
        """Should resolve by native_id when agent_id is not provided."""
        agents = {"subagent_abc123": create_test_agent("subagent_abc123", native_id="abc123")}
        arrival_queue = ["subagent_abc123"]

        result = resolve_agent_for_stop(
            agents=agents,
            arrival_queue=arrival_queue,
            agent_id=None,
            native_agent_id="abc123",
        )

        assert result is not None
        assert result.agent_id == "subagent_abc123"
        assert result.agent.native_id == "abc123"
        assert not result.was_late_linked

    def test_fallback_link_single_unlinked_agent(self) -> None:
        """Should late-link a single unlinked agent when native_id not found."""
        agents = {"subagent_xyz": create_test_agent("subagent_xyz", native_id=None)}
        arrival_queue = ["subagent_xyz"]

        result = resolve_agent_for_stop(
            agents=agents,
            arrival_queue=arrival_queue,
            agent_id=None,
            native_agent_id="new_native_id",
        )

        assert result is not None
        assert result.agent_id == "subagent_xyz"
        assert result.agent.native_id == "new_native_id"
        assert result.was_late_linked

    def test_fallback_link_prefers_oldest_from_arrival_queue(self) -> None:
        """When multiple unlinked agents exist, should link the oldest (FIFO)."""
        agents = {
            "agent_001": create_test_agent("agent_001", native_id=None),
            "agent_002": create_test_agent("agent_002", native_id=None),
            "agent_003": create_test_agent("agent_003", native_id="already_linked"),
        }
        arrival_queue = ["agent_001", "agent_002", "agent_003"]

        result = resolve_agent_for_stop(
            agents=agents,
            arrival_queue=arrival_queue,
            agent_id=None,
            native_agent_id="new_native_id",
        )

        assert result is not None
        # Should link agent_001 (first in arrival_queue with native_id=None)
        assert result.agent_id == "agent_001"
        assert result.agent.native_id == "new_native_id"
        assert result.was_late_linked

    def test_fallback_link_skips_already_linked_in_queue(self) -> None:
        """Should skip agents with native_id already set."""
        agents = {
            "agent_linked": create_test_agent("agent_linked", native_id="existing123"),
            "agent_unlinked": create_test_agent("agent_unlinked", native_id=None),
        }
        arrival_queue = ["agent_linked", "agent_unlinked"]

        result = resolve_agent_for_stop(
            agents=agents,
            arrival_queue=arrival_queue,
            agent_id=None,
            native_agent_id="new_native_id",
        )

        assert result is not None
        assert result.agent_id == "agent_unlinked"
        assert result.agent.native_id == "new_native_id"

    def test_fallback_link_agent_not_in_arrival_queue(self) -> None:
        """Should still link agents not in arrival_queue as last resort."""
        agents = {
            "orphan_agent": create_test_agent("orphan_agent", native_id=None),
        }
        arrival_queue: list[str] = []  # Empty queue

        result = resolve_agent_for_stop(
            agents=agents,
            arrival_queue=arrival_queue,
            agent_id=None,
            native_agent_id="new_native_id",
        )

        assert result is not None
        assert result.agent_id == "orphan_agent"
        assert result.agent.native_id == "new_native_id"
        assert result.was_late_linked

    def test_returns_none_when_no_match_and_no_unlinked(self) -> None:
        """Should return None when agent not found and all agents are linked."""
        agents = {
            "agent_001": create_test_agent("agent_001", native_id="native_001"),
            "agent_002": create_test_agent("agent_002", native_id="native_002"),
        }
        arrival_queue = ["agent_001", "agent_002"]

        result = resolve_agent_for_stop(
            agents=agents,
            arrival_queue=arrival_queue,
            agent_id=None,
            native_agent_id="unknown_native_id",
        )

        assert result is None

    def test_returns_none_when_no_ids_provided(self) -> None:
        """Should return None when neither agent_id nor native_agent_id provided."""
        agents = {"agent_001": create_test_agent("agent_001", native_id=None)}
        arrival_queue = ["agent_001"]

        result = resolve_agent_for_stop(
            agents=agents,
            arrival_queue=arrival_queue,
            agent_id=None,
            native_agent_id=None,
        )

        assert result is None

    def test_returns_none_when_agent_id_not_found_and_no_native_id(self) -> None:
        """Should return None when agent_id not found and no native_id to fallback."""
        agents = {"agent_001": create_test_agent("agent_001", native_id=None)}
        arrival_queue = ["agent_001"]

        result = resolve_agent_for_stop(
            agents=agents,
            arrival_queue=arrival_queue,
            agent_id="nonexistent_agent",
            native_agent_id=None,
        )

        assert result is None

    def test_empty_agents_returns_none(self) -> None:
        """Should return None when no agents exist."""
        agents: dict[str, Agent] = {}
        arrival_queue: list[str] = []

        result = resolve_agent_for_stop(
            agents=agents,
            arrival_queue=arrival_queue,
            agent_id=None,
            native_agent_id="any_id",
        )

        assert result is None


class TestResolvedAgent:
    """Tests for ResolvedAgent dataclass."""

    def test_was_late_linked_defaults_to_false(self) -> None:
        """was_late_linked should default to False."""
        agent = create_test_agent("test", native_id="123")
        resolved = ResolvedAgent(agent_id="test", agent=agent)
        assert resolved.was_late_linked is False

    def test_was_late_linked_can_be_set_true(self) -> None:
        """was_late_linked can be explicitly set to True."""
        agent = create_test_agent("test", native_id=None)
        resolved = ResolvedAgent(agent_id="test", agent=agent, was_late_linked=True)
        assert resolved.was_late_linked is True
