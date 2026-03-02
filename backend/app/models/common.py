from enum import StrEnum
from typing import Any

from pydantic import BaseModel

__all__ = [
    "BubbleType",
    "BubbleContent",
    "SpeechContent",
    "TodoStatus",
    "TodoItem",
]


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
    """A single item from the TodoWrite tool or task file system."""

    task_id: str = ""
    content: str
    status: TodoStatus
    active_form: str | None = None
    description: str | None = None
    blocks: list[str] = []
    blocked_by: list[str] = []
    owner: str | None = None
    metadata: dict[str, Any] | None = None
