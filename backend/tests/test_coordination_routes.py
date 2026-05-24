"""Testes das rotas read-only de coordenação (:5433).

Os testes "live" pulam se o :5433 estiver indisponível (ou asyncpg ausente).
O teste de degrade (503) usa um override de dependency com sessão fake cujo
.execute levanta OperationalError — garantindo que o erro nasça DENTRO do try
da rota (e não no generator do dependency, que viraria 500).

NOTA: usamos TestClient(app) SEM o context manager de propósito — o `with`
dispararia o lifespan, cujo shutdown faz get_engine().dispose() e destruiria
o SQLite in-memory compartilhado do conftest (quebrando outros testes). As
rotas de coordenação usam uma engine independente (:5433), não precisam do
lifespan do app principal.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.api.routes.coordination import get_coordination_db
from app.main import app


def _coord_up() -> bool:
    from sqlalchemy import text

    from app.db.coordination import get_coordination_session_factory

    async def _probe() -> bool:
        try:
            factory = get_coordination_session_factory()
            async with factory() as session:
                await session.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    try:
        return asyncio.run(_probe())
    except Exception:
        return False


@pytest.mark.skipif(not _coord_up(), reason=":5433 coordination DB indisponível")
class TestCoordinationLive:
    def test_tasks_shape(self) -> None:
        client = TestClient(app)
        r = client.get("/api/v1/coordination/tasks")
        assert r.status_code == 200
        assert "tasks" in r.json()

    def test_agent_runs_shape(self) -> None:
        client = TestClient(app)
        r = client.get("/api/v1/coordination/agent-runs")
        assert r.status_code == 200
        assert "runs" in r.json()

    def test_dashboard_shape(self) -> None:
        client = TestClient(app)
        r = client.get("/api/v1/coordination/dashboard?period=week")
        assert r.status_code == 200
        body = r.json()
        assert {"github", "database", "closedByPeriod"} <= body.keys()


class _BoomSession:
    async def execute(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        raise OperationalError("SELECT 1", {}, Exception("down"))

    async def close(self) -> None:
        return None


def test_degrade_503_when_db_down() -> None:
    async def _boom():  # type: ignore[no-untyped-def]
        yield _BoomSession()

    app.dependency_overrides[get_coordination_db] = _boom
    try:
        client = TestClient(app)
        r = client.get("/api/v1/coordination/tasks")
        assert r.status_code == 503
        assert r.json()["detail"]["error"] == "coordination_db_unavailable"
    finally:
        app.dependency_overrides.pop(get_coordination_db, None)
