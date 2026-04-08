from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class SessionRecord(Base):
    """Database model for Claude Code sessions."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_name: Mapped[str | None] = mapped_column(String, nullable=True)
    project_root: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    status: Mapped[str] = mapped_column(String, default="active")
    label: Mapped[str | None] = mapped_column(String, nullable=True, default=None)

    events: Mapped[list[EventRecord]] = relationship(
        "EventRecord", back_populates="session", cascade="all, delete-orphan"
    )


class EventRecord(Base):
    """Database model for events within a session."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    event_type: Mapped[str] = mapped_column(String)
    data: Mapped[dict[str, Any]] = mapped_column(JSON)

    session: Mapped[SessionRecord] = relationship("SessionRecord", back_populates="events")


class TaskRecord(Base):
    """Database model for tasks within a session.

    Stores tasks from both the TodoWrite tool and the new task file system.
    Tasks are persisted to survive file system cleanup by Claude Code.
    """

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id"), index=True)
    task_id: Mapped[str] = mapped_column(String)  # Original task ID (e.g., "1", "2")
    content: Mapped[str] = mapped_column(String)  # Subject/content of the task
    status: Mapped[str] = mapped_column(String)  # pending, in_progress, completed
    active_form: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    blocks: Mapped[str | None] = mapped_column(String, nullable=True)  # JSON-serialized list
    blocked_by: Mapped[str | None] = mapped_column(String, nullable=True)  # JSON-serialized list
    owner: Mapped[str | None] = mapped_column(String, nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(String, nullable=True)  # JSON-serialized dict
    sort_order: Mapped[int] = mapped_column(default=0)  # For ordering tasks
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class AgentSeatPreference(Base):
    """Persists agent desk/color assignments across reconnects."""

    __tablename__ = "agent_seat_preferences"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String, index=True)
    agent_id: Mapped[str] = mapped_column(String, index=True)
    desk: Mapped[int] = mapped_column()
    color: Mapped[str] = mapped_column(String)
    room_key: Mapped[str] = mapped_column(String)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class UserPreference(Base):
    """Database model for user preferences.

    Stores key-value pairs for user preferences. Uses a flexible design
    to support adding new preferences without schema changes.
    """

    __tablename__ = "user_preferences"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(String)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
