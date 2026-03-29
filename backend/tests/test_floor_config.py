"""Tests for floor configuration loading."""

from pathlib import Path

import pytest

from app.core.floor_config import FloorConfig, RoomConfig, BuildingConfig, load_building_config


SAMPLE_TOML = """
[[floors]]
name = "TestProduct"
floor_number = 2
accent = "#ff0000"
icon = "🔴"
repos = ["test-api", "test-web"]

[[floors]]
name = "Other"
floor_number = 1
accent = "#00ff00"
icon = "🟢"
repos = ["other-service"]
"""


def test_load_building_config_from_string():
    config = load_building_config(toml_string=SAMPLE_TOML)
    assert len(config.floors) == 2
    assert config.floors[0].name == "TestProduct"
    assert config.floors[0].floor_number == 2
    assert config.floors[0].accent == "#ff0000"
    assert config.floors[0].icon == "🔴"
    assert config.floors[0].rooms == [
        RoomConfig(id="test-api", repo_name="test-api"),
        RoomConfig(id="test-web", repo_name="test-web"),
    ]


def test_floor_config_generates_id_from_name():
    config = load_building_config(toml_string=SAMPLE_TOML)
    assert config.floors[0].id == "testproduct"
    assert config.floors[1].id == "other"


def test_floors_sorted_by_floor_number_descending():
    config = load_building_config(toml_string=SAMPLE_TOML)
    assert config.floors[0].floor_number == 2
    assert config.floors[1].floor_number == 1


def test_load_building_config_from_file(tmp_path: Path):
    toml_file = tmp_path / "floors.toml"
    toml_file.write_text(SAMPLE_TOML)
    config = load_building_config(toml_path=toml_file)
    assert len(config.floors) == 2


def test_load_building_config_missing_file():
    config = load_building_config(toml_path=Path("/nonexistent/floors.toml"))
    assert len(config.floors) == 0


def test_get_floor_by_id():
    config = load_building_config(toml_string=SAMPLE_TOML)
    floor = config.get_floor("testproduct")
    assert floor is not None
    assert floor.name == "TestProduct"


def test_get_floor_by_id_not_found():
    config = load_building_config(toml_string=SAMPLE_TOML)
    assert config.get_floor("nonexistent") is None


def test_find_room():
    config = load_building_config(toml_string=SAMPLE_TOML)
    result = config.find_room("test-api")
    assert result is not None
    floor, room = result
    assert floor.name == "TestProduct"
    assert room.repo_name == "test-api"


def test_find_room_not_found():
    config = load_building_config(toml_string=SAMPLE_TOML)
    assert config.find_room("unknown-repo") is None
