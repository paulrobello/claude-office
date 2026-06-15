# backend/tests/test_room_orchestrator.py
"""Tests for RoomOrchestrator: session merging, character types, kanban aggregation."""

from app.core.room_orchestrator import RoomOrchestrator, build_overview
from app.core.state_machine import StateMachine
from app.models.agents import Agent, AgentState, BossState
from app.models.common import TodoItem, TodoStatus
from app.models.events import Event, EventData, EventType


def _make_sm(
    team_name: str | None = None, teammate_name: str | None = None, is_lead: bool = False
) -> StateMachine:
    sm = StateMachine()
    sm.team_name = team_name
    sm.teammate_name = teammate_name
    sm.is_lead = is_lead
    sm.floor_id = "floor-1"
    sm.room_id = "room-1"
    return sm


def _task_created(task_id: str, subject: str) -> Event:
    return Event(
        event_type=EventType.TASK_CREATED,
        session_id="s",
        data=EventData(task_id=task_id, task_subject=subject),
    )


def _task_completed(task_id: str) -> Event:
    return Event(
        event_type=EventType.TASK_COMPLETED,
        session_id="s",
        data=EventData(task_id=task_id),
    )


class TestSoloPassThrough:
    def test_solo_merge_returns_game_state(self) -> None:
        orch = RoomOrchestrator("room-1")
        sm = _make_sm()
        sm.boss_state = BossState.IDLE
        orch.add_session("sess-1", sm)
        state = orch.merge()
        assert state is not None
        assert state.session_id == "sess-1"

    def test_solo_merge_is_pass_through(self) -> None:
        """Solo sessions: no character_type assigned, original agents unchanged."""
        orch = RoomOrchestrator("room-1")
        sm = _make_sm()
        orch.add_session("sess-1", sm)
        state = orch.merge()
        assert state is not None
        # For solo, agents list has no teammates injected
        teammate_agents = [a for a in state.agents if a.character_type == "teammate"]
        assert len(teammate_agents) == 0

    def test_empty_orchestrator_returns_none(self) -> None:
        orch = RoomOrchestrator("room-1")
        assert orch.merge() is None


class TestTeamMerge:
    def test_lead_boss_stays_as_boss(self) -> None:
        orch = RoomOrchestrator("room-1")
        lead_sm = _make_sm(team_name="squad", is_lead=True)
        lead_sm.boss_state = BossState.WORKING
        orch.add_session("lead-sess", lead_sm)

        tm_sm = _make_sm(team_name="squad", teammate_name="implementer")
        orch.add_session("tm-sess", tm_sm)

        state = orch.merge()
        assert state is not None
        assert state.boss.state == BossState.WORKING

    def test_teammate_boss_appears_as_agent_with_teammate_type(self) -> None:
        orch = RoomOrchestrator("room-1")
        orch.add_session("lead-sess", _make_sm(team_name="squad", is_lead=True))
        tm_sm = _make_sm(team_name="squad", teammate_name="implementer")
        orch.add_session("tm-sess", tm_sm)

        state = orch.merge()
        assert state is not None
        teammate_agents = [a for a in state.agents if a.character_type == "teammate"]
        assert len(teammate_agents) == 1
        assert teammate_agents[0].name == "implementer"

    def test_lead_subagents_have_subagent_type(self) -> None:
        from app.models.agents import Agent

        orch = RoomOrchestrator("room-1")
        lead_sm = _make_sm(team_name="squad", is_lead=True)
        lead_sm.agents["sub-1"] = Agent(
            id="sub-1", color="#aaa", number=0, state=AgentState.WORKING
        )
        orch.add_session("lead-sess", lead_sm)
        orch.add_session("tm-sess", _make_sm(team_name="squad", teammate_name="tm"))

        state = orch.merge()
        assert state is not None
        subagent_agents = [a for a in state.agents if a.character_type == "subagent"]
        assert any(a.id == "sub-1" for a in subagent_agents)

    def test_teammate_subagents_linked_to_parent(self) -> None:
        from app.models.agents import Agent

        orch = RoomOrchestrator("room-1")
        orch.add_session("lead-sess", _make_sm(team_name="squad", is_lead=True))
        tm_sm = _make_sm(team_name="squad", teammate_name="tm")
        tm_sm.agents["sub-tm"] = Agent(
            id="sub-tm", color="#aaa", number=0, state=AgentState.WORKING
        )
        orch.add_session("tm-sess", tm_sm)

        state = orch.merge()
        assert state is not None
        tm_sub = next((a for a in state.agents if a.id == "sub-tm"), None)
        assert tm_sub is not None
        assert tm_sub.character_type == "subagent"
        assert tm_sub.parent_id is not None


class TestKanbanAggregation:
    def test_kanban_tasks_merged_from_all_sessions(self) -> None:
        orch = RoomOrchestrator("room-1")
        lead_sm = _make_sm(team_name="squad", is_lead=True)
        lead_sm.transition(_task_created("t1", "Lead task"))
        orch.add_session("lead-sess", lead_sm)

        tm_sm = _make_sm(team_name="squad", teammate_name="tm")
        tm_sm.teammate_name = "tm"
        tm_sm.transition(_task_created("t2", "TM task"))
        orch.add_session("tm-sess", tm_sm)

        state = orch.merge()
        assert state is not None
        task_ids = {t.task_id for t in state.whiteboard_data.kanban_tasks}
        assert "t1" in task_ids
        assert "t2" in task_ids

    def test_completed_task_status_preserved(self) -> None:
        orch = RoomOrchestrator("room-1")
        sm = _make_sm(team_name="squad", is_lead=True)
        sm.transition(_task_created("t1", "Work"))
        sm.transition(_task_completed("t1"))
        orch.add_session("lead-sess", sm)
        orch.add_session("tm-sess", _make_sm(team_name="squad", teammate_name="tm"))

        state = orch.merge()
        assert state is not None
        task = next(t for t in state.whiteboard_data.kanban_tasks if t.task_id == "t1")
        assert task.status == "completed"


class TestSessionLifecycle:
    def test_remove_session(self) -> None:
        orch = RoomOrchestrator("room-1")
        orch.add_session("sess-1", _make_sm())
        orch.remove_session("sess-1")
        assert orch.merge() is None

    def test_update_session(self) -> None:
        orch = RoomOrchestrator("room-1")
        sm = _make_sm()
        orch.add_session("sess-1", sm)
        sm2 = _make_sm()
        sm2.boss_state = BossState.WORKING
        orch.update_session("sess-1", sm2)
        state = orch.merge()
        assert state is not None
        assert state.boss.state == BossState.WORKING


class TestBuildOverview:
    def test_empty(self) -> None:
        ov = build_overview({})
        assert ov.entries == []

    def test_one_peer_per_session(self) -> None:
        a, b = _make_sm(), _make_sm()
        a.boss_state = BossState.WORKING
        b.boss_state = BossState.IDLE
        ov = build_overview({"s-a": a, "s-b": b})
        by_id = {e.session_id: e for e in ov.entries}
        assert set(by_id) == {"s-a", "s-b"}

    def test_bucket_mapping(self) -> None:
        cases = {
            BossState.WAITING_PERMISSION: "needs_you",
            BossState.PHONE_RINGING: "needs_you",
            BossState.WORKING: "working",
            BossState.DELEGATING: "working",
            BossState.REVIEWING: "working",
            BossState.IDLE: "done",
            BossState.COMPLETING: "done",
        }
        for state, expected in cases.items():
            sm = _make_sm()
            sm.boss_state = state
            ov = build_overview({"s": sm})
            assert ov.entries[0].bucket == expected
            assert ov.entries[0].state == state

    def test_idle_mid_turn_stays_working(self) -> None:
        # The boss drops to IDLE between tool calls; while the turn is still
        # running the terminal must not flicker into the "done" zone.
        sm = _make_sm()
        sm.boss_state = BossState.IDLE
        sm.turn_active = True
        assert build_overview({"s": sm}).entries[0].bucket == "working"

    def test_idle_with_live_subagents_stays_working(self) -> None:
        # A subagent stop flips the boss to IDLE, but if children are still
        # present the parent counts as working.
        sm = _make_sm()
        sm.boss_state = BossState.IDLE
        sm.turn_active = False
        sm.agents = {"x": Agent(id="x", color="#fff", number=0, state=AgentState.WORKING)}
        assert build_overview({"s": sm}).entries[0].bucket == "working"

    def test_idle_after_turn_is_done(self) -> None:
        # No active turn and no subagents -> genuinely idle/waiting.
        sm = _make_sm()
        sm.boss_state = BossState.IDLE
        sm.turn_active = False
        assert build_overview({"s": sm}).entries[0].bucket == "done"

    def test_needs_you_wins_over_turn_active(self) -> None:
        # Blocked-on-user states must surface even mid-turn.
        sm = _make_sm()
        sm.boss_state = BossState.WAITING_PERMISSION
        sm.turn_active = True
        assert build_overview({"s": sm}).entries[0].bucket == "needs_you"

    def test_todo_counts_and_subagents(self) -> None:
        sm = _make_sm()
        sm.boss_state = BossState.WORKING
        sm.boss_current_task = "refactor auth"
        sm.todos = [
            TodoItem(content="a", status=TodoStatus.COMPLETED),
            TodoItem(content="b", status=TodoStatus.IN_PROGRESS),
            TodoItem(content="c", status=TodoStatus.PENDING),
        ]
        sm.agents = {
            "x": Agent(id="x", color="#fff", number=0, state=AgentState.WORKING),
            "y": Agent(id="y", color="#fff", number=1, state=AgentState.WORKING),
        }
        entry = build_overview({"s": sm}).entries[0]
        assert entry.current_task == "refactor auth"
        assert (entry.todo_done, entry.todo_total) == (1, 3)
        assert entry.subagent_count == 2
