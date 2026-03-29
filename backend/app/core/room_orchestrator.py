# backend/app/core/room_orchestrator.py
"""Room-level session orchestration for Agent Teams support.

Merges multiple session StateMachines into a single GameState.
Solo sessions (one session, no team_name) get a trivial pass-through.
Team sessions get lead/teammate/subagent character allocation and a
merged kanban board.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

from app.models.agents import Agent, AgentState, BossState, OfficeState
from app.models.sessions import GameState, KanbanTask, WhiteboardData

if TYPE_CHECKING:
    from app.core.state_machine import StateMachine

logger = logging.getLogger(__name__)

# Colors assigned to teammates in order of arrival (index 0 = first teammate)
_TEAMMATE_COLORS = [
    "#3b82f6",  # blue
    "#22c55e",  # green
    "#a855f7",  # purple
    "#f97316",  # orange
    "#ec4899",  # pink
    "#14b8a6",  # teal
]

# Maps BossState to AgentState for teammate character rendering
_BOSS_TO_AGENT: dict[BossState, AgentState] = {
    BossState.IDLE: AgentState.IDLE,
    BossState.PHONE_RINGING: AgentState.WAITING,
    BossState.ON_PHONE: AgentState.WORKING,
    BossState.RECEIVING: AgentState.THINKING,
    BossState.WORKING: AgentState.WORKING,
    BossState.DELEGATING: AgentState.WORKING,
    BossState.WAITING_PERMISSION: AgentState.WAITING_PERMISSION,
    BossState.REVIEWING: AgentState.WORKING,
    BossState.COMPLETING: AgentState.COMPLETED,
}


@dataclass
class _SessionEntry:
    session_id: str
    sm: StateMachine
    is_lead: bool
    color: str
    teammate_name: str | None


class RoomOrchestrator:
    """Merges all sessions in a room into a single GameState.

    For solo sessions (one session, no team_name), passes through unchanged.
    For team sessions, builds character hierarchy and aggregates kanban board.
    """

    def __init__(self, room_id: str) -> None:
        self.room_id = room_id
        self._sessions: dict[str, _SessionEntry] = {}

    # ------------------------------------------------------------------
    # Session registry
    # ------------------------------------------------------------------

    def add_session(self, session_id: str, sm: StateMachine) -> None:
        """Register a session. Call once when session first joins this room."""
        is_lead = sm.is_lead or (sm.team_name is not None and sm.teammate_name is None)
        if not sm.team_name:
            # No team_name -> solo session, treated as lead
            is_lead = True

        color = "#f59e0b" if is_lead else self._next_teammate_color()

        self._sessions[session_id] = _SessionEntry(
            session_id=session_id,
            sm=sm,
            is_lead=is_lead,
            color=color,
            teammate_name=sm.teammate_name,
        )

    def remove_session(self, session_id: str) -> None:
        """Deregister a session."""
        self._sessions.pop(session_id, None)

    def update_session(self, session_id: str, sm: StateMachine) -> None:
        """Update the StateMachine reference for an existing session."""
        if session_id in self._sessions:
            self._sessions[session_id].sm = sm
        else:
            self.add_session(session_id, sm)

    @property
    def is_empty(self) -> bool:
        return len(self._sessions) == 0

    @property
    def _is_solo(self) -> bool:
        return len(self._sessions) <= 1

    # ------------------------------------------------------------------
    # Merge
    # ------------------------------------------------------------------

    def merge(self) -> GameState | None:
        """Return a merged GameState from all sessions, or None if empty."""
        if not self._sessions:
            return None

        lead_entry = self._lead_entry()
        if lead_entry is None:
            return None

        lead_state = lead_entry.sm.to_game_state(lead_entry.session_id)

        if self._is_solo:
            return lead_state

        return self._merge_team(lead_entry, lead_state)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _lead_entry(self) -> _SessionEntry | None:
        for entry in self._sessions.values():
            if entry.is_lead:
                return entry
        # Fallback: first session if no explicit lead
        return next(iter(self._sessions.values()), None)

    def _next_teammate_color(self) -> str:
        teammate_count = sum(1 for e in self._sessions.values() if not e.is_lead)
        return _TEAMMATE_COLORS[teammate_count % len(_TEAMMATE_COLORS)]

    def _merge_team(self, lead_entry: _SessionEntry, lead_state: GameState) -> GameState:
        merged_agents: list[Agent] = []
        all_kanban: dict[str, KanbanTask] = {}

        # Lead's subagents -> character_type="subagent"
        for agent in lead_state.agents:
            agent.character_type = "subagent"
            agent.parent_session_id = lead_entry.session_id
            merged_agents.append(agent)

        # Lead's kanban tasks
        for task in lead_entry.sm.kanban_tasks.values():
            all_kanban[task.task_id] = KanbanTask(
                task_id=task.task_id, subject=task.subject, status=task.status,
                assignee=task.assignee, linear_id=task.linear_id,
            )

        desk_number = 0
        for session_id, entry in self._sessions.items():
            if entry.is_lead:
                continue

            tm_state = entry.sm.to_game_state(session_id)
            tm_id = f"tm-{session_id[:8]}"
            agent_state = _BOSS_TO_AGENT.get(tm_state.boss.state, AgentState.WORKING)

            # Teammate's boss -> Agent with character_type="teammate"
            merged_agents.append(Agent(
                id=tm_id,
                name=entry.teammate_name or f"Teammate-{session_id[:4]}",
                color=entry.color,
                number=desk_number,
                state=agent_state,
                desk=desk_number,
                bubble=tm_state.boss.bubble,
                current_task=tm_state.boss.current_task,
                character_type="teammate",
                parent_session_id=session_id,
            ))

            # Teammate's subagents
            for agent in tm_state.agents:
                agent.character_type = "subagent"
                agent.parent_session_id = session_id
                agent.parent_id = tm_id
                merged_agents.append(agent)

            # Teammate's kanban tasks
            for task in entry.sm.kanban_tasks.values():
                all_kanban[task.task_id] = KanbanTask(
                    task_id=task.task_id, subject=task.subject, status=task.status,
                    assignee=entry.teammate_name or task.assignee,
                    linear_id=task.linear_id,
                )

            desk_number += 1

        # Infer in_progress for active sessions
        self._infer_in_progress(all_kanban)

        merged_whiteboard = WhiteboardData(
            **lead_state.whiteboard_data.model_dump(exclude={"kanban_tasks"}),
            kanban_tasks=list(all_kanban.values()),
        )
        desk_count = max(8, desk_number + len(merged_agents) + 2)

        return GameState(
            session_id=lead_entry.session_id,
            floor_id=lead_entry.sm.floor_id,
            room_id=lead_entry.sm.room_id,
            boss=lead_state.boss,
            agents=merged_agents,
            office=OfficeState(
                desk_count=desk_count,
                elevator_state=lead_state.office.elevator_state,
                phone_state=lead_state.office.phone_state,
                context_utilization=lead_state.office.context_utilization,
                tool_uses_since_compaction=lead_state.office.tool_uses_since_compaction,
                print_report=lead_state.office.print_report,
            ),
            last_updated=datetime.now(),
            history=lead_state.history,
            todos=lead_state.todos,
            arrival_queue=lead_state.arrival_queue,
            departure_queue=lead_state.departure_queue,
            whiteboard_data=merged_whiteboard,
            conversation=lead_state.conversation,
        )

    def _infer_in_progress(self, tasks: dict[str, KanbanTask]) -> None:
        """Mark the first pending task as in_progress for each active session."""
        active_assignees: set[str | None] = set()
        for entry in self._sessions.values():
            if entry.sm.boss_state not in (BossState.IDLE, BossState.COMPLETING):
                active_assignees.add(entry.teammate_name)

        promoted: set[str | None] = set()
        for task in tasks.values():
            if (task.status == "pending" and task.assignee in active_assignees
                    and task.assignee not in promoted):
                task.status = "in_progress"
                promoted.add(task.assignee)
