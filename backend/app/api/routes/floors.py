"""Floor configuration API."""

from typing import Any

from fastapi import APIRouter

from app.core.floor_config import get_building_config

router = APIRouter()


@router.get("/floors")
async def get_floors() -> dict[str, Any]:
    """Return the building floor configuration."""
    config = get_building_config()
    return config.model_dump()
