from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from app.models.common import BubbleContent, SpeechContent


class EventType(StrEnum):
    """Types of events sent from Claude Code hooks."""

    SESSION_START = "session_start"
    SESSION_END = "session_end"
    PRE_TOOL_USE = "pre_tool_use"
    POST_TOOL_USE = "post_tool_use"
    USER_PROMPT_SUBMIT = "user_prompt_submit"
    PERMISSION_REQUEST = "permission_request"
    NOTIFICATION = "notification"
    SUBAGENT_START = "subagent_start"
    SUBAGENT_INFO = "subagent_info"
    SUBAGENT_STOP = "subagent_stop"
    AGENT_UPDATE = "agent_update"
    STOP = "stop"
    CLEANUP = "cleanup"
    CONTEXT_COMPACTION = "context_compaction"
    REPORTING = "reporting"
    WALKING_TO_DESK = "walking_to_desk"
    WAITING = "waiting"
    LEAVING = "leaving"
    ERROR = "error"


class EventData(BaseModel):
    """Data payload for events from Claude Code hooks."""

    project_name: str | None = None
    project_dir: str | None = None
    working_dir: str | None = None
    tool_name: str | None = None
    tool_use_id: str | None = None
    tool_input: dict[str, Any] | None = None
    success: bool | None = None
    agent_id: str | None = None
    native_agent_id: str | None = None
    agent_name: str | None = None
    agent_type: str | None = None
    task_description: str | None = None
    result_summary: str | None = None
    notification_type: str | None = None
    message: str | None = None
    error_type: str | None = None
    reason: str | None = None
    summary: str | None = None
    prompt: str | None = None
    bubble_content: BubbleContent | None = None
    speech_content: SpeechContent | None = None
    transcript_path: str | None = None
    agent_transcript_path: str | None = None
    thinking: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_creation_tokens: int | None = None


class Event(BaseModel):
    """An event from Claude Code hooks."""

    event_type: EventType
    session_id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    data: EventData
