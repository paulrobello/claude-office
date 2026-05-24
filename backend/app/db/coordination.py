"""Engine read-only para o Postgres de coordenação (:5433).

Separado da engine SQLite principal (visualizer.db). NUNCA chama create_all:
o schema é dono do coletor-task. Se o :5433 estiver fora, as rotas degradam
para 503 (ver api/routes/coordination.py); aqui só lazy-criamos a engine.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.config import get_settings

logger = logging.getLogger(__name__)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _build_engine() -> AsyncEngine:
    settings = get_settings()
    # NullPool: conexão por request (sem pool). Dashboard read-only de baixo QPS,
    # então o overhead é desprezível — e evita o bug de conexão asyncpg presa a um
    # event loop morto (TestClient cria/fecha loops; em prod o loop é único).
    return create_async_engine(
        settings.COORDINATION_DATABASE_URL,
        echo=False,
        poolclass=NullPool,
    )


def get_coordination_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


def get_coordination_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_coordination_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def get_coordination_db() -> AsyncIterator[AsyncSession]:
    """Dependency FastAPI. Erros de conexão são tratados na rota (503)."""
    factory = get_coordination_session_factory()
    async with factory() as session:
        try:
            yield session
        finally:
            await session.close()


async def dispose_coordination_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
