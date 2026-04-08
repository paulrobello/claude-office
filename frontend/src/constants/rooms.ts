/** Standard room dimensions (scaled-down office) */
export const ROOM_WIDTH = 640;
export const ROOM_HEIGHT = 512;

/** Gap between rooms in grid */
export const ROOM_GAP = 16;

/** Max columns in overview grid */
export const ROOM_GRID_COLS = 2;

/** Thumbnail size in overview mode */
export const THUMBNAIL_WIDTH = 300;
export const THUMBNAIL_HEIGHT = 200;

/** Room furniture positions (scaled from full office positions) */
export const ROOM_POSITIONS = {
  clock: { x: 48, y: 24 },
  whiteboard: { x: 200, y: 24 },
  safetySign: { x: 400, y: 24 },
  employeeOfMonth: { x: 120, y: 24 },
  cityWindow: { x: 520, y: 40 },
  waterCooler: { x: 40, y: 400 },
  bossDesk: { x: 280, y: 380 },
  deskGridOrigin: { x: 80, y: 140 },
  elevator: { x: 560, y: 200 },
} as const;

/** Scale factor for rooms in overview mode */
export const ROOM_SCALE = 0.5;

/** Scaled room dimensions */
export const SCALED_ROOM_W = ROOM_WIDTH * ROOM_SCALE; // 320
export const SCALED_ROOM_H = ROOM_HEIGHT * ROOM_SCALE; // 256

/** Calculate grid dimensions for N rooms */
export function getRoomGridSize(roomCount: number) {
  const cols = Math.min(roomCount, ROOM_GRID_COLS);
  const rows = Math.ceil(roomCount / ROOM_GRID_COLS);
  return {
    cols,
    rows,
    width: cols * ROOM_WIDTH + (cols - 1) * ROOM_GAP,
    height: rows * ROOM_HEIGHT + (rows - 1) * ROOM_GAP,
  };
}

/** Room label height (rendered above each room) */
export const ROOM_LABEL_HEIGHT = 24;

/**
 * Calculate total canvas size needed for N rooms in PixiJS overview mode.
 * Uses the full office dimensions (CANVAS_WIDTH=1280, CANVAS_HEIGHT=1024)
 * scaled by ROOM_SCALE, plus gaps and label space.
 */
/** Label height inside the scaled container (full-scale pixels). */
const LABEL_H_FULL = 50;

export function getMultiRoomCanvasSize(
  projectCount: number,
  fullRoomHeight: number = 1066, // getCanvasHeight(8)
  fullRoomWidth: number = 1280,
) {
  const cols = Math.min(projectCount, ROOM_GRID_COLS);
  const rows = Math.ceil(projectCount / ROOM_GRID_COLS);
  // Each cell = (room + label) * scale
  const cellW = fullRoomWidth * ROOM_SCALE;
  const cellH = (fullRoomHeight + LABEL_H_FULL) * ROOM_SCALE;
  return {
    cols,
    rows,
    width: ROOM_GAP + cols * (cellW + ROOM_GAP),
    height: ROOM_GAP + rows * (cellH + ROOM_GAP),
  };
}
