"""Tests for departed agent retention in StateMachine."""

import time
from unittest.mock import patch

from app.core.state_machine import StateMachine
from app.models.agents import Agent, AgentState


def _make_agent(agent_id: str, state: AgentState = AgentState.WORKING) -> Agent:
    return Agent(id=agent_id, color="#FF0000", number=1, state=state)


class TestDepartedAgentRetention:
    def test_removed_agent_appears_in_game_state(self):
        """After remove_agent, agent should still appear in to_game_state with LEAVING state."""
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.remove_agent("a1")

        state = sm.to_game_state("test-session")
        agent_ids = [a.id for a in state.agents]
        assert "a1" in agent_ids
        a1 = next(a for a in state.agents if a.id == "a1")
        assert a1.state == AgentState.LEAVING

    def test_removed_agent_not_in_active_agents(self):
        """Departed agents should NOT count as active (for MAX_AGENTS checks)."""
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.remove_agent("a1")

        assert "a1" not in sm.agents
        assert "a1" in sm.departed_agents

    def test_departed_agent_expires_after_ttl(self):
        """Departed agents should be purged after DEPARTED_TTL seconds."""
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.remove_agent("a1")

        # Fast-forward past TTL
        with patch("time.monotonic", return_value=time.monotonic() + 61):
            state = sm.to_game_state("test-session")

        agent_ids = [a.id for a in state.agents]
        assert "a1" not in agent_ids

    def test_active_agents_unaffected(self):
        """Active agents should still appear normally alongside departed ones."""
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.agents["a2"] = _make_agent("a2")
        sm.remove_agent("a1")

        state = sm.to_game_state("test-session")
        agent_ids = [a.id for a in state.agents]
        assert "a1" in agent_ids  # departed
        assert "a2" in agent_ids  # active

    def test_max_agents_ignores_departed(self):
        """MAX_AGENTS check should only count active agents, not departed."""
        sm = StateMachine()
        for i in range(sm.MAX_AGENTS):
            sm.agents[f"a{i}"] = _make_agent(f"a{i}", AgentState.WORKING)
        sm.remove_agent("a0")
        assert len(sm.agents) == sm.MAX_AGENTS - 1

    def test_remove_nonexistent_agent(self):
        """Removing a non-existent agent should not raise."""
        sm = StateMachine()
        sm.remove_agent("ghost")  # Should not raise
        assert len(sm.departed_agents) == 0
