"""ProductMapper — resolves hook event context to a floor + room.

Uses the BuildingConfig (floors.toml) to map a session's project
directory, project name, or working directory to a specific room
in the building hierarchy.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.core.floor_config import BuildingConfig, get_building_config

__all__ = ["ProductMapper", "RoomAssignment", "get_product_mapper"]

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RoomAssignment:
    """Result of mapping a session to a room."""

    floor_id: str
    room_id: str


def _git_root_name(directory: str) -> str | None:
    """Walk up from *directory* looking for a .git folder, return that dir's name."""
    path = Path(directory).resolve()
    for parent in [path, *path.parents]:
        if (parent / ".git").exists():
            return parent.name
        if parent == parent.parent:
            break
    return None


class ProductMapper:
    """Maps project context (cwd, project_name, project_dir) to a room."""

    def __init__(self, config: BuildingConfig) -> None:
        self._config = config
        self._repo_names: set[str] = set()
        for floor in config.floors:
            for room in floor.rooms:
                self._repo_names.add(room.repo_name)

    def resolve(
        self,
        *,
        project_name: str | None = None,
        project_dir: str | None = None,
        working_dir: str | None = None,
    ) -> RoomAssignment | None:
        """Resolve context to a room assignment.

        Priority:
        1. project_name (may be a bare repo name or contain path segments)
        2. project_dir (git root lookup, then basename fallback)
        3. working_dir (git root lookup, then basename fallback)
        """
        # 1. Try project_name
        if project_name:
            result = self._match_name(project_name)
            if result:
                return result

        # 2. Try project_dir
        if project_dir:
            result = self._match_dir(project_dir)
            if result:
                return result

        # 3. Try working_dir
        if working_dir:
            result = self._match_dir(working_dir)
            if result:
                return result

        return None

    def _match_name(self, name: str) -> RoomAssignment | None:
        """Try to match a project name to a room."""
        # Direct match
        hit = self._config.find_room(name)
        if hit:
            return RoomAssignment(floor_id=hit[0].id, room_id=hit[1].repo_name)

        # Name might be a path segment like "panoptica/recepthor-web"
        basename = name.rsplit("/", 1)[-1]
        if basename != name:
            hit = self._config.find_room(basename)
            if hit:
                return RoomAssignment(floor_id=hit[0].id, room_id=hit[1].repo_name)

        return None

    def _match_dir(self, directory: str) -> RoomAssignment | None:
        """Try to match a directory path to a room via git root or basename."""
        # Git root lookup
        repo_name = _git_root_name(directory)
        if repo_name:
            hit = self._config.find_room(repo_name)
            if hit:
                return RoomAssignment(floor_id=hit[0].id, room_id=hit[1].repo_name)

        # Basename fallback
        basename = Path(directory).name
        hit = self._config.find_room(basename)
        if hit:
            return RoomAssignment(floor_id=hit[0].id, room_id=hit[1].repo_name)

        return None


@lru_cache(maxsize=1)
def get_product_mapper() -> ProductMapper:
    """Return the cached ProductMapper singleton."""
    return ProductMapper(get_building_config())
