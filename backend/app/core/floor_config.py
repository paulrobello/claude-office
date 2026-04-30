"""Building and floor configuration models for multi-floor office navigation.

Provides Pydantic models for defining building layouts with floors (teams)
and rooms (repos). Configuration is stored as JSON in the user_preferences
table under the key ``building_config``, and can also be loaded from
``floors.toml`` for development/testing.
"""

import json
import logging
import tomllib
from pathlib import Path
from typing import Any, cast

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import UserPreference

logger = logging.getLogger(__name__)

DEFAULT_TOML_PATH = Path(__file__).parent.parent.parent / "floors.toml"

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


def load_building_config_from_toml(
    *,
    toml_path: Path | None = None,
    toml_string: str | None = None,
) -> BuildingConfig:
    """Load building config from a TOML file or string (sync, for testing/dev).

    Args:
        toml_path: Path to a ``floors.toml`` file.
        toml_string: Raw TOML content (takes priority over *toml_path*).

    Returns:
        A :class:`BuildingConfig`. Returns an empty config on errors.
    """
    raw: dict[str, Any] = {}

    if toml_string is not None:
        raw = tomllib.loads(toml_string)
    elif toml_path is not None:
        if not toml_path.exists():
            logger.warning("floors.toml not found at %s — using empty config", toml_path)
            return BuildingConfig()
        raw = tomllib.loads(toml_path.read_text(encoding="utf-8"))
    else:
        return BuildingConfig()

    floors: list[FloorConfig] = []
    for entry in raw.get("floors", []):
        entry_dict: dict[str, Any] = entry
        floor_id: str = entry_dict["name"].lower().replace(" ", "")
        rooms: list[RoomConfig] = [
            RoomConfig(id=str(r), repo_name=str(r)) for r in entry_dict.get("repos", [])
        ]
        floors.append(
            FloorConfig(
                id=floor_id,
                name=str(entry_dict["name"]),
                floor_number=int(entry_dict["floor_number"]),
                accent=str(entry_dict.get("accent", "#6366f1")),
                icon=str(entry_dict.get("icon", "🏢")),
                rooms=rooms,
            )
        )

    floors.sort(key=lambda f: f.floor_number, reverse=True)
    return BuildingConfig(
        building_name=str(raw.get("building_name", "Office")),
        floors=floors,
    )
