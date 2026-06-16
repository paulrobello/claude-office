import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import OpsDestination
from app.main import app


@pytest.mark.asyncio
async def test_ops_destination_model_roundtrip(db_session):
    dest = OpsDestination(
        id="teste", label="Teste", ssh_alias="flt", remote_base="/root/project",
        compose_file="docker-compose.alocalizai.yml",
        front_api_url="https://core.alocalizai.com.br/v1/",
        registry="ghcr.io/isakielsouza", image_tag="alocalizai", enabled=True,
    )
    db_session.add(dest)
    await db_session.commit()
    row = (await db_session.execute(select(OpsDestination).where(OpsDestination.id == "teste"))).scalar_one()
    assert row.ssh_alias == "flt"
    assert row.enabled is True


def test_destinations_crud():
    # NOTA: o seed de startup (alocalizai) NÃO roda no app de teste (DB SQLite
    # in-memory criado via metadata.create_all no conftest, sem lifespan).
    # Por isso criamos o destino "alocalizai" via POST e validamos o GET nele,
    # em vez de assumir que o seed o inseriu.
    client = TestClient(app)

    seed = {"id": "alocalizai", "label": "Alocalizai", "ssh_alias": "flt",
            "remote_base": "/root/project", "compose_file": "docker-compose.alocalizai.yml",
            "front_api_url": "https://core.alocalizai.com.br/v1/",
            "registry": "ghcr.io/isakielsouza", "image_tag": "alocalizai", "enabled": True}
    assert client.post("/api/v1/ops/destinations", json=seed).status_code == 200

    r = client.get("/api/v1/ops/destinations")
    assert r.status_code == 200
    assert any(d["id"] == "alocalizai" for d in r.json())

    body = {"id": "cliente2", "label": "Cliente 2", "ssh_alias": "cli2",
            "remote_base": "/root/project", "compose_file": "docker-compose.alocalizai.yml",
            "front_api_url": "https://core.cli2.com.br/v1/",
            "registry": "ghcr.io/isakielsouza", "image_tag": "cliente2", "enabled": True}
    assert client.post("/api/v1/ops/destinations", json=body).status_code == 200
    assert client.put("/api/v1/ops/destinations/cliente2",
                      json={**body, "ssh_alias": "cli2-novo"}).status_code == 200
    assert client.delete("/api/v1/ops/destinations/cliente2").status_code == 200
    r = client.get("/api/v1/ops/destinations")
    assert not any(d["id"] == "cliente2" for d in r.json())
