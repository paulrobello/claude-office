"""Tests for Phase 4 StateMachine: team fields and kanban tracking."""

from typing import Any

from app.core.state_machine import StateMachine
from app.models.agents import BossState
from app.models.common import BubbleContent, BubbleType
from app.models.events import Event, EventData, EventType


def _make_event(event_type: EventType, **kwargs: Any) -> Event:
    return Event(event_type=event_type, session_id="s1", data=EventData(**kwargs))


class TestStateMachineTeamFields:
    def test_team_fields_default_none(self) -> None:
        sm = StateMachine()
        assert sm.team_name is None
        assert sm.teammate_name is None
        assert sm.is_lead is False

    def test_kanban_tasks_default_empty(self) -> None:
        sm = StateMachine()
        assert sm.kanban_tasks == {}


class TestTaskCreatedTransition:
    def test_task_created_adds_kanban_task(self) -> None:
        sm = StateMachine()
        event = _make_event(
            EventType.TASK_CREATED,
            task_id="t1",
            task_subject="Fix login bug",
            team_name="my-team",
        )
        sm.transition(event)
        assert "t1" in sm.kanban_tasks
        assert sm.kanban_tasks["t1"].subject == "Fix login bug"
        assert sm.kanban_tasks["t1"].status == "pending"

    def test_task_created_parses_linear_id(self) -> None:
        sm = StateMachine()
        event = _make_event(
            EventType.TASK_CREATED,
            task_id="t2",
            task_subject="Fix auth [REC-42]",
        )
        sm.transition(event)
        assert sm.kanban_tasks["t2"].linear_id == "REC-42"

    def test_task_created_no_linear_id_when_absent(self) -> None:
        sm = StateMachine()
        event = _make_event(EventType.TASK_CREATED, task_id="t3", task_subject="Plain task")
        sm.transition(event)
        assert sm.kanban_tasks["t3"].linear_id is None

    def test_task_created_stores_assignee_from_teammate_name(self) -> None:
        sm = StateMachine()
        sm.teammate_name = "implementer"
        event = _make_event(EventType.TASK_CREATED, task_id="t4", task_subject="Build X")
        sm.transition(event)
        assert sm.kanban_tasks["t4"].assignee == "implementer"

    def test_task_created_skipped_when_no_task_id(self) -> None:
        sm = StateMachine()
        event = _make_event(EventType.TASK_CREATED, task_subject="No ID")
        sm.transition(event)
        assert len(sm.kanban_tasks) == 0


class TestTaskCompletedTransition:
    def test_task_completed_marks_existing_task(self) -> None:
        sm = StateMachine()
        sm.transition(_make_event(EventType.TASK_CREATED, task_id="t1", task_subject="Work"))
        sm.transition(_make_event(EventType.TASK_COMPLETED, task_id="t1"))
        assert sm.kanban_tasks["t1"].status == "completed"

    def test_task_completed_creates_task_if_unseen(self) -> None:
        sm = StateMachine()
        sm.transition(_make_event(EventType.TASK_COMPLETED, task_id="new-t", task_subject="Done"))
        assert "new-t" in sm.kanban_tasks
        assert sm.kanban_tasks["new-t"].status == "completed"

    def test_task_completed_skipped_when_no_task_id(self) -> None:
        sm = StateMachine()
        sm.transition(_make_event(EventType.TASK_COMPLETED))
        assert len(sm.kanban_tasks) == 0


class TestTeammateIdleTransition:
    def test_teammate_idle_sets_boss_state_idle(self) -> None:
        sm = StateMachine()
        sm.boss_state = BossState.WORKING
        sm.transition(_make_event(EventType.TEAMMATE_IDLE))
        assert sm.boss_state == BossState.IDLE

    def test_teammate_idle_clears_boss_bubble(self) -> None:
        sm = StateMachine()
        sm.boss_bubble = BubbleContent(type=BubbleType.THOUGHT, text="Thinking...")
        sm.transition(_make_event(EventType.TEAMMATE_IDLE))
        assert sm.boss_bubble is None


class TestKanbanInGameState:
    def test_game_state_includes_kanban_tasks(self) -> None:
        sm = StateMachine()
        sm.transition(_make_event(EventType.TASK_CREATED, task_id="t1", task_subject="Work"))
        state = sm.to_game_state("s1")
        assert len(state.whiteboard_data.kanban_tasks) == 1
        assert state.whiteboard_data.kanban_tasks[0].task_id == "t1"
