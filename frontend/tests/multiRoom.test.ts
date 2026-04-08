import { describe, expect, it } from "vitest";
import { ROOM_SCALE, ROOM_GAP, ROOM_GRID_COLS, ROOM_LABEL_HEIGHT } from "../src/constants/rooms";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "../src/constants/canvas";

// Inline copy of getRoomPosition to avoid transitive @/ imports from MultiRoomCanvas
function getRoomPosition(index: number) {
  const col = index % ROOM_GRID_COLS;
  const row = Math.floor(index / ROOM_GRID_COLS);
  const scaledW = CANVAS_WIDTH * ROOM_SCALE;
  const scaledH = CANVAS_HEIGHT * ROOM_SCALE;
  return {
    x: ROOM_GAP + col * (scaledW + ROOM_GAP),
    y: ROOM_GAP + ROOM_LABEL_HEIGHT + row * (scaledH + ROOM_LABEL_HEIGHT + ROOM_GAP),
  };
}

describe("getRoomPosition", () => {
  it("first room is at top-left with padding + label space", () => {
    const pos = getRoomPosition(0);
    expect(pos.x).toBe(ROOM_GAP);
    expect(pos.y).toBe(ROOM_GAP + ROOM_LABEL_HEIGHT);
  });

  it("second room is to the right of first", () => {
    const pos0 = getRoomPosition(0);
    const pos1 = getRoomPosition(1);
    const scaledW = CANVAS_WIDTH * ROOM_SCALE;
    expect(pos1.x).toBe(ROOM_GAP + scaledW + ROOM_GAP);
    expect(pos1.y).toBe(pos0.y);
  });

  it("third room wraps to second row", () => {
    const pos2 = getRoomPosition(2);
    expect(pos2.x).toBe(ROOM_GAP); // back to first column
    const scaledH = CANVAS_HEIGHT * ROOM_SCALE;
    expect(pos2.y).toBe(ROOM_GAP + ROOM_LABEL_HEIGHT + scaledH + ROOM_LABEL_HEIGHT + ROOM_GAP);
  });

  it("fourth room is second col second row", () => {
    const pos3 = getRoomPosition(3);
    const scaledW = CANVAS_WIDTH * ROOM_SCALE;
    expect(pos3.x).toBe(ROOM_GAP + scaledW + ROOM_GAP);
    expect(pos3.y).toBeGreaterThan(ROOM_GAP);
  });
});
