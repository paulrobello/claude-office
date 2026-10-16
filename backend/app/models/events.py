import re
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    field_validator,
)

from app.models.common import BubbleContent, SpeechContent

__all__ = [
    "EventType",
    "EventData",
    "Event",
    # Discriminated-union layer (ARC-014). Wire format unchanged; consumers
    # narrow to family-specific payloads via the `event_type` discriminator.
    "EventDataBase",
    "SessionEventData",
    "ToolEventData",
    "PromptEventData",
    "AgentEventData",
    "LifecycleEventData",
    "TaskEventData",
    "BackgroundTaskEventData",
    "_EventBase",
    "SessionEvent",
    "ToolEvent",
    "PromptEvent",
    "AgentEvent",
    "LifecycleEvent",
    "TaskEvent",
    "BackgroundTaskEvent",
    "AnyEvent",
    "EventAdapter",
]


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
    BACKGROUND_TASK_NOTIFICATION = "background_task_notification"
    TASK_CREATED = "task_created"
    TASK_COMPLETED = "task_completed"
    TEAMMATE_IDLE = "teammate_idle"


class EventData(BaseModel):
    """Data payload for events from Claude Code hooks.

    Deprecated (ARC-014): retained only because external producers (hooks,
    opencode-plugin, simulation) emit the flat wire format that the
    discriminated union parses. Internal code should use the family payload
    classes (``EventDataBase`` and its subclasses) instead. Deletion is
    follow-up QA work once no remaining production path constructs this.
    """

    project_name: str | None = None
    project_dir: str | None = None
    working_dir: str | None = None
    # Producer tag (mirrors EventDataBase.source; see that class for values).
    source: str | None = None
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
    # Background task notification fields
    background_task_id: str | None = None
    background_task_output_file: str | None = None
    background_task_status: str | None = None  # "completed" | "failed"
    background_task_summary: str | None = None
    # Task list override (from CLAUDE_CODE_TASK_LIST_ID env var)
    task_list_id: str | None = None
    # Room assignment (populated by ProductMapper)
    floor_id: str | None = None
    room_id: str | None = None
    # Agent Teams fields (Phase 4)
    team_name: str | None = None
    teammate_name: str | None = None
    # Task-specific fields
    task_id: str | None = None
    task_subject: str | None = None


class Event(BaseModel):
    """An event from Claude Code hooks.

    Deprecated (ARC-014): the backend's ingestion route, replay, dispatch
    table, and handlers all operate on the ``AnyEvent`` discriminated union
    defined below. This legacy god-model class is kept exported so external
    callers (and the family-event union itself, via wire-format parity) keep
    parsing; it will be removed once any remaining test/construction sites
    are migrated. Do not add new production usages.
    """

    event_type: EventType
    session_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    data: EventData

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,128}", v):
            raise ValueError("session_id must be alphanumeric/dash/underscore, max 128 chars")
        return v


# ---------------------------------------------------------------------------
# ARC-014: discriminated-union event layer.
#
# `EventData` (above) is a 40-field optional-everything god model: every event
# type widens the contract for every other type. The classes below split the
# payload into one base + seven family-specific payloads, grouped by which
# `EventType` values access them (verified via `grep -rn "data\.<field>"`).
#
# Wire format is unchanged: producers (hooks, opencode-plugin, scenarios) emit
# the same flat JSON they always have. Pydantic routes the payload to the
# correct family class via the `event_type` discriminator on the event model.
#
# Field placement rules used below:
#   - `EventDataBase` carries every field read by code paths that run for ALL
#     event types (token_tracker.update_from_event, event_processor routing,
#     product_mapper room assignment). Notably `agent_transcript_path` lives
#     here, not in AgentEventData, because token_tracker reads it on the slow
#     path for any event whose `transcript_path` is empty.
#   - Family payload classes add only fields accessed solely by that family's
#     event types. Fields needed by two families (e.g. `thinking`, `result_*`,
#     `tool_use_id`) appear in each family class explicitly.
#   - `extra="ignore"` everywhere: hooks send fields opportunistically and we
#     must not reject payloads that include fields the model doesn't list.
# ---------------------------------------------------------------------------


class EventDataBase(BaseModel):
    """Fields every event may carry.

    Covers routing/project context, token accounting, room assignment, and
    team context — all read by code paths that run regardless of event_type.
    """

    model_config = ConfigDict(extra="ignore")

    # Project / routing context (event_processor._process_event_internal).
    project_name: str | None = None
    project_dir: str | None = None
    working_dir: str | None = None
    # Producer tag: "recovered" marks a synthetic SESSION_START the backend
    # builds when the real one never arrived (see EventProcessor._process_event_internal);
    # "opencode" marks plugin events, whose child @agent sessions must stay
    # excluded from that recovery. Old producers omit it (extra="ignore").
    source: str | None = None
    # Agent identity (read across many event types).
    agent_id: str | None = None
    native_agent_id: str | None = None
    # Transcript paths (token_tracker.update_from_event reads both for any
    # event type on its slow path).
    transcript_path: str | None = None
    agent_transcript_path: str | None = None
    # Free-form text fields used across multiple families.
    summary: str | None = None
    message: str | None = None
    # Agent Teams context (set on session-level events).
    team_name: str | None = None
    teammate_name: str | None = None
    # Task list override (session_handler reads for SESSION_*).
    task_list_id: str | None = None
    # Token accounting (token_tracker.update_from_event fast path).
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_creation_tokens: int | None = None
    # Room assignment (populated by ProductMapper).
    floor_id: str | None = None
    room_id: str | None = None


class SessionEventData(EventDataBase):
    """Payload for SESSION_START, SESSION_END."""

    reason: str | None = None


class ToolEventData(EventDataBase):
    """Payload for PRE_TOOL_USE, POST_TOOL_USE, PERMISSION_REQUEST."""

    tool_name: str | None = None
    tool_use_id: str | None = None
    tool_input: dict[str, Any] | None = None
    success: bool | None = None
    result_summary: str | None = None
    error_type: str | None = None
    thinking: str | None = None


class PromptEventData(EventDataBase):
    """Payload for USER_PROMPT_SUBMIT."""

    prompt: str | None = None


class AgentEventData(EventDataBase):
    """Payload for SUBAGENT_START, SUBAGENT_INFO, SUBAGENT_STOP, AGENT_UPDATE, CLEANUP.

    Note: `agent_transcript_path` is inherited from EventDataBase because
    token_tracker.update_from_event reads it on any event type. `success`
    appears here (and on ToolEventData) because the SUBAGENT_STOP formatter
    reads it for the native-hook success/failure marker.
    """

    agent_name: str | None = None
    agent_type: str | None = None
    task_description: str | None = None
    result_summary: str | None = None
    tool_use_id: str | None = None
    thinking: str | None = None
    success: bool | None = None
    bubble_content: BubbleContent | None = None
    speech_content: SpeechContent | None = None


class LifecycleEventData(EventDataBase):
    """Payload for STOP, NOTIFICATION, CONTEXT_COMPACTION, REPORTING,
    WALKING_TO_DESK, WAITING, LEAVING, ERROR, TEAMMATE_IDLE."""

    notification_type: str | None = None
    error_type: str | None = None
    reason: str | None = None
    bubble_content: BubbleContent | None = None
    speech_content: SpeechContent | None = None


class TaskEventData(EventDataBase):
    """Payload for TASK_CREATED, TASK_COMPLETED."""

    task_id: str | None = None
    task_subject: str | None = None


class BackgroundTaskEventData(EventDataBase):
    """Payload for BACKGROUND_TASK_NOTIFICATION."""

    background_task_id: str | None = None
    background_task_output_file: str | None = None
    background_task_status: str | None = None  # "completed" | "failed"
    background_task_summary: str | None = None


# ---------------------------------------------------------------------------
# Family event models. Each binds a multi-value `Literal` of EventType values
# to its payload class; together the Literals cover all 23 EventType values
# exactly once, making AnyEvent a total discriminated union over EventType.
# ---------------------------------------------------------------------------


class _EventBase(BaseModel):
    """Common envelope fields for every discriminated-union variant."""

    session_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,128}", v):
            raise ValueError("session_id must be alphanumeric/dash/underscore, max 128 chars")
        return v


class SessionEvent(_EventBase):
    event_type: Literal[EventType.SESSION_START, EventType.SESSION_END]
    data: SessionEventData


class ToolEvent(_EventBase):
    event_type: Literal[
        EventType.PRE_TOOL_USE,
        EventType.POST_TOOL_USE,
        EventType.PERMISSION_REQUEST,
    ]
    data: ToolEventData


class PromptEvent(_EventBase):
    event_type: Literal[EventType.USER_PROMPT_SUBMIT]
    data: PromptEventData


class AgentEvent(_EventBase):
    event_type: Literal[
        EventType.SUBAGENT_START,
        EventType.SUBAGENT_INFO,
        EventType.SUBAGENT_STOP,
        EventType.AGENT_UPDATE,
        EventType.CLEANUP,
    ]
    data: AgentEventData


class LifecycleEvent(_EventBase):
    event_type: Literal[
        EventType.STOP,
        EventType.NOTIFICATION,
        EventType.CONTEXT_COMPACTION,
        EventType.REPORTING,
        EventType.WALKING_TO_DESK,
        EventType.WAITING,
        EventType.LEAVING,
        EventType.ERROR,
        EventType.TEAMMATE_IDLE,
    ]
    data: LifecycleEventData


class TaskEvent(_EventBase):
    event_type: Literal[EventType.TASK_CREATED, EventType.TASK_COMPLETED]
    data: TaskEventData


class BackgroundTaskEvent(_EventBase):
    event_type: Literal[EventType.BACKGROUND_TASK_NOTIFICATION]
    data: BackgroundTaskEventData


# Discriminated union over event_type. FastAPI/Pydantic routes an incoming
# payload to the correct variant based on the Literal tag, so handlers typed
# as `event: AnyEvent` narrow to a family-specific payload via match/isinstance.
AnyEvent = Annotated[
    SessionEvent
    | ToolEvent
    | PromptEvent
    | AgentEvent
    | LifecycleEvent
    | TaskEvent
    | BackgroundTaskEvent,
    Field(discriminator="event_type"),
]

# Reusable TypeAdapter for the union; used by replay code that validates
# persisted records back into family-specific events.
EventAdapter: TypeAdapter[AnyEvent] = TypeAdapter(AnyEvent)
