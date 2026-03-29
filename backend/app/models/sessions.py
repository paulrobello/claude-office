from datetime import datetime
from typing import NotRequired, TypedDict, cast

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.models.agents import Agent, Boss, OfficeState
from app.models.common import TodoItem

__all__ = [
    "ConversationEntry",
    "AgentLifespan",
    "NewsItem",
    "FileEdit",
    "BackgroundTask",
    "KanbanTask",
    "WhiteboardData",
    "Session",
    "HistoryEntry",
    "GameState",
]


class ConversationEntry(TypedDict):
    """A single turn in the conversation history."""

    id: str
    role: str  # "user" | "assistant" | "thinking" | "tool"
    agentId: str
    text: str
    timestamp: str
    toolName: NotRequired[str]  # Only set for "tool" role entries


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


class BackgroundTask(BaseModel):
    """Background task tracking for remote workers display."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    task_id: str
    status: str  # "completed" | "failed" | "running"
    summary: str | None = None
    started_at: str | None = None
    completed_at: str | None = None


class KanbanTask(BaseModel):
    """A task on the team kanban board."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    task_id: str
    subject: str
    status: str  # "pending" | "in_progress" | "completed"
    assignee: str | None = None  # teammate_name if available
    linear_id: str | None = None  # parsed from subject, e.g. "REC-42"


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
    background_tasks: list[BackgroundTask] = Field(
        default_factory=lambda: cast(list[BackgroundTask], [])
    )
    # Kanban board tasks (Phase 4) — aggregated across all team sessions
    kanban_tasks: list[KanbanTask] = Field(default_factory=lambda: cast(list[KanbanTask], []))


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
    detail: dict[str, object]


class GameState(BaseModel):
    """Complete state of the office visualization for frontend rendering."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str
    floor_id: str | None = None
    room_id: str | None = None
    boss: Boss
    agents: list[Agent]
    office: OfficeState
    last_updated: datetime
    history: list[HistoryEntry] = Field(default_factory=lambda: cast(list[HistoryEntry], []))
    todos: list[TodoItem] = Field(default_factory=lambda: cast(list[TodoItem], []))
    arrival_queue: list[str] = Field(default_factory=lambda: cast(list[str], []))
    departure_queue: list[str] = Field(default_factory=lambda: cast(list[str], []))
    whiteboard_data: WhiteboardData = Field(default_factory=WhiteboardData)
    conversation: list[ConversationEntry] = Field(
        default_factory=lambda: cast(list[ConversationEntry], [])
    )
