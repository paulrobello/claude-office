import importlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from rich.logging import RichHandler
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.api.routes import events, floors, preferences, sessions
from app.api.websocket import manager
from app.config import get_settings
from app.core.event_processor import event_processor
from app.core.summary_service import get_summary_service
from app.db.database import Base, get_engine
from app.services.git_service import git_service

STATIC_DIR = Path(__file__).parent.parent / "static"


logging.basicConfig(
    level=logging.INFO, format="%(message)s", handlers=[RichHandler(rich_tracebacks=True)]
)

settings = get_settings()


async def _migrate_schema(conn: AsyncConnection) -> None:
    """Add columns to existing tables that were added after initial schema.

    Only runs for SQLite. Uses ALTER TABLE ADD COLUMN which is a no-op if
    the column already exists (checked via PRAGMA first).
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
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Manage application startup and shutdown lifecycle."""
    importlib.import_module("app.db.models")
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_schema(conn)

    git_service.start()

    yield

    await git_service.stop()
    await get_engine().dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    from app.core.room_orchestrator import RoomOrchestrator

    await manager.connect_room(websocket, room_id)
    try:
        # Send current room state on connect
        orch: RoomOrchestrator | None = event_processor.orchestrators.get(room_id)  # type: ignore[union-attr]
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


if STATIC_DIR.exists():
    app.mount("/_next", StaticFiles(directory=STATIC_DIR / "_next"), name="next_static")

    @app.get("/{path:path}")
    async def serve_frontend(path: str) -> FileResponse:
        """Serve static frontend files with SPA fallback routing."""
        file_path = STATIC_DIR / path
        if file_path.is_file():
            return FileResponse(file_path)

        html_path = STATIC_DIR / f"{path}.html"
        if html_path.is_file():
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
