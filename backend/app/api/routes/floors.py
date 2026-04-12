"""API routes for building/floor configuration."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.floor_config import load_building_config
from app.db.database import get_db

router = APIRouter(prefix="/floors", tags=["floors"])


@router.get("")
async def get_floors(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Return the current building/floor configuration.

    The response mirrors the BuildingConfig schema with camelCase keys
    for frontend compatibility.
    """
    config = await load_building_config(db)
    return config.model_dump(by_alias=True)
