"use client";

import { type ReactNode, useMemo, useCallback } from "react";
import { Graphics, Texture } from "pixi.js";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";
import { TOP_WALL_H } from "./layout";

// Mirrors the office theme (components/game/OfficeBackground.tsx).
const FLOOR_COLOR = 0x2a2a2a;
const WALL_COLOR = 0x3d3d3d;
const WALL_TRIM_COLOR = 0x4a4a4a;
const WALL_TRIM_H = 10;
const FLOOR_TILE_SIZE = 100;

const TILE_TINT_LIGHT = 0xffffff;
const TILE_TINT_DARK = 0xd8d8d8;

interface TileData {
  x: number;
  y: number;
  rotation: number;
  tint: number;
}

interface CommandCenterBackgroundProps {
  floorTileTexture?: Texture | null;
}

/**
 * Office-matched backdrop: a decorated top wall over a checkerboard tiled floor,
 * using the same palette and tile texture as the main office.
 */
export function CommandCenterBackground({
  floorTileTexture,
}: CommandCenterBackgroundProps): ReactNode {
  const tiles = useMemo(() => {
    const result: TileData[] = [];
    for (let y = TOP_WALL_H; y < CANVAS_HEIGHT; y += FLOOR_TILE_SIZE) {
      const rowIndex = Math.floor((y - TOP_WALL_H) / FLOOR_TILE_SIZE);
      for (let x = 0; x < CANVAS_WIDTH; x += FLOOR_TILE_SIZE) {
        const colIndex = Math.floor(x / FLOOR_TILE_SIZE);
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

  const drawWallsAndFloor = useCallback((g: Graphics) => {
    g.clear();
    // Floor base (fallback behind tiles).
    g.rect(0, TOP_WALL_H, CANVAS_WIDTH, CANVAS_HEIGHT - TOP_WALL_H);
    g.fill(FLOOR_COLOR);
    // Top wall.
    g.rect(0, 0, CANVAS_WIDTH, TOP_WALL_H);
    g.fill(WALL_COLOR);
    // Wall base trim.
    g.rect(0, TOP_WALL_H - WALL_TRIM_H, CANVAS_WIDTH, WALL_TRIM_H);
    g.fill(WALL_TRIM_COLOR);
  }, []);

  return (
    <>
      <pixiGraphics draw={drawWallsAndFloor} />
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
