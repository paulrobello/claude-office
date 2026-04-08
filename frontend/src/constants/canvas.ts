/**
 * Canvas and rendering constants for the office game.
 */

/** Width of the game canvas in pixels (slightly wider than 1280 to cover all furniture) */
export const CANVAS_WIDTH = 1300;

/** Default height of the game canvas in pixels */
export const CANVAS_HEIGHT = 1024;

/** Compute canvas height based on desk count to fit all rows.
 *  Layout: 4 desks per row, starting at y=432, 192px per row, boss area ~250px at bottom.
 */
export function getCanvasHeight(deskCount: number): number {
  const rows = Math.ceil(deskCount / 4);
  // DESK_Y_START(432) + rows * DESK_Y_STEP(192) + boss area(250)
  const needed = 432 + rows * 192 + 250;
  return Math.max(CANVAS_HEIGHT, needed);
}

/** Background color of the canvas (dark gray) */
export const BACKGROUND_COLOR = 0x1a1a1a;
