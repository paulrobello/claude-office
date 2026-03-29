"""Floor and building configuration loader.

Reads ``floors.toml`` to define the building hierarchy:
Building > Floor > Room.  Each floor maps to a Tesseron product,
each room maps to a repository.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

import tomli
from pydantic import BaseModel, Field

__all__ = [
    "RoomConfig",
    "FloorConfig",
    "BuildingConfig",
    "load_building_config",
    "get_building_config",
]

logger = logging.getLogger(__name__)

DEFAULT_TOML_PATH = Path(__file__).parent.parent.parent / "floors.toml"


class RoomConfig(BaseModel):
    """A single room (repository) on a floor."""

    id: str
    repo_name: str


class FloorConfig(BaseModel):
    """A single floor (product) in the building."""

    id: str = ""
    name: str
    floor_number: int
    accent: str
    icon: str
    rooms: list[RoomConfig] = Field(default_factory=list)


class BuildingConfig(BaseModel):
    """Top-level building configuration."""

    floors: list[FloorConfig] = Field(default_factory=list)

    def get_floor(self, floor_id: str) -> FloorConfig | None:
        """Look up a floor by its generated id."""
        return next((f for f in self.floors if f.id == floor_id), None)

    def find_room(self, repo_name: str) -> tuple[FloorConfig, RoomConfig] | None:
        """Find which floor and room a repo belongs to."""
        for floor in self.floors:
            for room in floor.rooms:
                if room.repo_name == repo_name:
                    return floor, room
        return None


def load_building_config(
    *,
    toml_path: Path | None = None,
    toml_string: str | None = None,
) -> BuildingConfig:
    """Load building config from a TOML file or string.

    Args:
        toml_path: Path to a ``floors.toml`` file.
        toml_string: Raw TOML content (takes priority over *toml_path*).

    Returns:
        A :class:`BuildingConfig`. Returns an empty config on errors.
    """
    raw: dict = {}

    if toml_string is not None:
        raw = tomli.loads(toml_string)
    elif toml_path is not None:
        if not toml_path.exists():
            logger.warning("floors.toml not found at %s — using empty config", toml_path)
            return BuildingConfig()
        raw = tomli.loads(toml_path.read_text(encoding="utf-8"))

    floors: list[FloorConfig] = []
    for entry in raw.get("floors", []):
        floor_id = entry["name"].lower().replace(" ", "")
        rooms = [RoomConfig(id=r, repo_name=r) for r in entry.get("repos", [])]
        floors.append(
            FloorConfig(
                id=floor_id,
                name=entry["name"],
                floor_number=entry["floor_number"],
                accent=entry["accent"],
                icon=entry["icon"],
                rooms=rooms,
            )
        )

    floors.sort(key=lambda f: f.floor_number, reverse=True)
    return BuildingConfig(floors=floors)


@lru_cache(maxsize=1)
def get_building_config() -> BuildingConfig:
    """Return the cached building configuration singleton."""
    return load_building_config(toml_path=DEFAULT_TOML_PATH)
