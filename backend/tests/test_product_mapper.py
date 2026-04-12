"""Tests for ProductMapper — maps project context to floor + room."""

import pytest

from app.core.floor_config import BuildingConfig, FloorConfig, RoomConfig
from app.core.product_mapper import ProductMapper, RoomAssignment


@pytest.fixture
def mapper() -> ProductMapper:
    config = BuildingConfig(
        floors=[
            FloorConfig(
                id="recepthor",
                name="Recepthor",
                floor_number=3,
                accent="#2563eb",
                icon="⚖️",
                rooms=[
                    RoomConfig(id="recepthor-api", repo_name="recepthor-api"),
                    RoomConfig(id="recepthor-hub", repo_name="recepthor-hub"),
                    RoomConfig(id="recepthor-scraper", repo_name="recepthor-scraper"),
                    RoomConfig(id="recepthor-web", repo_name="recepthor-web"),
                    RoomConfig(id="recepthor-serverless", repo_name="recepthor-serverless"),
                ],
            ),
            FloorConfig(
                id="lexio",
                name="Lexio",
                floor_number=2,
                accent="#7c3aed",
                icon="📚",
                rooms=[RoomConfig(id="lexio", repo_name="lexio")],
            ),
            FloorConfig(
                id="entreperros",
                name="entreperros",
                floor_number=1,
                accent="#059669",
                icon="🐕",
                rooms=[RoomConfig(id="entreperros", repo_name="entreperros")],
            ),
        ]
    )
    return ProductMapper(config)


def test_resolve_from_project_name_exact_match(mapper: ProductMapper) -> None:
    result = mapper.resolve(project_name="recepthor-api")
    assert result is not None
    assert result.floor_id == "recepthor"
    assert result.room_id == "recepthor-api"


def test_resolve_from_project_name_with_prefix(mapper: ProductMapper) -> None:
    """project_name with org prefix does NOT match directly — dashes are ambiguous."""
    result = mapper.resolve(project_name="panoptica/recepthor-web")
    # On main, project_name "panoptica/recepthor-web" is used as-is for lookup;
    # no match because the repo_map key is "recepthor-web", not "panoptica/recepthor-web".
    assert result is None


def test_resolve_from_project_dir(mapper: ProductMapper) -> None:
    """Resolve via project_dir basename when the path matches a known repo."""
    result = mapper.resolve(project_dir="/home/user/dev/tesseron/recepthor-scraper")
    assert result is not None
    assert result.floor_id == "recepthor"
    assert result.room_id == "recepthor-scraper"


def test_resolve_from_working_dir(mapper: ProductMapper) -> None:
    """Resolve via working_dir basename when the path matches a known repo."""
    result = mapper.resolve(working_dir="/home/user/dev/tesseron/lexio")
    assert result is not None
    assert result.floor_id == "lexio"
    assert result.room_id == "lexio"


def test_resolve_unknown_repo(mapper: ProductMapper) -> None:
    result = mapper.resolve(project_dir="/home/user/dev/unknown-repo")
    assert result is None


def test_resolve_no_context(mapper: ProductMapper) -> None:
    result = mapper.resolve()
    assert result is None


def test_resolve_project_dir_takes_priority(mapper: ProductMapper) -> None:
    """On main, project_dir is resolved first, before project_name."""
    result = mapper.resolve(
        project_name="lexio",
        project_dir="/home/user/dev/tesseron/recepthor-api",
    )
    assert result is not None
    # project_dir is tried first, so recepthor-api wins
    assert result.room_id == "recepthor-api"


def test_resolve_dir_basename_fallback(mapper: ProductMapper) -> None:
    """If no .git parent is found, falls back to directory basename."""
    result = mapper.resolve(project_dir="/home/user/dev/tesseron/entreperros")
    assert result is not None
    assert result.floor_id == "entreperros"
    assert result.room_id == "entreperros"


def test_room_assignment_dataclass() -> None:
    ra = RoomAssignment(floor_id="recepthor", room_id="recepthor-api")
    assert ra.floor_id == "recepthor"
    assert ra.room_id == "recepthor-api"
