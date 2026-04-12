"""Building and floor configuration models for multi-floor office navigation.

Provides Pydantic models for defining building layouts with floors (teams)
and rooms (repos). Configuration is stored as JSON in the user_preferences
table under the key ``building_config``.
"""

import json
import logging
from typing import Any, cast

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import UserPreference

logger = logging.getLogger(__name__)

BUILDING_CONFIG_KEY = "building_config"


class RoomConfig(BaseModel):
    """A room (repo) within a floor."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    repo_name: str


class FloorConfig(BaseModel):
    """A floor (team) within the building."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    name: str
    floor_number: int
    accent: str = "#6366f1"
    icon: str = "🏢"
    rooms: list[RoomConfig] = Field(default_factory=lambda: cast(list[RoomConfig], []))


class BuildingConfig(BaseModel):
    """Top-level building configuration with floors and rooms."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    building_name: str = "Office"
    floors: list[FloorConfig] = Field(default_factory=lambda: cast(list[FloorConfig], []))

    def get_floor(self, floor_id: str) -> FloorConfig | None:
        """Look up a floor by its ID.

        Args:
            floor_id: The unique floor identifier.

        Returns:
            The matching FloorConfig, or None if not found.
        """
        for floor in self.floors:
            if floor.id == floor_id:
                return floor
        return None

    def find_room(self, repo_name: str) -> tuple[FloorConfig, RoomConfig] | None:
        """Find which floor/room a repo belongs to.

        Args:
            repo_name: Repository name to look up.

        Returns:
            Tuple of (FloorConfig, RoomConfig) if found, None otherwise.
        """
        for floor in self.floors:
            for room in floor.rooms:
                if room.repo_name == repo_name:
                    return (floor, room)
        return None

    @classmethod
    def from_json(cls, json_str: str) -> "BuildingConfig":
        """Parse from a preference value string.

        Args:
            json_str: JSON string from the user_preferences table.

        Returns:
            Parsed BuildingConfig instance.

        Raises:
            ValueError: If the JSON is malformed.
        """
        data: dict[str, Any] = json.loads(json_str)
        return cls.model_validate(data)


# ---------------------------------------------------------------------------
# Module-level caching
# ---------------------------------------------------------------------------

_cached_config: BuildingConfig | None = None


def get_cached_building_config() -> BuildingConfig:
    """Return the cached building config, falling back to an empty default."""
    global _cached_config
    if _cached_config is None:
        _cached_config = BuildingConfig()
    return _cached_config


def invalidate_building_config() -> None:
    """Clear the cached building config so the next access reloads it."""
    global _cached_config
    _cached_config = None


async def load_building_config(db: AsyncSession) -> BuildingConfig:
    """Load building configuration from the user_preferences table.

    Falls back to an empty BuildingConfig if no preference is stored or if
    the stored JSON is invalid.

    Args:
        db: Async database session.

    Returns:
        The loaded (or default) BuildingConfig.
    """
    try:
        result = await db.execute(
            select(UserPreference).where(UserPreference.key == BUILDING_CONFIG_KEY)
        )
        pref = result.scalar_one_or_none()
        if pref and pref.value:
            config = BuildingConfig.from_json(pref.value)
            global _cached_config
            _cached_config = config
            return config
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Invalid building_config preference, using default: %s", exc)
    except Exception as exc:
        logger.exception("Error loading building_config: %s", exc)

    return BuildingConfig()
