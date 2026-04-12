import logging
import os
import subprocess
from datetime import UTC
from typing import Annotated, Any, TypedDict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.websocket import manager
from app.core.event_processor import event_processor
from app.db.database import get_db
from app.db.models import EventRecord, SessionRecord, TaskRecord, UserPreference
from app.services.git_service import git_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])

_simulation_process: subprocess.Popen[bytes] | None = None


def kill_simulation() -> bool:
    """Kill any running simulation process.

    Returns:
        True if a process was killed, False if no process was running.
    """
    global _simulation_process
    if _simulation_process is not None:
        try:
            _simulation_process.terminate()
            _simulation_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _simulation_process.kill()
        except Exception:
            pass
        finally:
            _simulation_process = None
        return True
    return False


class SessionSummary(TypedDict):
    """Summary data for a session in the list view."""

    id: str
    label: str | None
    displayName: str | None
    projectName: str | None
    projectRoot: str | None
    createdAt: str
    updatedAt: str
    status: str
    eventCount: int
    floorId: str | None
    roomId: str | None


class ReplayEvent(TypedDict):
    """Event data structure for replay."""

    id: str
    type: str
    agentId: str
    summary: str
    timestamp: str


class ReplayEntry(TypedDict):
    """A replay entry containing an event and the resulting state."""

    event: ReplayEvent
    state: dict[str, Any]


@router.get("")
async def list_sessions(
    db: Annotated[AsyncSession, Depends(get_db)],
    room_id: str | None = None,
    floor_id: str | None = None,
) -> list[SessionSummary]:
    """List all sessions with event counts.

    Only returns sessions that have received a ``session_start`` event.  Child
    sessions spawned by OpenCode @agent mentions never receive a ``session_start``
    — they start directly with ``user_prompt_submit`` / ``pre_tool_use`` events —
    so filtering on this event type keeps them out of the sidebar.

    Args:
        db: Database session dependency.
        room_id: Optional filter to only return sessions in a specific room.
        floor_id: Optional filter to only return sessions on a specific floor.

    Returns:
        List of session summaries matching the given filters.
    """
    logger.debug("API: list_sessions called (room_id=%s, floor_id=%s)", room_id, floor_id)
    try:
        # Find all session IDs that have at least one session_start event.
        # Child @agent sessions never get session_start, so they're excluded.
        sessions_with_start_stmt = (
            select(EventRecord.session_id)
            .where(EventRecord.event_type == "session_start")
            .distinct()
        )
        start_result = await db.execute(sessions_with_start_stmt)
        sessions_with_start: set[str] = {row[0] for row in start_result.all()}

        stmt = select(SessionRecord).order_by(SessionRecord.updated_at.desc())

        # Apply optional room/floor filters
        if room_id is not None:
            stmt = stmt.where(SessionRecord.room_id == room_id)
        if floor_id is not None:
            stmt = stmt.where(SessionRecord.floor_id == floor_id)

        result = await db.execute(stmt)
        records = result.scalars().all()

        sessions: list[SessionSummary] = []
        for rec in records:
            # Skip child sessions (no session_start event) unless it's the special
            # simulation session which also lacks one but is always valid.
            if rec.id not in sessions_with_start and not rec.id.startswith("sim_"):
                continue

            count_stmt = select(func.count(EventRecord.id)).where(EventRecord.session_id == rec.id)
            count_res = await db.execute(count_stmt)
            count = count_res.scalar() or 0

            created_utc = (
                rec.created_at.astimezone(UTC)
                if rec.created_at.tzinfo
                else rec.created_at.replace(tzinfo=UTC)
            )
            updated_utc = (
                rec.updated_at.astimezone(UTC)
                if rec.updated_at.tzinfo
                else rec.updated_at.replace(tzinfo=UTC)
            )

            sessions.append(
                {
                    "id": rec.id,
                    "label": rec.label,
                    "displayName": rec.display_name,
                    "projectName": rec.project_name,
                    "projectRoot": rec.project_root,
                    "createdAt": created_utc.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                    "updatedAt": updated_utc.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                    "status": rec.status,
                    "eventCount": count,
                    "floorId": rec.floor_id,
                    "roomId": rec.room_id,
                }
            )
        return sessions
    except Exception as e:
        logger.exception("Error in list_sessions: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


class LabelUpdate(BaseModel):
    """Request body for updating a session label."""

    label: str | None = None


@router.patch("/{session_id}/label")
async def update_session_label(
    session_id: str, body: LabelUpdate, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    """Update the label of a session.

    Args:
        session_id: Identifier for the session to update.
        body: Request body containing the new label value.
        db: Database session dependency.

    Returns:
        A status payload confirming the update.

    Raises:
        HTTPException: If the session is not found or update fails.
    """
    try:
        result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        session.label = body.label
        await db.commit()
        return {"status": "success", "message": f"Label updated for session {session_id}"}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e


class DisplayNameUpdate(BaseModel):
    """Request body for updating a session display name."""

    display_name: str | None = None


@router.patch("/{session_id}")
async def update_session(
    session_id: str, body: DisplayNameUpdate, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    """Update the display name of a session.

    Args:
        session_id: Identifier for the session to update.
        body: Request body containing the new display_name value.
        db: Database session dependency.

    Returns:
        A status payload confirming the update.

    Raises:
        HTTPException: If the session is not found or update fails.
    """
    try:
        result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        session.display_name = body.display_name
        await db.commit()
        return {"status": "success", "message": f"Session {session_id} updated"}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e


class FocusRequest(BaseModel):
    """Request body for focusing a session terminal."""

    message: str | None = None


@router.post("/{session_id}/focus")
async def focus_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    body: FocusRequest | None = None,
) -> dict[str, str]:
    """Bring a session's terminal to the foreground and optionally copy a message to clipboard.

    Uses macOS AppleScript to activate the Terminal window. If a message is
    provided, it is copied to the system clipboard.

    Args:
        session_id: Identifier for the session to focus.
        body: Optional request body with a message to copy to clipboard.
        db: Database session dependency.

    Returns:
        A status payload confirming the focus action.

    Raises:
        HTTPException: If the session is not found or the focus action fails.
    """
    try:
        result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Bring Terminal to foreground via AppleScript
        subprocess.run(
            ["osascript", "-e", 'tell application "Terminal" to activate'],
            capture_output=True,
            timeout=5,
        )

        # Optionally copy message to clipboard
        if body and body.message:
            subprocess.run(
                ["pbcopy"],
                input=body.message.encode("utf-8"),
                capture_output=True,
                timeout=5,
            )

        return {"status": "success", "message": f"Session {session_id} focused"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{session_id}/replay")
async def get_session_replay(
    session_id: str, db: Annotated[AsyncSession, Depends(get_db)]
) -> list[ReplayEntry]:
    """Get all events and resulting states for session replay.

    Replays events through the state machine to reconstruct the state
    after each event, enabling frontend replay functionality.
    """
    try:
        stmt = (
            select(EventRecord)
            .where(EventRecord.session_id == session_id)
            .order_by(EventRecord.timestamp.asc())
        )
        result = await db.execute(stmt)
        events = result.scalars().all()

        from app.core.state_machine import StateMachine
        from app.models.events import Event, EventData, EventType

        sm = StateMachine()
        replay_data: list[ReplayEntry] = []

        for rec in events:
            evt = Event(
                event_type=EventType(rec.event_type),
                session_id=rec.session_id,
                timestamp=rec.timestamp,
                data=EventData.model_validate(rec.data),
            )
            sm.transition(evt)
            state = sm.to_game_state(session_id)

            ts_utc = (
                rec.timestamp.astimezone(UTC)
                if rec.timestamp.tzinfo
                else rec.timestamp.replace(tzinfo=UTC)
            )

            agent_id = rec.data.get("agent_id") if rec.data else "main"
            if not agent_id:
                agent_id = "main"
            replay_data.append(
                {
                    "event": {
                        "id": str(rec.timestamp.timestamp()),
                        "type": rec.event_type,
                        "agentId": str(agent_id),
                        "summary": event_processor.get_event_summary(evt),
                        "timestamp": ts_utc.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                    },
                    "state": state.model_dump(mode="json", by_alias=True),
                }
            )

        return replay_data
    except Exception as e:
        logger.exception("Error in get_session_replay: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/simulate")
async def trigger_simulation() -> dict[str, str]:
    """Start the event simulation script in the background."""
    global _simulation_process

    if _simulation_process is not None and _simulation_process.poll() is None:
        kill_simulation()

    try:
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))
        script_path = os.path.join(project_root, "scripts/simulate_events.py")

        _simulation_process = subprocess.Popen(
            ["uv", "run", "python", script_path],
            cwd=project_root,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        return {"status": "success", "message": "Simulation started in background"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("")
async def clear_database(db: Annotated[AsyncSession, Depends(get_db)]) -> dict[str, str]:
    """Clear all sessions and events from the database."""
    try:
        simulation_killed = kill_simulation()

        await db.execute(delete(UserPreference))
        await db.execute(delete(TaskRecord))
        await db.execute(delete(EventRecord))
        await db.execute(delete(SessionRecord))
        await db.commit()

        await event_processor.clear_all_sessions()
        git_service.clear()

        await manager.broadcast_all({"type": "reload", "timestamp": ""})

        message = "Database and memory cleared"
        if simulation_killed:
            message += " (simulation stopped)"
        return {"status": "success", "message": message}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/{session_id}")
async def delete_session(
    session_id: str, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    """Delete a single session, its events, and in-memory cache.

    Args:
        session_id: Identifier for the session to delete.
        db: Database session dependency.

    Returns:
        A status payload confirming deletion.

    Raises:
        HTTPException: If the session is not found or deletion fails.
    """
    try:
        result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        await db.execute(delete(TaskRecord).where(TaskRecord.session_id == session_id))
        await db.execute(delete(EventRecord).where(EventRecord.session_id == session_id))
        await db.execute(delete(SessionRecord).where(SessionRecord.id == session_id))
        await db.commit()

        await event_processor.remove_session(session_id)

        # Broadcast session deletion to all connected clients
        await manager.broadcast_all(
            {
                "type": "session_deleted",
                "session_id": session_id,
                "timestamp": "",
            }
        )

        return {"status": "success", "message": f"Session {session_id} deleted"}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
