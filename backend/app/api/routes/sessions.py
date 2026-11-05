import asyncio
import logging
import os
import subprocess
import sys
from datetime import UTC
from typing import Annotated, Any, TypedDict

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.connection_manager import get_manager
from app.core.event_processor import get_event_processor
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
        killed = True
        try:
            _simulation_process.terminate()
            _simulation_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _simulation_process.kill()
        except Exception:
            logger.exception("Failed to kill simulation process")
            killed = False
        finally:
            _simulation_process = None
        return killed
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
    status: str | None = None,
    limit: int = 100,
) -> list[SessionSummary]:
    """List sessions with event counts.

    Only returns sessions that have received a ``session_start`` event.  Child
    sessions spawned by OpenCode @agent mentions never receive a ``session_start``
    — they start directly with ``user_prompt_submit`` / ``pre_tool_use`` events —
    so filtering on this event type keeps them out of the sidebar.

    Args:
        db: Database session dependency.
        room_id: Optional filter to only return sessions in a specific room.
        floor_id: Optional filter to only return sessions on a specific floor.
        status: Optional filter by session status (``active``, ``completed``).
        limit: Maximum sessions to return (default 100, max 500).

    Returns:
        List of session summaries matching the given filters.
    """
    logger.debug("API: list_sessions called (room_id=%s, floor_id=%s)", room_id, floor_id)
    # Single query with GROUP BY to get event counts for all sessions.
    # Replaces N+1 pattern where each session required a separate COUNT query.
    event_count_subq = (
        select(
            EventRecord.session_id,
            func.count(EventRecord.id).label("event_count"),
        )
        .group_by(EventRecord.session_id)
        .subquery()
    )

    stmt = (
        select(
            SessionRecord,
            func.coalesce(event_count_subq.c.event_count, 0).label("event_count"),
        )
        .outerjoin(event_count_subq, SessionRecord.id == event_count_subq.c.session_id)
        .order_by(SessionRecord.updated_at.desc())
    )

    # Apply optional room/floor filters
    if room_id is not None:
        stmt = stmt.where(SessionRecord.room_id == room_id)
    if floor_id is not None:
        stmt = stmt.where(SessionRecord.floor_id == floor_id)
    if status is not None:
        stmt = stmt.where(SessionRecord.status == status)

    stmt = stmt.limit(min(limit, 500))
    result = await db.execute(stmt)
    rows = result.all()

    # Find session IDs that have at least one session_start event.
    # Child @agent sessions never get session_start, so they're excluded.
    sessions_with_start_stmt = (
        select(EventRecord.session_id).where(EventRecord.event_type == "session_start").distinct()
    )
    start_result = await db.execute(sessions_with_start_stmt)
    sessions_with_start: set[str] = {row[0] for row in start_result.all()}

    sessions: list[SessionSummary] = []
    for row in rows:
        rec = row[0]
        count = int(row[1])

        # Skip child sessions (no session_start event) unless it's the special
        # simulation session which also lacks one but is always valid.
        if rec.id not in sessions_with_start and not rec.id.startswith("sim_"):
            continue

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


class LabelUpdate(BaseModel):
    """Request body for the legacy ``PATCH /sessions/{id}/label`` route."""

    label: str | None = None


class SessionUpdate(BaseModel):
    """Request body for ``PATCH /sessions/{id}``.

    Both fields are optional; only fields explicitly provided in the request
    body are applied. ``model_fields_set`` is used to distinguish "field not
    sent" from an explicit ``null`` (which clears the stored value).
    """

    display_name: str | None = None
    label: str | None = None


async def _apply_session_update(
    session_id: str,
    body: SessionUpdate,
    db: AsyncSession,
    *,
    success_message: str,
) -> dict[str, str]:
    """Look up a session, apply the fields explicitly set on *body*, commit.

    Raises:
        HTTPException: 404 if the session is not found. Any other exception
        propagates to the app-level handler (ARC-024); ``get_db`` rolls back.
    """
    result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    fields_set = body.model_fields_set
    if "label" in fields_set:
        session.label = body.label
    if "display_name" in fields_set:
        session.display_name = body.display_name

    await db.commit()
    return {"status": "success", "message": success_message}


@router.patch("/{session_id}/label")
async def update_session_label(
    session_id: str, body: LabelUpdate, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    """Update the label of a session.

    Thin delegate over :func:`update_session` so the legacy ``/label`` route
    and the general ``PATCH /sessions/{id}`` route share one implementation
    (ARC-024). The route and request/response shapes are preserved.

    Args:
        session_id: Identifier for the session to update.
        body: Request body containing the new label value.
        db: Database session dependency.

    Returns:
        A status payload confirming the update.
    """
    # Construct a SessionUpdate from the explicit label value so
    # ``model_fields_set`` reports {"label"} regardless of whether the value
    # is null (clear) or set (update). This preserves the legacy /label
    # semantics: PATCH /label never touches display_name.
    return await _apply_session_update(
        session_id,
        SessionUpdate(label=body.label),
        db,
        success_message=f"Label updated for session {session_id}",
    )


@router.patch("/{session_id}")
async def update_session(
    session_id: str, body: SessionUpdate, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    """Update mutable session fields (``display_name``, ``label``).

    Args:
        session_id: Identifier for the session to update.
        body: Request body. Only fields explicitly present in the request
            body are written; a missing field leaves the stored value alone
            and an explicit ``null`` clears it.
        db: Database session dependency.

    Returns:
        A status payload confirming the update.
    """
    return await _apply_session_update(
        session_id, body, db, success_message=f"Session {session_id} updated"
    )


class FocusRequest(BaseModel):
    """Request body for focusing a session terminal."""

    message: str | None = None

    model_config = {"str_max_length": 100_000}


def _validate_clipboard_message(message: str | None) -> str | None:
    """Validate and truncate clipboard message to a safe maximum length.

    Args:
        message: The raw clipboard text from the request body.

    Returns:
        The validated message, truncated to 1 MB if necessary.

    Raises:
        HTTPException: If the message exceeds a hard maximum of 10 MB.
    """
    if message is None:
        return None

    hard_max = 10 * 1024 * 1024  # 10 MB
    soft_max = 1024 * 1024  # 1 MB

    if len(message) > hard_max:
        raise HTTPException(
            status_code=413,
            detail="Clipboard message too large (max 10 MB)",
        )

    if len(message) > soft_max:
        logger.warning(
            "Clipboard message truncated from %d to %d bytes",
            len(message),
            soft_max,
        )
        return message[:soft_max]

    return message


@router.post("/{session_id}/focus")
async def focus_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    body: FocusRequest | None = None,
) -> dict[str, str]:
    """Bring a session's terminal to the foreground and optionally copy a message to clipboard.

    Uses platform-appropriate commands (macOS AppleScript, Linux wmctrl/xdg-terminal).
    Clipboard copy uses ``pbcopy`` (macOS), ``xclip`` (Linux), or ``clip`` (Windows).

    Args:
        session_id: Identifier for the session to focus.
        body: Optional request body with a message to copy to clipboard.
        db: Database session dependency.

    Returns:
        A status payload confirming the focus action.

    Raises:
        HTTPException: 404 if the session is not found. Any other failure
        propagates to the app-level exception handler (ARC-024).
    """
    result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Bring Terminal to foreground (non-blocking async subprocess)
    if sys.platform == "darwin":
        await asyncio.create_subprocess_exec(
            "osascript",
            "-e",
            'tell application "Terminal" to activate',
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
    elif sys.platform == "linux":
        # Try common Linux terminal activators; non-fatal if unavailable.
        for cmd in [
            ["xdg-terminal", "wait"],
            ["wmctrl", "-xa", "terminal"],
        ]:
            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await proc.wait()
                break
            except FileNotFoundError:
                continue

    # Optionally copy message to clipboard (non-blocking async subprocess)
    clipboard_message = _validate_clipboard_message(body.message if body else None)
    if clipboard_message:
        clipboard_cmd: list[str] = []
        if sys.platform == "darwin":
            clipboard_cmd = ["pbcopy"]
        elif sys.platform == "linux":
            clipboard_cmd = ["xclip", "-selection", "clipboard"]
        elif sys.platform == "win32":
            clipboard_cmd = ["clip"]

        if clipboard_cmd:
            try:
                proc = await asyncio.create_subprocess_exec(
                    *clipboard_cmd,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await proc.communicate(input=clipboard_message.encode("utf-8"))
            except FileNotFoundError:
                logger.warning("Clipboard command not found: %s", clipboard_cmd[0])

    return {"status": "success", "message": f"Session {session_id} focused"}


@router.get("/{session_id}/replay")
async def get_session_replay(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    offset: int = Query(0, ge=0, description="Skip the first N replay entries"),
    limit: int | None = Query(None, ge=1, description="Return at most N entries (capped at 2000)"),
) -> list[ReplayEntry]:
    """Get events and resulting states for session replay, with optional pagination.

    Replays events through the state machine to reconstruct the state
    after each event, enabling frontend replay functionality.

    Pagination (ARC-015) applies to the *returned entries* only. State
    reconstruction always replays from event 0 — when ``offset > 0`` the
    StateMachine still transitions through the full prefix so the state
    snapshot at entry N reflects every prior event. Defaults (offset=0,
    limit=None) preserve today's full-response behaviour, so the frontend
    needs no change.
    """
    # Fetch ALL events — no SQL .offset()/.limit() here, because the
    # StateMachine must see the full prefix to reconstruct state correctly.
    # Row id tiebreak keeps the order deterministic for equal timestamps
    # (same-second bursts), matching the restore path.
    stmt = (
        select(EventRecord)
        .where(EventRecord.session_id == session_id)
        .order_by(EventRecord.timestamp.asc(), EventRecord.id.asc())
    )
    result = await db.execute(stmt)
    events = result.scalars().all()

    from pydantic import ValidationError

    from app.core.state_machine import StateMachine
    from app.models.events import EventAdapter, EventType

    effective_limit = min(limit, 2000) if limit is not None else None

    sm = StateMachine()
    replay_data: list[ReplayEntry] = []
    # Counts valid (appendable) entries only — invalid/unparseable events are
    # skipped before transition, so they don't shift the offset window.
    valid_idx = 0

    for rec in events:
        try:
            event_type = EventType(rec.event_type)
        except ValueError:
            logger.warning(
                "Skipping unknown event_type %r in replay (session=%s)",
                rec.event_type,
                session_id,
            )
            continue
        try:
            evt = EventAdapter.validate_python(
                {
                    "event_type": event_type,
                    "session_id": rec.session_id,
                    "timestamp": rec.timestamp,
                    "data": rec.data or {},
                }
            )
        except ValidationError:
            # Unknown event_type values reach here too (defensive double
            # guard alongside the EventType(rec.event_type) try/except).
            logger.warning(
                "Skipping event that failed union validation in replay (session=%s, type=%s)",
                rec.event_type,
                session_id,
            )
            continue
        # Full-prefix reconstruction: every valid event transitions the SM,
        # even those before ``offset``. Only the append is gated below.
        sm.transition(evt)

        if valid_idx < offset:
            valid_idx += 1
            continue
        valid_idx += 1

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
                    # Same ``_entry_id`` scheme as the live and restore paths:
                    # the bare timestamp collided for same-second events, and
                    # one DB row must not carry two id schemes.
                    "id": get_event_processor().get_entry_id(evt, rec.id),
                    "type": rec.event_type,
                    "agentId": str(agent_id),
                    "summary": get_event_processor().get_event_summary(evt),
                    "timestamp": ts_utc.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                },
                "state": state.model_dump(mode="json", by_alias=True),
            }
        )

        if effective_limit is not None and len(replay_data) >= effective_limit:
            break

    return replay_data


@router.post("/simulate")
async def trigger_simulation() -> dict[str, str]:
    """Start the event simulation script in the background."""
    global _simulation_process

    if _simulation_process is not None and _simulation_process.poll() is None:
        # Offload the blocking terminate()+wait(timeout=5) to a worker thread
        # so the event loop is not stalled for up to 5 seconds (ARC-003).
        await asyncio.to_thread(kill_simulation)

    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))
    script_path = os.path.join(project_root, "scripts/simulate_events.py")

    _simulation_process = subprocess.Popen(
        ["uv", "run", "python", script_path],
        cwd=project_root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    return {"status": "success", "message": "Simulation started in background"}


@router.delete("")
async def clear_database(db: Annotated[AsyncSession, Depends(get_db)]) -> dict[str, str]:
    """Clear all sessions and events from the database."""
    # Offload the blocking terminate()+wait(timeout=5) to a worker thread
    # so the event loop is not stalled for up to 5 seconds (ARC-003).
    simulation_killed = await asyncio.to_thread(kill_simulation)

    # Preserve building/floor configuration while clearing everything else.
    await db.execute(delete(UserPreference).where(UserPreference.key != "building_config"))
    await db.execute(delete(TaskRecord))
    await db.execute(delete(EventRecord))
    await db.execute(delete(SessionRecord))
    await db.commit()

    # Re-invalidate cached building config in case other preferences changed.
    from app.core.floor_config import invalidate_building_config

    invalidate_building_config()

    await get_event_processor().clear_all_sessions()
    git_service.clear()

    await get_manager().broadcast_all({"type": "reload", "timestamp": ""})

    message = "Database and memory cleared"
    if simulation_killed:
        message += " (simulation stopped)"
    return {"status": "success", "message": message}


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
        HTTPException: 404 if the session is not found. Any other failure
        propagates to the app-level exception handler (ARC-024).
    """
    result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.execute(delete(TaskRecord).where(TaskRecord.session_id == session_id))
    await db.execute(delete(EventRecord).where(EventRecord.session_id == session_id))
    await db.execute(delete(SessionRecord).where(SessionRecord.id == session_id))
    await db.commit()

    await get_event_processor().remove_session(session_id)

    # Broadcast session deletion to all connected clients
    await get_manager().broadcast_all(
        {
            "type": "session_deleted",
            "session_id": session_id,
            "timestamp": "",
        }
    )

    return {"status": "success", "message": f"Session {session_id} deleted"}
