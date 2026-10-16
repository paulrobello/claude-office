import asyncio
import contextlib
import importlib
import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from rich.logging import RichHandler
from sqlalchemy import delete, select, update

from app.api.middleware import ApiKeyMiddleware, LocalhostOnlyMiddleware
from app.api.routes import events, floors, preferences, sessions, websockets
from app.config import get_settings
from app.core.event_processor import EventProcessor, get_event_processor
from app.core.summary_service import get_summary_service
from app.db.database import Base, get_engine
from app.db.migrate import migrate_schema
from app.db.models import EventRecord, SessionRecord
from app.services.git_service import git_service

STATIC_DIR = Path(__file__).parent.parent / "static"

_SERVE_STATIC = os.environ.get("SERVE_STATIC", "").lower() in ("1", "true", "yes")

settings = get_settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[RichHandler(rich_tracebacks=settings.LOG_RICH_TRACEBACKS)],
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    """Manage application startup and shutdown lifecycle."""
    importlib.import_module("app.db.models")
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await migrate_schema(conn)

    await _reap_stale_sessions()

    # Deliver the auto-generated key via the launch console (the trust boundary:
    # only the launching user sees the terminal). Never echo an explicitly
    # configured key (SEC-001).
    if not settings.has_explicit_key:
        logger.info(
            "Auto-generated API key for state-changing endpoints: %s",
            settings.effective_api_key,
        )
        logger.info(
            "Open the UI with this URL to authorize destructive actions: "
            "http://localhost:3000/?token=%s (dev) or "
            "http://localhost:8050/?token=%s (static, published by docker-compose)",
            settings.effective_api_key,
            settings.effective_api_key,
        )

    if not settings.LOCALHOST_ONLY:
        logger.warning(
            "LOCALHOST_ONLY is disabled: the client-IP check is off and the "
            "loopback boundary is the host port binding. Other containers on "
            "the same Docker network can reach this API unauthenticated."
        )

    git_service.start()

    # Periodic idle-session eviction (ARC-015). Drops in-memory StateMachine
    # instances that have not seen activity for ``SESSION_IDLE_EVICT_SECONDS``
    # (default 6h); state is replayable from the DB on next access. Mirrors
    # the git_service.start()/stop() pattern: started before yield, cancelled
    # and awaited on shutdown so the loop never outlives the app.
    idle_evictor = asyncio.create_task(
        _idle_eviction_loop(
            get_event_processor(),
            interval=15 * 60,
            max_idle=settings.SESSION_IDLE_EVICT_SECONDS,
        )
    )

    yield

    # Cancel any pending debounced overview broadcast so shutdown is clean.
    await get_event_processor().shutdown()
    idle_evictor.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await idle_evictor
    await git_service.stop()
    await get_engine().dispose()


async def _reap_stale_sessions() -> None:
    """Mark active sessions with no activity for 48+ hours as completed.

    When ``EVENT_RETENTION_DAYS`` is set (> 0), also deletes EventRecord rows
    for sessions already ``completed`` whose ``updated_at`` is older than the
    retention window (ARC-015). Default 0 preserves today's behaviour — no
    event rows are ever deleted, so replay keeps working for every session.
    """
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
        count = getattr(result, "rowcount", 0) or 0
        if count > 0:
            reap_logger.info("Reaped %d stale sessions (inactive >48h)", count)

        # Opt-in event retention (ARC-015). Only fires when the admin sets
        # EVENT_RETENTION_DAYS > 0. Deleting events breaks replay for the
        # affected sessions, so the default (0) never deletes anything.
        retention_days = settings.EVENT_RETENTION_DAYS
        if retention_days > 0:
            retention_cutoff = datetime.now(UTC) - timedelta(days=retention_days)
            stale_session_ids = select(SessionRecord.id).where(
                SessionRecord.status == "completed",
                SessionRecord.updated_at < retention_cutoff,
            )
            deleted = await db.execute(
                delete(EventRecord).where(EventRecord.session_id.in_(stale_session_ids))
            )
            await db.commit()
            del_count = getattr(deleted, "rowcount", 0) or 0
            if del_count > 0:
                reap_logger.info(
                    "Deleted %d event rows for completed sessions older than %dd (retention)",
                    del_count,
                    retention_days,
                )


async def _idle_eviction_loop(
    event_processor: EventProcessor, interval: float, max_idle: float
) -> None:
    """Periodically drop idle in-memory sessions (ARC-015).

    Runs as a background task started in ``lifespan``. Each tick calls
    ``EventProcessor.evict_idle_sessions``; state is replayable from the DB
    on next access. Cancellation (on shutdown) is the only exit — the loop
    logs and continues on per-tick errors so a transient failure doesn't
    permanently disable eviction.
    """
    evict_logger = logging.getLogger("claude-office.idle-evictor")
    try:
        while True:
            await asyncio.sleep(interval)
            try:
                count = await event_processor.evict_idle_sessions(max_idle)
                if count:
                    evict_logger.info("Evicted %d idle sessions (idle >%ds)", count, int(max_idle))
            except asyncio.CancelledError:
                raise
            except Exception:
                evict_logger.exception("Idle eviction sweep failed")
    except asyncio.CancelledError:
        evict_logger.info("Idle eviction loop stopped")


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
app.add_middleware(ApiKeyMiddleware)

app.include_router(events.router, prefix=f"{settings.API_V1_STR}")
app.include_router(floors.router, prefix=f"{settings.API_V1_STR}")
app.include_router(preferences.router, prefix=f"{settings.API_V1_STR}")
app.include_router(sessions.router, prefix=f"{settings.API_V1_STR}")
# WebSocket routes (no prefix). Registered before the SERVE_STATIC catch-all
# ``@app.get("/{path:path}")`` block so WS handshakes aren't shadowed. Within
# the router, ``/ws/overview`` is declared before ``/ws/{session_id}`` so the
# literal path wins over the parameterized one.
app.include_router(websockets.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unhandled route exceptions.

    Logs the traceback with the request context and returns a generic 500
    response so route handlers no longer need a copy-pasted
    ``except Exception -> logger.exception -> raise HTTPException(500)``
    tail (ARC-024). ``HTTPException`` is handled by FastAPI's default
    handler and never reaches this code path.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get(f"{settings.API_V1_STR}/status")
async def get_status() -> dict[str, bool | str | None]:
    """Get server status including AI summary availability.

    The API key is no longer returned over HTTP (SEC-001). The frontend receives
    it out-of-band via the ``?token=`` launch URL printed to the server console;
    see ``initApiKeyFromBrowser`` on the frontend side.
    """
    summary_service = get_summary_service()
    return {
        "aiSummaryEnabled": summary_service.enabled,
        "aiSummaryModel": summary_service.model if summary_service.enabled else None,
    }


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
