"""Compact building-level models for the live all-floors view.

Intentionally lightweight projections (no positions, history, whiteboard, or
conversation) so the /ws/building feed stays small even with many sessions.
"""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

__all__ = [
    "AgentLive",
    "SessionLive",
    "FloorLive",
    "LobbyLive",
    "BuildingTotals",
    "BuildingState",
]


class AgentLive(BaseModel):
    """A single agent projected for the building view."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    name: str | None = None
    state: str
    task: str | None = None
    color: str


class SessionLive(BaseModel):
    """One active session within a floor (or the lobby)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str
    display_name: str
    boss_state: str
    boss_task: str | None = None
    boss_color: str | None = None
    agents: list[AgentLive] = Field(default_factory=list[AgentLive])


class FloorLive(BaseModel):
    """One floor of the building with its active sessions."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    floor_id: str
    name: str
    floor_number: int
    accent: str
    icon: str
    sessions: list[SessionLive] = Field(default_factory=list[SessionLive])
    agent_count: int = 0
    is_active: bool = False
    last_activity_at: str | None = None


class LobbyLive(BaseModel):
    """Active sessions not assigned to any floor."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    sessions: list[SessionLive] = Field(default_factory=list[SessionLive])
    agent_count: int = 0


class BuildingTotals(BaseModel):
    """Aggregate counts across the whole building."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    active_agents: int = 0
    active_floors: int = 0
    active_sessions: int = 0


class BuildingState(BaseModel):
    """Complete compact state for the all-floors building view."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    building_name: str
    floors: list[FloorLive] = Field(default_factory=list[FloorLive])
    lobby: LobbyLive = Field(default_factory=LobbyLive)
    totals: BuildingTotals = Field(default_factory=BuildingTotals)
