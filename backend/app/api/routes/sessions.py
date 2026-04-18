import logging
import os
import subprocess
from datetime import UTC
from typing import Annotated, Any, TypedDict

from fastapi import APIRouter, Depends, HTTPException
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
    projectName: str | None
    displayName: str | None
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
    """List all sessions with event counts, optionally filtered by room or floor."""
    logger.debug("API: list_sessions called (room_id=%s, floor_id=%s)", room_id, floor_id)
    try:
        stmt = select(SessionRecord).order_by(SessionRecord.updated_at.desc())
        if room_id:
            stmt = stmt.where(SessionRecord.room_id == room_id)
        if floor_id:
            stmt = stmt.where(SessionRecord.floor_id == floor_id)
        result = await db.execute(stmt)
        records = result.scalars().all()

        sessions: list[SessionSummary] = []
        for rec in records:
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
                    "projectName": rec.project_name,
                    "displayName": rec.display_name,
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


@router.patch("/{session_id}")
async def rename_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    body: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Rename a session's display name."""
    if not body or "displayName" not in body:
        raise HTTPException(status_code=400, detail="displayName required")

    result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.display_name = body["displayName"]
    await db.commit()
    return {"status": "ok"}


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


class FocusRequest(TypedDict, total=False):
    """Optional request body for the focus endpoint."""

    message: str


@router.post("/{session_id}/focus")
async def focus_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Bring the user's existing terminal to the foreground (macOS only).

    Optionally copies a message to the clipboard so the user can paste it.

    Args:
        session_id: The session to focus.
        db: Database session dependency.
        body: Optional JSON body with ``message`` field.

    Returns:
        A status payload with ``success`` and ``project_root`` keys.
    """
    result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    project_root = session.project_root
    message: str | None = (body or {}).get("message")

    try:
        if message:
            # Copy message to clipboard (macOS pbcopy, Linux xclip, no-op elsewhere)
            try:
                if os.name == "posix":
                    if os.path.exists("/usr/bin/pbcopy"):
                        proc = subprocess.Popen(["pbcopy"], stdin=subprocess.PIPE, close_fds=True)
                        proc.communicate(input=message.encode())
                    elif os.path.exists("/usr/bin/xclip"):
                        proc = subprocess.Popen(
                            ["xclip", "-selection", "clipboard"],
                            stdin=subprocess.PIPE,
                            close_fds=True,
                        )
                        proc.communicate(input=message.encode())
            except Exception:
                pass  # Clipboard is best-effort

        # Bring Terminal / iTerm2 to front using AppleScript (macOS only).
        # We do NOT open a new window — we just activate whatever terminal the
        # user already has open so they can paste the copied message.
        if os.name == "posix" and os.path.exists("/usr/bin/osascript"):
            # Prefer iTerm2 if running, fall back to Terminal.app
            applescript = """
tell application "System Events"
    set iterm_running to (count of (processes whose name is "iTerm2")) > 0
    set term_running  to (count of (processes whose name is "Terminal")) > 0
end tell
if iterm_running then
    tell application "iTerm2" to activate
else if term_running then
    tell application "Terminal" to activate
end if
"""
            subprocess.Popen(
                ["osascript", "-e", applescript],
                close_fds=True,
            )

        return {"success": True, "project_root": project_root}
    except Exception as e:
        logger.exception("Error in focus_session: %s", e)
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
