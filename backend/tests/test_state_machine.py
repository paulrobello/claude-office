"""Tests for state machine logic."""

from app.core.state_machine import OfficePhase, StateMachine
from app.models.agents import AgentState, BossState


class TestStateMachineInit:
    """Tests for StateMachine initialization."""

    def test_initial_phase_is_empty(self) -> None:
        """Initial phase should be EMPTY."""
        sm = StateMachine()
        assert sm.phase == OfficePhase.EMPTY

    def test_initial_boss_state_is_idle(self) -> None:
        """Initial boss state should be IDLE."""
        sm = StateMachine()
        assert sm.boss_state == BossState.IDLE

    def test_initial_agents_empty(self) -> None:
        """Initial agents dict should be empty."""
        sm = StateMachine()
        assert len(sm.agents) == 0

    def test_initial_queues_empty(self) -> None:
        """Initial queues should be empty."""
        sm = StateMachine()
        assert len(sm.arrival_queue) == 0
        assert len(sm.handin_queue) == 0

    def test_initial_token_counts_zero(self) -> None:
        """Initial token counts should be zero."""
        sm = StateMachine()
        assert sm.total_input_tokens == 0
        assert sm.total_output_tokens == 0

    def test_initial_tool_uses_zero(self) -> None:
        """Initial tool uses counter should be zero."""
        sm = StateMachine()
        assert sm.tool_uses_since_compaction == 0


class TestRemoveAgent:
    """Tests for remove_agent method."""

    def test_remove_existing_agent(self) -> None:
        """Should remove agent from agents dict."""
        sm = StateMachine()
        from app.models.agents import Agent

        sm.agents["agent1"] = Agent(
            id="agent1", name="Test", color="#ff0000", number=1, state=AgentState.WORKING
        )
        sm.remove_agent("agent1")
        assert "agent1" not in sm.agents

    def test_remove_agent_from_arrival_queue(self) -> None:
        """Should remove agent from arrival queue."""
        sm = StateMachine()
        from app.models.agents import Agent

        sm.agents["agent1"] = Agent(
            id="agent1", name="Test", color="#ff0000", number=1, state=AgentState.ARRIVING
        )
        sm.arrival_queue.append("agent1")
        sm.remove_agent("agent1")
        assert "agent1" not in sm.arrival_queue

    def test_remove_agent_from_handin_queue(self) -> None:
        """Should remove agent from handin queue."""
        sm = StateMachine()
        from app.models.agents import Agent

        sm.agents["agent1"] = Agent(
            id="agent1", name="Test", color="#ff0000", number=1, state=AgentState.COMPLETED
        )
        sm.handin_queue.append("agent1")
        sm.remove_agent("agent1")
        assert "agent1" not in sm.handin_queue

    def test_remove_nonexistent_agent_no_error(self) -> None:
        """Removing nonexistent agent should not raise error."""
        sm = StateMachine()
        sm.remove_agent("nonexistent")  # Should not raise


class TestToGameState:
    """Tests for to_game_state method."""

    def test_returns_game_state_object(self) -> None:
        """Should return a GameState object."""
        sm = StateMachine()
        state = sm.to_game_state("test_session")
        assert state.session_id == "test_session"

    def test_boss_state_copied(self) -> None:
        """Boss state should be included in game state."""
        sm = StateMachine()
        sm.boss_state = BossState.WORKING
        state = sm.to_game_state("test")
        assert state.boss.state == BossState.WORKING

    def test_desk_count_minimum_8(self) -> None:
        """Desk count should be at least 8."""
        sm = StateMachine()
        state = sm.to_game_state("test")
        assert state.office.desk_count >= 8

    def test_desk_count_capped_at_max_agents(self) -> None:
        """Desk count should not exceed MAX_AGENTS."""
        sm = StateMachine()
        from app.models.agents import Agent

        # Add 10 agents (more than MAX_AGENTS=8)
        for i in range(10):
            sm.agents[f"agent{i}"] = Agent(
                id=f"agent{i}",
                name=f"Test{i}",
                color="#ff0000",
                number=i,
                state=AgentState.WORKING,
            )
        state = sm.to_game_state("test")
        assert state.office.desk_count == StateMachine.MAX_AGENTS

    def test_context_utilization_calculated(self) -> None:
        """Context utilization should be calculated from tokens."""
        sm = StateMachine()
        sm.total_input_tokens = 100_000
        sm.total_output_tokens = 50_000
        state = sm.to_game_state("test")
        # 150,000 / 200,000 = 0.75
        assert state.office.context_utilization == 0.75

    def test_context_utilization_capped_at_1(self) -> None:
        """Context utilization should be capped at 1.0."""
        sm = StateMachine()
        sm.total_input_tokens = 300_000
        sm.total_output_tokens = 100_000
        state = sm.to_game_state("test")
        assert state.office.context_utilization == 1.0

    def test_queues_copied(self) -> None:
        """Queues should be copied to game state."""
        sm = StateMachine()
        sm.arrival_queue = ["a1", "a2"]
        sm.handin_queue = ["a3"]
        state = sm.to_game_state("test")
        assert state.arrival_queue == ["a1", "a2"]
        assert state.departure_queue == ["a3"]

    def test_tool_uses_included(self) -> None:
        """Tool uses counter should be in office state."""
        sm = StateMachine()
        sm.tool_uses_since_compaction = 42
        state = sm.to_game_state("test")
        assert state.office.tool_uses_since_compaction == 42

    def test_print_report_included(self) -> None:
        """Print report flag should be in office state."""
        sm = StateMachine()
        sm.print_report = True
        state = sm.to_game_state("test")
        assert state.office.print_report is True


class TestOfficePhase:
    """Tests for OfficePhase enum."""

    def test_all_phases_exist(self) -> None:
        """All expected phases should exist."""
        phases = [
            OfficePhase.EMPTY,
            OfficePhase.STARTING,
            OfficePhase.IDLE,
            OfficePhase.WORKING,
            OfficePhase.DELEGATING,
            OfficePhase.BUSY,
            OfficePhase.COMPLETING,
            OfficePhase.ENDED,
        ]
        assert len(phases) == 8

    def test_phases_are_unique(self) -> None:
        """All phases should have unique values."""
        values = [p.value for p in OfficePhase]
        assert len(values) == len(set(values))
