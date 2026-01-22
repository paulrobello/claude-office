from datetime import datetime
from typing import TypedDict, cast

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.models.agents import Agent, Boss, OfficeState
from app.models.common import TodoItem


class AgentLifespan(BaseModel):
    """Timeline entry for agent lifespan tracking."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    agent_id: str
    agent_name: str
    color: str
    start_time: str
    end_time: str | None = None  # None = still active


class NewsItem(BaseModel):
    """News ticker item for the whiteboard."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    category: str
    headline: str
    timestamp: str


class FileEdit(BaseModel):
    """File edit tracking for heat map display."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    file_path: str
    edit_count: int


class WhiteboardData(BaseModel):
    """Data for whiteboard display modes."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    tool_usage: dict[str, int] = Field(default_factory=dict)
    task_completed_count: int = 0
    bug_fixed_count: int = 0
    coffee_break_count: int = 0
    code_written_count: int = 0
    recent_error_count: int = 0
    recent_success_count: int = 0
    activity_level: float = 0.0
    consecutive_successes: int = 0
    last_incident_time: str | None = None
    agent_lifespans: list[AgentLifespan] = Field(
        default_factory=lambda: cast(list[AgentLifespan], [])
    )
    news_items: list[NewsItem] = Field(default_factory=lambda: cast(list[NewsItem], []))
    coffee_cups: int = 0
    file_edits: dict[str, int] = Field(default_factory=dict)


class Session(BaseModel):
    """A Claude Code session summary."""

    id: str
    created_at: datetime
    updated_at: datetime
    status: str  # "active" | "completed" | "error"
    event_count: int
    agent_count: int


class HistoryEntry(TypedDict):
    """A single entry in the event history log."""

    id: str
    type: str
    agentId: str
    summary: str
    timestamp: str


class GameState(BaseModel):
    """Complete state of the office visualization for frontend rendering."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str
    boss: Boss
    agents: list[Agent]
    office: OfficeState
    last_updated: datetime
    history: list[HistoryEntry] = Field(default_factory=lambda: cast(list[HistoryEntry], []))
    todos: list[TodoItem] = Field(default_factory=lambda: cast(list[TodoItem], []))
    arrival_queue: list[str] = Field(default_factory=lambda: cast(list[str], []))
    departure_queue: list[str] = Field(default_factory=lambda: cast(list[str], []))
    whiteboard_data: WhiteboardData = Field(default_factory=WhiteboardData)
