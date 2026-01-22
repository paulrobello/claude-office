/**
 * OfficeBackground Component
 *
 * Renders the office floor, walls, and tile pattern using sprites.
 */

import { type ReactNode, useMemo, useCallback } from "react";
import { Graphics, Texture } from "pixi.js";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";

// ============================================================================
// CONSTANTS
// ============================================================================

// Floor/wall dimensions
const WALL_HEIGHT = 250;
const WALL_TRIM_HEIGHT = 10;
const FLOOR_TILE_SIZE = 100;

// Colors
const FLOOR_COLOR = 0x2a2a2a;
const WALL_COLOR = 0x3d3d3d;
const WALL_TRIM_COLOR = 0x4a4a4a;

// ============================================================================
// TYPES
// ============================================================================

interface OfficeBackgroundProps {
  floorTileTexture?: Texture | null;
}

interface TileData {
  x: number;
  y: number;
  rotation: number;
  tint: number;
}

// Tint colors for checkerboard effect
const TILE_TINT_LIGHT = 0xffffff; // No tint
const TILE_TINT_DARK = 0xd8d8d8; // Slightly darker

// ============================================================================
// DRAWING FUNCTION
// ============================================================================

/**
 * Draws the office walls (no floor - that's handled by sprites).
 */
function drawWalls(g: Graphics): void {
  g.clear();

  // Main floor background (fallback color behind tiles)
  g.rect(0, WALL_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT - WALL_HEIGHT);
  g.fill(FLOOR_COLOR);

  // Wall
  g.rect(0, 0, CANVAS_WIDTH, WALL_HEIGHT);
  g.fill(WALL_COLOR);

  // Wall base trim
  g.rect(0, WALL_HEIGHT - WALL_TRIM_HEIGHT, CANVAS_WIDTH, WALL_TRIM_HEIGHT);
  g.fill(WALL_TRIM_COLOR);
}

// ============================================================================
// COMPONENT
// ============================================================================

export function OfficeBackground({
  floorTileTexture,
}: OfficeBackgroundProps): ReactNode {
  // Generate tile positions with alternating rotations and tints
  const tiles = useMemo(() => {
    const result: TileData[] = [];
    const startY = WALL_HEIGHT;

    for (let y = startY; y < CANVAS_HEIGHT; y += FLOOR_TILE_SIZE) {
      const rowIndex = Math.floor((y - startY) / FLOOR_TILE_SIZE);
      for (let x = 0; x < CANVAS_WIDTH; x += FLOOR_TILE_SIZE) {
        const colIndex = Math.floor(x / FLOOR_TILE_SIZE);
        // Checkerboard pattern: alternate rotation based on row + column
        const isAlternate = (rowIndex + colIndex) % 2 === 1;
        result.push({
          x: x + FLOOR_TILE_SIZE / 2,
          y: y + FLOOR_TILE_SIZE / 2,
          rotation: isAlternate ? Math.PI / 2 : 0,
          tint: isAlternate ? TILE_TINT_DARK : TILE_TINT_LIGHT,
        });
      }
    }
    return result;
  }, []);

  // Stable reference for wall drawing
  const drawWallsCallback = useCallback((g: Graphics) => drawWalls(g), []);

  return (
    <>
      {/* Walls and floor background */}
      <pixiGraphics draw={drawWallsCallback} />

      {/* Floor tiles with alternating rotations and tints */}
      {floorTileTexture &&
        tiles.map((tile, index) => (
          <pixiSprite
            key={index}
            texture={floorTileTexture}
            x={tile.x}
            y={tile.y}
            anchor={0.5}
            rotation={tile.rotation}
            tint={tile.tint}
          />
        ))}
    </>
  );
}
