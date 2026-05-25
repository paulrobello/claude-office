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


def _seed_prompt(kind: str) -> int:
    """Insere um hitl_prompt pending no :5433 e retorna o id (testes live)."""
    from sqlalchemy import text

    from app.db.coordination import get_coordination_session_factory

    async def _seed() -> int:
        factory = get_coordination_session_factory()
        async with factory() as session:
            row = (
                await session.execute(
                    text(
                        "INSERT INTO hitl_prompts (question, kind, status) "
                        "VALUES ('t?', :kind, 'pending') RETURNING id"
                    ),
                    {"kind": kind},
                )
            ).first()
            await session.commit()
            assert row is not None
            return int(row[0])

    return asyncio.run(_seed())


def _delete_prompt(pid: int) -> None:
    """Remove um prompt de teste do :5433 (evita poluir o DB live de coordenação)."""
    from sqlalchemy import text

    from app.db.coordination import get_coordination_session_factory

    async def _del() -> None:
        factory = get_coordination_session_factory()
        async with factory() as session:
            await session.execute(
                text("DELETE FROM hitl_prompts WHERE id = :id"), {"id": pid}
            )
            await session.commit()

    asyncio.run(_del())


def _delete_request(rid: int) -> None:
    """Remove um request de teste do :5433 (evita poluir o DB live de coordenação)."""
    from sqlalchemy import text

    from app.db.coordination import get_coordination_session_factory

    async def _del() -> None:
        factory = get_coordination_session_factory()
        async with factory() as session:
            await session.execute(
                text("DELETE FROM requests WHERE id = :id"), {"id": rid}
            )
            await session.commit()

    asyncio.run(_del())


def _delete_agent(nome: str) -> None:
    """Remove um agente de teste do :5433 (evita poluir o roster live)."""
    from sqlalchemy import text

    from app.db.coordination import get_coordination_session_factory

    async def _del() -> None:
        factory = get_coordination_session_factory()
        async with factory() as session:
            await session.execute(
                text("DELETE FROM agents WHERE nome = :nome"), {"nome": nome}
            )
            await session.commit()

    asyncio.run(_del())


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

    def test_hitl_shape(self) -> None:
        client = TestClient(app)
        r = client.get("/api/v1/coordination/hitl?status=pending")
        assert r.status_code == 200
        assert "prompts" in r.json()

    def test_hitl_answer_and_idempotency(self) -> None:
        pid = _seed_prompt("yesno")
        try:
            client = TestClient(app)
            ok = client.post(
                f"/api/v1/coordination/hitl/{pid}/answer",
                json={"answer": True, "answered_by": "test"},
            )
            assert ok.status_code == 200
            dup = client.post(
                f"/api/v1/coordination/hitl/{pid}/answer", json={"answer": False}
            )
            assert dup.status_code == 409
        finally:
            _delete_prompt(pid)

    def test_hitl_answer_validation(self) -> None:
        pid = _seed_prompt("yesno")
        try:
            client = TestClient(app)
            bad = client.post(
                f"/api/v1/coordination/hitl/{pid}/answer", json={"answer": "nao-bool"}
            )
            assert bad.status_code == 422
        finally:
            _delete_prompt(pid)

    def test_create_request_success(self) -> None:
        """Convocação do CEO: POST /requests grava na caixa (status queued)."""
        client = TestClient(app)
        r = client.post(
            "/api/v1/coordination/requests",
            json={"to_role": "dev-front", "kind": "work",
                  "payload": {"motivo": "teste e2e"}},
        )
        assert r.status_code == 201, r.text
        req = r.json()["request"]
        try:
            assert req["from_kind"] == "human" and req["from_ref"] == "ceo"
            assert req["to_role"] == "dev-front" and req["status"] == "queued"
            assert isinstance(req["id"], int)
        finally:
            _delete_request(req["id"])

    def test_create_request_to_agent(self) -> None:
        client = TestClient(app)
        r = client.post(
            "/api/v1/coordination/requests",
            json={"to_agent": "DEV-FRONT-1", "kind": "question"},
        )
        assert r.status_code == 201, r.text
        req = r.json()["request"]
        try:
            assert req["to_agent"] == "DEV-FRONT-1" and req["kind"] == "question"
        finally:
            _delete_request(req["id"])

    def test_create_request_requires_target(self) -> None:
        client = TestClient(app)
        r = client.post("/api/v1/coordination/requests", json={"kind": "work"})
        assert r.status_code == 422
        assert r.json()["detail"]["error"] == "target_required"

    def test_create_request_invalid_kind(self) -> None:
        client = TestClient(app)
        r = client.post(
            "/api/v1/coordination/requests",
            json={"to_role": "dba", "kind": "dance"},
        )
        assert r.status_code == 422

    def test_create_agent_success_and_upsert(self) -> None:
        """Botão Contratar: cria agente no roster; 2ª chamada faz upsert por nome."""
        nome = "__TEST_HIRE__"
        client = TestClient(app)
        try:
            r = client.post(
                "/api/v1/coordination/agents",
                json={"nome": nome, "role": "__test__",
                      "projetos": ["hmtrack-front"], "mode": "on-demand"},
            )
            assert r.status_code == 201, r.text
            ag = r.json()["agent"]
            assert ag["nome"] == nome and ag["role"] == "__test__"
            assert ag["mode"] == "on-demand" and ag["status"] == "offline"
            assert ag["projetos"] == ["hmtrack-front"]
            # upsert: promove para 24/7
            r2 = client.post(
                "/api/v1/coordination/agents",
                json={"nome": nome, "role": "__test__", "mode": "persistent-24-7"},
            )
            assert r2.status_code == 201, r2.text
            assert r2.json()["agent"]["mode"] == "persistent-24-7"
        finally:
            _delete_agent(nome)

    def test_create_agent_invalid_mode(self) -> None:
        client = TestClient(app)
        r = client.post(
            "/api/v1/coordination/agents",
            json={"nome": "__x__", "role": "__test__", "mode": "boss"},
        )
        assert r.status_code == 422

    def test_create_agent_requires_nome_and_role(self) -> None:
        client = TestClient(app)
        r = client.post(
            "/api/v1/coordination/agents", json={"nome": "  ", "role": "dba"}
        )
        assert r.status_code == 422


def test_create_request_degrade_503_when_db_down() -> None:
    async def _boom():  # type: ignore[no-untyped-def]
        yield _BoomSession()

    app.dependency_overrides[get_coordination_db] = _boom
    try:
        client = TestClient(app)
        r = client.post(
            "/api/v1/coordination/requests", json={"to_role": "dba"}
        )
        assert r.status_code == 503
    finally:
        app.dependency_overrides.pop(get_coordination_db, None)


def test_create_agent_degrade_503_when_db_down() -> None:
    async def _boom():  # type: ignore[no-untyped-def]
        yield _BoomSession()

    app.dependency_overrides[get_coordination_db] = _boom
    try:
        client = TestClient(app)
        r = client.post(
            "/api/v1/coordination/agents",
            json={"nome": "__x__", "role": "__test__"},
        )
        assert r.status_code == 503
    finally:
        app.dependency_overrides.pop(get_coordination_db, None)


@pytest.mark.skipif(not _coord_up(), reason=":5433 coordination DB indisponível")
def test_coordination_version_changes_on_request() -> None:
    """O poller WS (#412) detecta mudança via current_version: inserir um request
    altera a versão → dispara broadcast."""
    import asyncio as _aio

    from app.core.coordination_poller import current_version

    v1 = _aio.run(current_version())
    assert v1 is not None
    client = TestClient(app)
    r = client.post(
        "/api/v1/coordination/requests", json={"to_role": "dev-front", "kind": "work"}
    )
    rid = r.json()["request"]["id"]
    try:
        v2 = _aio.run(current_version())
        assert v2 != v1  # versão mudou → poller fará broadcast
    finally:
        _delete_request(rid)


def test_find_duplicate_normalized_match() -> None:
    from app.api.routes.coordination import _find_duplicate

    existing = [
        {"title": "[hmtrack-front] Tela X", "url": "u1"},
        {"title": "Outra coisa", "url": "u2"},
    ]
    # match por normalização (espaços colapsados + casefold)
    assert _find_duplicate(existing, "[hmtrack-front]   tela x") == "u1"
    # título distinto → sem dedup (não engole task diferente)
    assert _find_duplicate(existing, "[hmtrack-front] Tela Y") is None
    assert _find_duplicate([], "qualquer") is None


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


def test_hitl_degrade_503_when_db_down() -> None:
    async def _boom():  # type: ignore[no-untyped-def]
        yield _BoomSession()

    app.dependency_overrides[get_coordination_db] = _boom
    try:
        client = TestClient(app)
        r = client.get("/api/v1/coordination/hitl")
        assert r.status_code == 503
    finally:
        app.dependency_overrides.pop(get_coordination_db, None)
