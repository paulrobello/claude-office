from enum import StrEnum

from pydantic import BaseModel


class BubbleType(StrEnum):
    """Type of speech/thought bubble content."""

    THOUGHT = "thought"
    SPEECH = "speech"


class BubbleContent(BaseModel):
    """Content for speech or thought bubbles."""

    type: BubbleType
    text: str
    icon: str | None = None
    persistent: bool = False


class SpeechContent(BaseModel):
    """Speech content for different characters."""

    boss: str | None = None
    agent: str | None = None
    boss_phone: str | None = None


class TodoStatus(StrEnum):
    """Status of a todo list item."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TodoItem(BaseModel):
    """A single item from the TodoWrite tool."""

    content: str
    status: TodoStatus
    active_form: str | None = None
