from enum import StrEnum

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.models.common import BubbleContent


class AgentState(StrEnum):
    """Visual states for agent characters."""

    ARRIVING = "arriving"
    REPORTING = "reporting"
    WALKING_TO_DESK = "walking_to_desk"
    WORKING = "working"
    THINKING = "thinking"
    WAITING_PERMISSION = "waiting_permission"
    COMPLETED = "completed"
    WAITING = "waiting"
    REPORTING_DONE = "reporting_done"
    LEAVING = "leaving"
    IN_ELEVATOR = "in_elevator"


class BossState(StrEnum):
    """Visual states for the boss character."""

    IDLE = "idle"
    PHONE_RINGING = "phone_ringing"
    ON_PHONE = "on_phone"
    RECEIVING = "receiving"
    WORKING = "working"
    DELEGATING = "delegating"
    WAITING_PERMISSION = "waiting_permission"
    REVIEWING = "reviewing"
    COMPLETING = "completing"


class Agent(BaseModel):
    """Represents a subagent in the office visualization."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    native_id: str | None = None  # Native Claude agent ID (e.g., "a5a60c7")
    name: str | None = None
    color: str
    number: int
    state: AgentState
    desk: int | None = None
    bubble: BubbleContent | None = None
    current_task: str | None = None
    position: dict[str, int] = {"x": 0, "y": 0}


class Boss(BaseModel):
    """Represents the main Claude agent (boss) in the office visualization."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    state: BossState
    current_task: str | None = None
    bubble: BubbleContent | None = None
    position: dict[str, int] = {"x": 640, "y": 830}


class ElevatorState(StrEnum):
    """Visual states for the elevator."""

    CLOSED = "closed"
    ARRIVING = "arriving"
    OPEN = "open"
    DEPARTING = "departing"


class PhoneState(StrEnum):
    """Visual states for the boss's phone."""

    IDLE = "idle"
    RINGING = "ringing"
    IN_USE = "in_use"


class OfficeState(BaseModel):
    """Represents the overall state of the office environment."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    desk_count: int = 8
    elevator_state: ElevatorState = ElevatorState.CLOSED
    phone_state: PhoneState = PhoneState.IDLE
    context_utilization: float = 0.0
    tool_uses_since_compaction: int = 0
    print_report: bool = False
