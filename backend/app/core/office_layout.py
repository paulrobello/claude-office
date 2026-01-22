"""Office layout constants and utilities.

Defines canvas dimensions, desk positions, and vertical zones for the office.
"""

from enum import StrEnum


class Zone(StrEnum):
    """Vertical zones in the office layout."""

    ABOVE_DESKS = "above_desks"  # y < 300 (elevator area)
    DESK_ROW_0 = "desk_row_0"  # 300 <= y < 440 (row 0 desks at y=360)
    BETWEEN_ROWS = "between_rows"  # 440 <= y < 500
    DESK_ROW_1 = "desk_row_1"  # 500 <= y < 640 (row 1 desks at y=560)
    BELOW_DESKS = "below_desks"  # 640 <= y < 750
    BOSS_AREA = "boss_area"  # 750 <= y < 860
    QUEUE = "queue"  # y >= 860


# Office canvas dimensions
CANVAS_WIDTH = 1280
CANVAS_HEIGHT = 1024

# Grid configuration (32x32 pixel tiles)
TILE_SIZE = 32
GRID_WIDTH = CANVAS_WIDTH // TILE_SIZE  # 40
GRID_HEIGHT = CANVAS_HEIGHT // TILE_SIZE  # 32

# Desk layout constants
DESK_ROW_SIZE = 4
DESK_X_START = 265
DESK_X_SPACING = 250
DESK_Y_ROW_0 = 360  # Agent position Y for row 0
DESK_Y_ROW_1 = 560  # Agent position Y for row 1
DESK_WIDTH = 140
DESK_HEIGHT = 80


def get_desk_x(desk_num: int) -> int:
    """Get the X coordinate for a desk number (1-indexed)."""
    col = (desk_num - 1) % DESK_ROW_SIZE
    return DESK_X_START + (col * DESK_X_SPACING)


def get_desk_row(desk_num: int) -> int:
    """Get the row number (0 or 1) for a desk number."""
    return (desk_num - 1) // DESK_ROW_SIZE


def get_zone(y: int) -> Zone:
    """Determine which vertical zone a y-coordinate falls into."""
    if y < 300:
        return Zone.ABOVE_DESKS
    if y < 440:
        return Zone.DESK_ROW_0
    if y < 500:
        return Zone.BETWEEN_ROWS
    if y < 640:
        return Zone.DESK_ROW_1
    if y < 750:
        return Zone.BELOW_DESKS
    if y < 860:
        return Zone.BOSS_AREA
    return Zone.QUEUE
