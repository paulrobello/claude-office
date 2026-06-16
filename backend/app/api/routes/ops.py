"""API routes for Ops > Servidores (build + deploy de servidores HMTrack)."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.coordination import enforce_write_rate_limit
from app.db.database import get_db
from app.db.models import OpsDestination

router = APIRouter(prefix="/ops", tags=["ops"])


class DestinationBody(BaseModel):
    id: str
    label: str
    ssh_alias: str
    remote_base: str = "/root/project"
    compose_file: str = "docker-compose.alocalizai.yml"
    front_api_url: str
    registry: str
    image_tag: str
    enabled: bool = True


def _to_dict(d: OpsDestination) -> dict[str, Any]:
    return {
        "id": d.id, "label": d.label, "ssh_alias": d.ssh_alias,
        "remote_base": d.remote_base, "compose_file": d.compose_file,
        "front_api_url": d.front_api_url, "registry": d.registry,
        "image_tag": d.image_tag, "enabled": d.enabled,
    }


@router.get("/destinations")
async def list_destinations(db: Annotated[AsyncSession, Depends(get_db)]) -> list[dict[str, Any]]:
    rows = (await db.execute(select(OpsDestination))).scalars().all()
    return [_to_dict(d) for d in rows]


@router.post("/destinations", dependencies=[Depends(enforce_write_rate_limit)])
async def create_destination(
    body: DestinationBody, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, Any]:
    if (await db.get(OpsDestination, body.id)) is not None:
        raise HTTPException(status_code=409, detail={"error": "id já existe"})
    dest = OpsDestination(**body.model_dump())
    db.add(dest)
    await db.commit()
    return _to_dict(dest)


@router.put("/destinations/{dest_id}", dependencies=[Depends(enforce_write_rate_limit)])
async def update_destination(
    dest_id: str, body: DestinationBody, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, Any]:
    dest = await db.get(OpsDestination, dest_id)
    if dest is None:
        raise HTTPException(status_code=404, detail={"error": "destino não encontrado"})
    for k, v in body.model_dump().items():
        if k != "id":
            setattr(dest, k, v)
    await db.commit()
    return _to_dict(dest)


@router.delete("/destinations/{dest_id}", dependencies=[Depends(enforce_write_rate_limit)])
async def delete_destination(
    dest_id: str, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    # Guard de concorrência: bloqueia remover o destino em execução.
    # ops_runner só existe a partir da Task 4 — import defensivo até lá.
    try:
        from app.services.ops_runner import ops_runner
    except ModuleNotFoundError:
        ops_runner = None
    if ops_runner is not None and ops_runner.is_running() and ops_runner.current_dest_id() == dest_id:
        raise HTTPException(status_code=409, detail={"error": "destino em execução"})
    await db.execute(delete(OpsDestination).where(OpsDestination.id == dest_id))
    await db.commit()
    return {"deleted": dest_id}
