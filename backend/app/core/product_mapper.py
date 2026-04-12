"""Maps sessions to floors based on repo/project name resolution.

When a building configuration defines floors with room-to-repo mappings,
the ProductMapper resolves incoming session context (project name, project
directory, or working directory) to a specific floor and room.
"""

import logging
from dataclasses import dataclass
from pathlib import Path

from app.core.floor_config import BuildingConfig

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RoomAssignment:
    """Immutable result of mapping a session to a floor/room."""

    floor_id: str
    room_id: str


class ProductMapper:
    """Resolves session context to a floor/room assignment.

    Builds an internal lookup table from a BuildingConfig for fast
    repo-name resolution.
    """

    def __init__(self, config: BuildingConfig) -> None:
        self._config = config
        self._repo_map: dict[str, RoomAssignment] = {}
        self._build_repo_map()

    def _build_repo_map(self) -> None:
        """Build the lookup table: repo_name -> RoomAssignment."""
        for floor in self._config.floors:
            for room in floor.rooms:
                self._repo_map[room.repo_name] = RoomAssignment(
                    floor_id=floor.id,
                    room_id=room.id,
                )
        logger.debug("ProductMapper built with %d repo mappings", len(self._repo_map))

    def resolve(
        self,
        project_name: str | None = None,
        project_dir: str | None = None,
        working_dir: str | None = None,
    ) -> RoomAssignment | None:
        """Resolve session context to a floor/room assignment.

        Priority order:
        1. Basename of ``project_dir`` (or its .git parent dir basename)
        2. Direct match on ``project_name`` (lossy — slashes→dashes, use as fallback)
        3. Basename of ``working_dir``

        Args:
            project_name: The project name from event data.
            project_dir: The project directory path from event data.
            working_dir: The working directory path from event data.

        Returns:
            RoomAssignment if a mapping is found, None otherwise.
        """
        # 1. project_dir basename (reliable — real filesystem path)
        if project_dir:
            resolved = self._resolve_from_path(project_dir)
            if resolved:
                return resolved

        # 2. Direct project_name match (lossy fallback — dashes are ambiguous)
        if project_name:
            assignment = self._repo_map.get(project_name)
            if assignment:
                return assignment

        # 3. working_dir basename
        if working_dir:
            resolved = self._resolve_from_path(working_dir)
            if resolved:
                return resolved

        return None

    def _resolve_from_path(self, directory: str) -> RoomAssignment | None:
        """Try to resolve a directory path to a repo mapping.

        Walks up to find a .git parent if needed, then matches on the
        directory basename.

        Args:
            directory: Filesystem path to resolve.

        Returns:
            RoomAssignment if a mapping is found, None otherwise.
        """
        try:
            path = Path(directory).resolve()

            # If this directory itself contains .git, use its basename
            if (path / ".git").exists():
                return self._repo_map.get(path.name)

            # Otherwise walk up to find .git parent
            for parent in path.parents:
                if (parent / ".git").exists():
                    return self._repo_map.get(parent.name)
                if parent == parent.parent:
                    break

            # Fallback: just try the original basename
            return self._repo_map.get(path.name)

        except (OSError, ValueError) as exc:
            logger.debug("Error resolving path %s: %s", directory, exc)
            return None


# ---------------------------------------------------------------------------
# Module-level caching
# ---------------------------------------------------------------------------

_cached_mapper: ProductMapper | None = None


def get_product_mapper(config: BuildingConfig | None = None) -> ProductMapper:
    """Return a cached ProductMapper, optionally rebuilding from a new config.

    Args:
        config: If provided, rebuilds the mapper from this config.

    Returns:
        A ProductMapper instance.
    """
    global _cached_mapper
    if config is not None:
        _cached_mapper = ProductMapper(config)
    if _cached_mapper is None:
        _cached_mapper = ProductMapper(BuildingConfig())
    return _cached_mapper


def invalidate_product_mapper() -> None:
    """Clear the cached ProductMapper so it will be rebuilt on next access."""
    global _cached_mapper
    _cached_mapper = None
