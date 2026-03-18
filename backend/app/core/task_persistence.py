"""Persistence layer for tasks in the database.

Tasks come from two sources:
1. TodoWrite tool events (legacy)
2. Task file system (~/.claude/tasks/{session_id}/*.json)

Both are persisted to the database to survive file system cleanup by Claude Code.
"""

import json
import logging
from typing import Any, cast

from sqlalchemy import delete, select

from app.db.database import AsyncSessionLocal
from app.db.models import TaskRecord
from app.models.common import TodoItem, TodoStatus

logger = logging.getLogger(__name__)


def _serialize_list(items: list[str]) -> str | None:
    """Serialize a list to JSON string, returning None for empty lists."""
    return json.dumps(items) if items else None


def _deserialize_list(data: str | None) -> list[str]:
    """Deserialize a JSON string to a list, returning empty list for None."""
    if not data:
        return []
    try:
        result = json.loads(data)
        if isinstance(result, list):
            return cast(list[str], result)
        return []
    except (json.JSONDecodeError, TypeError):
        return []


def _serialize_metadata(metadata: dict[str, Any] | None) -> str | None:
    """Serialize metadata dict to JSON string."""
    return json.dumps(metadata) if metadata else None


def _deserialize_metadata(data: str | None) -> dict[str, Any] | None:
    """Deserialize JSON string to metadata dict."""
    if not data:
        return None
    try:
        result = json.loads(data)
        if isinstance(result, dict):
            return cast(dict[str, Any], result)
        return None
    except (json.JSONDecodeError, TypeError):
        return None


async def save_tasks(session_id: str, todos: list[TodoItem]) -> None:
    """Save tasks to the database, replacing any existing tasks for the session.

    Args:
        session_id: The session identifier
        todos: List of TodoItem objects to save
    """
    async with AsyncSessionLocal() as db:
        # Delete existing tasks for this session
        await db.execute(delete(TaskRecord).where(TaskRecord.session_id == session_id))

        # Insert new tasks
        for idx, todo in enumerate(todos):
            # Use the task_id from the todo if available, otherwise use 1-based index
            task_id = todo.task_id if todo.task_id else str(idx + 1)

            task_record = TaskRecord(
                session_id=session_id,
                task_id=task_id,
                content=todo.content,
                status=todo.status.value,
                active_form=todo.active_form,
                description=todo.description,
                blocks=_serialize_list(todo.blocks),
                blocked_by=_serialize_list(todo.blocked_by),
                owner=todo.owner,
                metadata_json=_serialize_metadata(todo.metadata),
                sort_order=idx,
            )
            db.add(task_record)

        await db.commit()
        logger.debug(f"Saved {len(todos)} tasks for session {session_id}")


async def load_tasks(session_id: str) -> list[TodoItem]:
    """Load tasks from the database for a session.

    Args:
        session_id: The session identifier

    Returns:
        List of TodoItem objects sorted by sort_order
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(TaskRecord)
            .where(TaskRecord.session_id == session_id)
            .order_by(TaskRecord.sort_order.asc())
        )
        records = result.scalars().all()

        todos: list[TodoItem] = []
        for record in records:
            try:
                status = TodoStatus(record.status)
            except ValueError:
                status = TodoStatus.PENDING

            todos.append(
                TodoItem(
                    task_id=record.task_id,
                    content=record.content,
                    status=status,
                    active_form=record.active_form,
                    description=record.description,
                    blocks=_deserialize_list(record.blocks),
                    blocked_by=_deserialize_list(record.blocked_by),
                    owner=record.owner,
                    metadata=_deserialize_metadata(record.metadata_json),
                )
            )

        logger.debug(f"Loaded {len(todos)} tasks for session {session_id}")
        return todos


async def clear_tasks(session_id: str) -> None:
    """Clear all tasks for a session.

    Args:
        session_id: The session identifier
    """
    async with AsyncSessionLocal() as db:
        await db.execute(delete(TaskRecord).where(TaskRecord.session_id == session_id))
        await db.commit()
        logger.debug(f"Cleared tasks for session {session_id}")
