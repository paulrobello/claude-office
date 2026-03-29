"""Tests for ProductMapper — maps project context to floor + room."""

from unittest.mock import patch

import pytest

from app.core.product_mapper import ProductMapper, RoomAssignment


SAMPLE_TOML = """
[[floors]]
name = "Recepthor"
floor_number = 3
accent = "#2563eb"
icon = "⚖️"
repos = ["recepthor-api", "recepthor-hub", "recepthor-scraper", "recepthor-web", "recepthor-serverless"]

[[floors]]
name = "Lexio"
floor_number = 2
accent = "#7c3aed"
icon = "📚"
repos = ["lexio"]

[[floors]]
name = "entreperros"
floor_number = 1
accent = "#059669"
icon = "🐕"
repos = ["entreperros"]
"""


@pytest.fixture
def mapper() -> ProductMapper:
    from app.core.floor_config import load_building_config

    config = load_building_config(toml_string=SAMPLE_TOML)
    return ProductMapper(config)


def test_resolve_from_project_name_exact_match(mapper: ProductMapper) -> None:
    result = mapper.resolve(project_name="recepthor-api")
    assert result is not None
    assert result.floor_id == "recepthor"
    assert result.room_id == "recepthor-api"


def test_resolve_from_project_name_with_prefix(mapper: ProductMapper) -> None:
    result = mapper.resolve(project_name="panoptica/recepthor-web")
    assert result is not None
    assert result.floor_id == "recepthor"
    assert result.room_id == "recepthor-web"


def test_resolve_from_project_dir(mapper: ProductMapper) -> None:
    with patch("app.core.product_mapper._git_root_name") as mock_git:
        mock_git.return_value = "recepthor-scraper"
        result = mapper.resolve(project_dir="/home/user/dev/tesseron/recepthor-scraper")
    assert result is not None
    assert result.floor_id == "recepthor"
    assert result.room_id == "recepthor-scraper"


def test_resolve_from_working_dir(mapper: ProductMapper) -> None:
    with patch("app.core.product_mapper._git_root_name") as mock_git:
        mock_git.return_value = "lexio"
        result = mapper.resolve(working_dir="/home/user/dev/tesseron/lexio/src/api")
    assert result is not None
    assert result.floor_id == "lexio"
    assert result.room_id == "lexio"


def test_resolve_unknown_repo(mapper: ProductMapper) -> None:
    with patch("app.core.product_mapper._git_root_name") as mock_git:
        mock_git.return_value = "unknown-repo"
        result = mapper.resolve(project_dir="/home/user/dev/unknown-repo")
    assert result is None


def test_resolve_no_context(mapper: ProductMapper) -> None:
    result = mapper.resolve()
    assert result is None


def test_resolve_project_name_takes_priority(mapper: ProductMapper) -> None:
    """project_name is tried first, before project_dir."""
    result = mapper.resolve(
        project_name="lexio",
        project_dir="/home/user/dev/tesseron/recepthor-api",
    )
    assert result is not None
    assert result.room_id == "lexio"


def test_resolve_dir_basename_fallback(mapper: ProductMapper) -> None:
    """If git root lookup fails, fall back to directory basename."""
    with patch("app.core.product_mapper._git_root_name") as mock_git:
        mock_git.return_value = None
        result = mapper.resolve(project_dir="/home/user/dev/tesseron/entreperros")
    assert result is not None
    assert result.floor_id == "entreperros"
    assert result.room_id == "entreperros"


def test_room_assignment_dataclass() -> None:
    ra = RoomAssignment(floor_id="recepthor", room_id="recepthor-api")
    assert ra.floor_id == "recepthor"
    assert ra.room_id == "recepthor-api"
