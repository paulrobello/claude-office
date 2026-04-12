import logging
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import StaticPool

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

_engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False, "timeout": 15},
    poolclass=StaticPool,
)


@event.listens_for(_engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:  # pyright: ignore[reportUnusedFunction]
    """Enable WAL mode and busy timeout on every SQLite connection.

    WAL mode allows concurrent readers alongside a single writer, which
    prevents the "database is locked" errors that occur when multiple
    async tasks (hook events, pollers, git service) write concurrently.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


_session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""

    pass


def get_engine() -> AsyncEngine:
    """Get the current database engine."""
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Get the current async session factory."""
    return _session_factory


def override_engine(new_engine: AsyncEngine) -> None:
    """Override the database engine and session factory for testing."""
    global _engine, _session_factory
    _engine = new_engine
    _session_factory = async_sessionmaker(
        bind=_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def get_db() -> AsyncIterator[AsyncSession]:
    """Dependency for getting a database session."""
    async with _session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


class AsyncSessionLocal:
    """Context manager for database sessions."""

    def __init__(self) -> None:
        self._session: AsyncSession | None = None

    async def __aenter__(self) -> AsyncSession:
        self._session = _session_factory()
        return self._session

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if self._session:
            if exc_type is not None:
                await self._session.rollback()
            await self._session.close()


engine = _engine
