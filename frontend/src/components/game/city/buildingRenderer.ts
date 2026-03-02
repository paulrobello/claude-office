/**
 * Building Renderer
 *
 * Draws city building silhouettes and their window lights into a PixiJS
 * Graphics object.  All functions are pure — no React state.
 */

import type { Graphics } from "pixi.js";
import type { TimeState } from "./timeUtils";
import { lerpColor } from "./skyRenderer";
import { mixHash } from "./timeUtils";

// ============================================================================
// TYPES
// ============================================================================

export interface Building {
  x: number;
  width: number;
  height: number;
  windowRows: number;
  windowCols: number;
}

// ============================================================================
// COLOR TABLES
// ============================================================================

/** Building silhouette color per time phase. */
export const BUILDING_COLORS: Record<TimeState["phase"], number> = {
  night: 0x0d0d1a,
  dawn: 0x1a1a2a,
  day: 0x2a2a3a,
  dusk: 0x1a1a2a,
};

/** Probability that a window is lit (0–1) per time phase. */
export const WINDOW_LIT_CHANCES: Record<TimeState["phase"], number> = {
  night: 0.35,
  dawn: 0.2,
  day: 0.05,
  dusk: 0.3,
};

// ============================================================================
// INTERPOLATION HELPERS
// ============================================================================

/**
 * Return the interpolated building silhouette color for the current time.
 */
export function getInterpolatedBuildingColor(
  phase: TimeState["phase"],
  progress: number,
): number {
  switch (phase) {
    case "night":
      return BUILDING_COLORS.night;
    case "dawn":
      return lerpColor(BUILDING_COLORS.night, BUILDING_COLORS.day, progress);
    case "day":
      return BUILDING_COLORS.day;
    case "dusk":
      return lerpColor(BUILDING_COLORS.day, BUILDING_COLORS.night, progress);
  }
}

/**
 * Return the interpolated probability that a window is lit.
 */
export function getInterpolatedWindowLitChance(
  phase: TimeState["phase"],
  progress: number,
): number {
  switch (phase) {
    case "night":
      return WINDOW_LIT_CHANCES.night;
    case "dawn":
      return (
        WINDOW_LIT_CHANCES.night +
        (WINDOW_LIT_CHANCES.day - WINDOW_LIT_CHANCES.night) * progress
      );
    case "day":
      return WINDOW_LIT_CHANCES.day;
    case "dusk":
      return (
        WINDOW_LIT_CHANCES.day +
        (WINDOW_LIT_CHANCES.night - WINDOW_LIT_CHANCES.day) * progress
      );
  }
}

// ============================================================================
// DRAW
// ============================================================================

const WINDOW_WIDTH = 4;
const WINDOW_HEIGHT = 5;

/**
 * Draw all buildings and their windows.
 *
 * @param g            - PixiJS Graphics context to draw into
 * @param buildings    - Building layout definitions
 * @param timeState    - Current time phase and transition progress
 * @param skyY         - Top of the sky area (used to anchor buildings to horizon)
 * @param innerHeight  - Height of the inner window area
 * @param frameThickness - Thickness of the window frame
 * @param citySeed     - Seed for deterministic per-window lighting
 * @param toggledWindows - Set of keys ("buildingIdx-row-col") whose state is flipped
 */
export function drawBuildings(
  g: Graphics,
  buildings: Building[],
  timeState: TimeState,
  skyX: number,
  skyY: number,
  innerHeight: number,
  frameThickness: number,
  citySeed: number,
  toggledWindows: Set<string>,
): void {
  const { phase, progress } = timeState;
  const buildingColor = getInterpolatedBuildingColor(phase, progress);
  const windowLitChance = getInterpolatedWindowLitChance(phase, progress);
  const buildingBaseY = skyY + innerHeight + frameThickness;

  for (let buildingIdx = 0; buildingIdx < buildings.length; buildingIdx++) {
    const building = buildings[buildingIdx];
    const bx = skyX + building.x;
    const by = buildingBaseY - building.height;

    // Silhouette
    g.rect(bx, by, building.width, building.height);
    g.fill(buildingColor);

    // Windows
    const windowSpacingX = Math.floor(
      (building.width - 4) / building.windowCols,
    );
    const windowSpacingY = Math.floor(
      (building.height - 8) / building.windowRows,
    );

    for (let row = 0; row < building.windowRows; row++) {
      for (let col = 0; col < building.windowCols; col++) {
        const wx =
          bx + 2 + col * windowSpacingX + (windowSpacingX - WINDOW_WIDTH) / 2;
        const wy = by + 4 + row * windowSpacingY;

        // Pseudo-random base state
        const seed = mixHash(citySeed, buildingIdx, row, col);
        let isLit = seed < windowLitChance * 100;

        // Apply user toggles
        const toggleKey = `${buildingIdx}-${row}-${col}`;
        if (toggledWindows.has(toggleKey)) {
          isLit = !isLit;
        }

        g.rect(wx, wy, WINDOW_WIDTH, WINDOW_HEIGHT);
        g.fill(isLit ? 0xffdd44 : 0x1a1a2a);
      }
    }
  }
}

// ============================================================================
// DEFAULT BUILDING LAYOUT
// ============================================================================

/**
 * The default set of city buildings shown in the office window.
 * Coordinates are relative to the window interior.
 */
export const DEFAULT_BUILDINGS: Building[] = [
  { x: 5, width: 28, height: 80, windowRows: 8, windowCols: 3 },
  { x: 38, width: 35, height: 110, windowRows: 11, windowCols: 4 },
  { x: 78, width: 25, height: 65, windowRows: 6, windowCols: 3 },
  { x: 108, width: 40, height: 95, windowRows: 9, windowCols: 5 },
  { x: 153, width: 30, height: 75, windowRows: 7, windowCols: 3 },
];

/**
 * Window counts per building — mirrors DEFAULT_BUILDINGS for use in
 * the random window-toggle scheduler.
 */
export const BUILDING_WINDOW_COUNTS: { rows: number; cols: number }[] =
  DEFAULT_BUILDINGS.map((b) => ({ rows: b.windowRows, cols: b.windowCols }));
