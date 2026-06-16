"""Testes das rotas de execução de funções de agente.

Usa TestClient(app) sem context manager — mesmo padrão de test_coordination_routes.py.
O backup real NÃO é executado: a task asyncio é mockada.
"""
from __future__ import annotations
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_exec_unknown_agent_returns_400():
    resp = client.post(
        "/api/v1/coordination/agent-functions/exec",
        json={"agent_nome": "agente-inexistente", "function_id": "backup-hmtrack"},
    )
    assert resp.status_code == 400


def test_exec_unknown_function_returns_400():
    resp = client.post(
        "/api/v1/coordination/agent-functions/exec",
        json={"agent_nome": "banco-dados", "function_id": "funcao-inexistente"},
    )
    assert resp.status_code == 400


def test_exec_valid_returns_job_id():
    with patch(
        "app.api.routes.agent_functions._run_backup_hmtrack",
        new_callable=AsyncMock,
    ):
        resp = client.post(
            "/api/v1/coordination/agent-functions/exec",
            json={"agent_nome": "banco-dados", "function_id": "backup-hmtrack"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data
    assert isinstance(data["job_id"], str)


def test_get_job_not_found_returns_404():
    resp = client.get("/api/v1/coordination/agent-functions/jobs/nao-existe")
    assert resp.status_code == 404


def test_get_job_running_after_exec():
    with patch(
        "app.api.routes.agent_functions._run_backup_hmtrack",
        new_callable=AsyncMock,
    ):
        resp = client.post(
            "/api/v1/coordination/agent-functions/exec",
            json={"agent_nome": "banco-dados", "function_id": "backup-hmtrack"},
        )
    job_id = resp.json()["job_id"]
    resp2 = client.get(f"/api/v1/coordination/agent-functions/jobs/{job_id}")
    assert resp2.status_code == 200
    data = resp2.json()
    assert data["job_id"] == job_id
    assert data["status"] in ("running", "done", "failed")
    assert isinstance(data["progress"], int)
