"""Aggregates all active sessions into a compact BuildingState for /ws/building.

Mirrors the layering of RoomOrchestrator but groups by FLOOR (not room) and
emits a lightweight projection. Reads in-memory StateMachines from the
EventProcessor; a session counts as active when its phase is neither EMPTY
nor ENDED.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.floor_config import BuildingConfig
from app.core.state_machine import OfficePhase
from app.models.building import (
    AgentLive,
    BuildingState,
    BuildingTotals,
    FloorLive,
    LobbyLive,
    SessionLive,
)

if TYPE_CHECKING:
    from app.core.state_machine import StateMachine

_BOSS_COLOR = "#f59e0b"
_TASK_MAX_LEN = 80


def _truncate(text: str | None, limit: int = _TASK_MAX_LEN) -> str | None:
    if text is None:
        return None
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _project_session(session_id: str, sm: StateMachine, display_name: str) -> SessionLive:
    agents = [
        AgentLive(
            id=a.id,
            name=a.name,
            state=str(a.state),
            task=_truncate(a.current_task),
            color=a.color,
        )
        for a in sm.agents.values()
    ]
    return SessionLive(
        session_id=session_id,
        display_name=display_name,
        boss_state=str(sm.boss_state),
        boss_task=_truncate(sm.boss_current_task),
        agents=agents,
    )


class BuildingOrchestrator:
    """Builds a compact BuildingState from all active sessions."""

    def __init__(self) -> None:
        self._last_activity: dict[str, str] = {}

    def record_activity(self, floor_id: str | None, timestamp: str) -> None:
        """Record the last activity time for a floor (drives the glow indicator)."""
        if floor_id:
            self._last_activity[floor_id] = timestamp

    def build_state(
        self,
        sessions: dict[str, StateMachine],
        config: BuildingConfig,
        display_names: dict[str, str] | None = None,
    ) -> BuildingState:
        names = display_names or {}

        active = {
            sid: sm
            for sid, sm in sessions.items()
            if sm.phase not in (OfficePhase.EMPTY, OfficePhase.ENDED)
        }

        by_floor: dict[str, list[tuple[str, StateMachine]]] = {}
        lobby_entries: list[tuple[str, StateMachine]] = []
        for sid, sm in active.items():
            if sm.floor_id and config.get_floor(sm.floor_id):
                by_floor.setdefault(sm.floor_id, []).append((sid, sm))
            else:
                lobby_entries.append((sid, sm))

        floors: list[FloorLive] = []
        active_floors = 0
        active_agents = 0
        for floor in sorted(config.floors, key=lambda f: f.floor_number, reverse=True):
            entries = by_floor.get(floor.id, [])
            sessions_live = [
                _project_session(sid, sm, names.get(sid, sid)) for sid, sm in entries
            ]
            agent_count = sum(1 + len(s.agents) for s in sessions_live)
            is_active = len(sessions_live) > 0
            if is_active:
                active_floors += 1
                active_agents += agent_count
            floors.append(
                FloorLive(
                    floor_id=floor.id,
                    name=floor.name,
                    floor_number=floor.floor_number,
                    accent=floor.accent,
                    icon=floor.icon,
                    sessions=sessions_live,
                    agent_count=agent_count,
                    is_active=is_active,
                    last_activity_at=self._last_activity.get(floor.id),
                )
            )

        lobby_sessions = [
            _project_session(sid, sm, names.get(sid, sid)) for sid, sm in lobby_entries
        ]
        lobby_agents = sum(1 + len(s.agents) for s in lobby_sessions)
        active_agents += lobby_agents

        return BuildingState(
            building_name=config.building_name,
            floors=floors,
            lobby=LobbyLive(sessions=lobby_sessions, agent_count=lobby_agents),
            totals=BuildingTotals(
                active_agents=active_agents,
                active_floors=active_floors,
                active_sessions=len(active),
            ),
        )
