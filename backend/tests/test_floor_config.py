"""Tests for floor configuration loading."""

from app.core.floor_config import BuildingConfig, FloorConfig, RoomConfig


def test_floor_config_creates_rooms_from_repo_names():
    """FloorConfig can be constructed with rooms derived from repo names."""
    rooms = [
        RoomConfig(id="test-api", repo_name="test-api"),
        RoomConfig(id="test-web", repo_name="test-web"),
    ]
    floor = FloorConfig(
        id="testproduct",
        name="TestProduct",
        floor_number=2,
        accent="#ff0000",
        icon="🔴",
        rooms=rooms,
    )
    assert floor.name == "TestProduct"
    assert floor.floor_number == 2
    assert floor.accent == "#ff0000"
    assert floor.icon == "🔴"
    assert floor.rooms == [
        RoomConfig(id="test-api", repo_name="test-api"),
        RoomConfig(id="test-web", repo_name="test-web"),
    ]


def test_floor_config_id_from_name():
    """FloorConfig id field holds the slug-style identifier."""
    floor = FloorConfig(id="testproduct", name="TestProduct", floor_number=2)
    assert floor.id == "testproduct"


def test_building_config_with_multiple_floors():
    """BuildingConfig stores floors and sorts/presents them."""
    config = BuildingConfig(
        floors=[
            FloorConfig(id="testproduct", name="TestProduct", floor_number=2),
            FloorConfig(id="other", name="Other", floor_number=1),
        ]
    )
    assert len(config.floors) == 2
    assert config.floors[0].floor_number == 2
    assert config.floors[1].floor_number == 1


def test_building_config_defaults_empty():
    """BuildingConfig with no arguments gives an empty config."""
    config = BuildingConfig()
    assert len(config.floors) == 0


def test_building_config_default_building_name():
    config = BuildingConfig()
    assert config.building_name == "Office"


def test_get_floor_by_id():
    config = BuildingConfig(
        floors=[
            FloorConfig(id="testproduct", name="TestProduct", floor_number=2),
        ]
    )
    floor = config.get_floor("testproduct")
    assert floor is not None
    assert floor.name == "TestProduct"


def test_get_floor_by_id_not_found():
    config = BuildingConfig()
    assert config.get_floor("nonexistent") is None


def test_find_room():
    config = BuildingConfig(
        floors=[
            FloorConfig(
                id="testproduct",
                name="TestProduct",
                floor_number=2,
                rooms=[
                    RoomConfig(id="test-api", repo_name="test-api"),
                    RoomConfig(id="test-web", repo_name="test-web"),
                ],
            ),
        ]
    )
    result = config.find_room("test-api")
    assert result is not None
    floor, room = result
    assert floor.name == "TestProduct"
    assert room.repo_name == "test-api"


def test_find_room_not_found():
    config = BuildingConfig()
    assert config.find_room("unknown-repo") is None
