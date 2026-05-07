import importlib
import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from rich.logging import RichHandler
from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncConnection
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes import events, floors, preferences, sessions
from app.api.websocket import (
    manager,
)
from app.config import get_settings
from app.core.event_processor import event_processor
from app.core.summary_service import get_summary_service
from app.db.database import Base, get_engine
from app.db.models import SessionRecord
from app.services.git_service import git_service

STATIC_DIR = Path(__file__).parent.parent / "static"

_SERVE_STATIC = os.environ.get("SERVE_STATIC", "").lower() in ("1", "true", "yes")

_LOCALHOST_HOSTS = frozenset({"127.0.0.1", "::1", "localhost", "testclient"})


class LocalhostOnlyMiddleware(BaseHTTPMiddleware):
    """Reject HTTP requests from non-localhost origins.

    This is a local-only development tool, not deployed to the public internet.
    All API endpoints (including subprocess execution and clipboard writes)
    are protected by restricting access to the loopback interface.

    ``"testclient"`` is the sentinel host used by Starlette's test transport
    and cannot appear on a real TCP connection, so it is safe to allow.
    """

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        client_host = request.client.host if request.client else None
        if client_host not in _LOCALHOST_HOSTS:
            return JSONResponse(
                status_code=403,
                content={"detail": "Access denied: localhost only"},
            )
        return await call_next(request)


logging.basicConfig(
    level=logging.INFO, format="%(message)s", handlers=[RichHandler(rich_tracebacks=True)]
)

settings = get_settings()


async def _migrate_schema(conn: AsyncConnection) -> None:
    """Add columns to existing tables that were added after initial schema.

    Only runs for SQLite. Uses ALTER TABLE ADD COLUMN which is a no-op if
    the column already exists (checked via PRAGMA first).

    NOTE: This project intentionally uses inline schema migration instead of
    Alembic.  The backend is SQLite-only and single-instance, so the lightweight
    PRAGMA-based approach is sufficient.  Alembic was removed as a dependency
    (see pyproject.toml).
    """
    dialect = conn.dialect.name
    if dialect != "sqlite":
        return

    new_columns: dict[str, str] = {
        "label": "TEXT DEFAULT NULL",
        "display_name": "TEXT DEFAULT NULL",
        "floor_id": "TEXT DEFAULT NULL",
        "room_id": "TEXT DEFAULT NULL",
        "team_name": "TEXT DEFAULT NULL",
        "teammate_name": "TEXT DEFAULT NULL",
        "is_lead": "BOOLEAN DEFAULT 0",
    }

    result = await conn.execute(text("PRAGMA table_info(sessions)"))
    existing = {row[1] for row in result.fetchall()}

    for col_name, col_def in new_columns.items():
        if col_name not in existing:
            await conn.execute(text(f"ALTER TABLE sessions ADD COLUMN {col_name} {col_def}"))


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    """Manage application startup and shutdown lifecycle."""
    importlib.import_module("app.db.models")
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_schema(conn)

    await _reap_stale_sessions()

    git_service.start()

    yield

    await git_service.stop()
    await get_engine().dispose()


async def _reap_stale_sessions() -> None:
    """Mark active sessions with no activity for 48+ hours as completed."""
    from sqlalchemy.ext.asyncio import async_sessionmaker

    reap_logger = logging.getLogger("claude-office.reaper")
    session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    cutoff = datetime.now(UTC) - timedelta(hours=48)
    async with session_factory() as db:
        result = await db.execute(
            update(SessionRecord)
            .where(SessionRecord.status == "active", SessionRecord.updated_at < cutoff)
            .values(status="completed")
            .execution_options(synchronize_session="fetch")
        )
        await db.commit()
        count = int(str(getattr(result, "rowcount", 0)))
        if count > 0:
            reap_logger.info("Reaped %d stale sessions (inactive >48h)", count)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(LocalhostOnlyMiddleware)

app.include_router(events.router, prefix=f"{settings.API_V1_STR}")
app.include_router(floors.router, prefix=f"{settings.API_V1_STR}")
app.include_router(preferences.router, prefix=f"{settings.API_V1_STR}")
app.include_router(sessions.router, prefix=f"{settings.API_V1_STR}")


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/status")
async def get_status() -> dict[str, bool | str | None]:
    """Get server status including AI summary availability."""
    summary_service = get_summary_service()
    return {
        "aiSummaryEnabled": summary_service.enabled,
        "aiSummaryModel": summary_service.model if summary_service.enabled else None,
    }


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str) -> None:
    from app.api.websocket import validate_session_id, validate_websocket_origin

    if not validate_session_id(session_id):
        await websocket.close(code=4000, reason="Invalid session ID format")
        return

    if not validate_websocket_origin(websocket):
        await websocket.close(code=4003, reason="Origin not allowed")
        return

    await manager.connect(websocket, session_id)

    current_state = await event_processor.get_current_state(session_id)
    if current_state:
        await manager.send_personal_message(
            {
                "type": "state_update",
                "timestamp": current_state.last_updated.isoformat(),
                "state": current_state.model_dump(mode="json", by_alias=True),
            },
            websocket,
        )

    project_root = await event_processor.get_project_root(session_id)
    if project_root:
        git_service.configure(session_id=session_id, project_root=project_root)

    git_status = git_service.get_status()
    if git_status:
        await manager.send_personal_message(
            {
                "type": "git_status",
                "timestamp": git_status.last_updated.isoformat(),
                "gitStatus": git_status.model_dump(mode="json"),
            },
            websocket,
        )

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket, session_id)


@app.websocket("/ws/room/{room_id}")
async def websocket_room(websocket: WebSocket, room_id: str) -> None:
    """Room-level WebSocket: sends merged state for all sessions in a room."""
    from app.api.websocket import validate_session_id, validate_websocket_origin

    if not validate_session_id(room_id):
        await websocket.close(code=4000, reason="Invalid room ID format")
        return

    if not validate_websocket_origin(websocket):
        await websocket.close(code=4003, reason="Origin not allowed")
        return

    from app.core.room_orchestrator import RoomOrchestrator

    await manager.connect_room(websocket, room_id)
    try:
        # Send current room state on connect
        orch: RoomOrchestrator | None = event_processor.orchestrators.get(room_id)
        if orch:
            state = orch.merge()
            if state:
                await websocket.send_json(
                    {
                        "type": "state_update",
                        "timestamp": state.last_updated.isoformat(),
                        "state": state.model_dump(mode="json", by_alias=True),
                    }
                )
        # Keep alive -- discard incoming messages
        while True:
            await websocket.receive_text()
    except Exception:
        pass
    finally:
        await manager.disconnect_room(websocket, room_id)


def _safe_static_path(requested_path: str) -> Path | None:
    """Resolve a static file path and verify it stays within STATIC_DIR.

    Returns the resolved Path if safe, or None if the path escapes the
    static directory (path traversal attempt).
    """
    # Resolve both to absolute, real paths to eliminate symlinks and '..'
    resolved = (STATIC_DIR / requested_path).resolve()
    static_root = STATIC_DIR.resolve()

    # Ensure the resolved path is within the static directory
    try:
        resolved.relative_to(static_root)
    except ValueError:
        return None

    return resolved


if _SERVE_STATIC and STATIC_DIR.exists():
    _static_dir_resolved = STATIC_DIR.resolve()

    app.mount("/_next", StaticFiles(directory=STATIC_DIR / "_next"), name="next_static")

    @app.get("/{path:path}")
    async def serve_frontend(path: str) -> FileResponse:
        """Serve static frontend files with SPA fallback routing."""
        # Reject path traversal attempts
        file_path = _safe_static_path(path)
        if file_path is None:
            return FileResponse(STATIC_DIR / "index.html")

        if file_path.is_file():
            return FileResponse(file_path)

        html_path = _safe_static_path(f"{path}.html")
        if html_path is not None and html_path.is_file():
            return FileResponse(html_path)

        index_path = STATIC_DIR / "index.html"
        if index_path.is_file():
            return FileResponse(index_path)

        not_found_path = STATIC_DIR / "404.html"
        if not_found_path.is_file():
            return FileResponse(not_found_path, status_code=404)
        return FileResponse(index_path)

    @app.get("/")
    async def serve_index() -> FileResponse:
        """Serve the index page."""
        return FileResponse(STATIC_DIR / "index.html")
