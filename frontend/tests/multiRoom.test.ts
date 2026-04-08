import { describe, expect, it } from "vitest";
import { ROOM_SCALE, ROOM_GAP, ROOM_GRID_COLS } from "../src/constants/rooms";
import { CANVAS_WIDTH, getCanvasHeight } from "../src/constants/canvas";

const FULL_ROOM_H = getCanvasHeight(8); // 1066
const LABEL_H = 50; // label height inside scaled container

// Matches getRoomPosition in MultiRoomCanvas.tsx
function getRoomPosition(index: number) {
  const col = index % ROOM_GRID_COLS;
  const row = Math.floor(index / ROOM_GRID_COLS);
  const cellW = CANVAS_WIDTH * ROOM_SCALE;
  const cellH = (FULL_ROOM_H + LABEL_H) * ROOM_SCALE;
  return {
    x: ROOM_GAP + col * (cellW + ROOM_GAP),
    y: ROOM_GAP + row * (cellH + ROOM_GAP),
  };
}

describe("getRoomPosition", () => {
  it("first room is at top-left with gap padding", () => {
    const pos = getRoomPosition(0);
    expect(pos.x).toBe(ROOM_GAP);
    expect(pos.y).toBe(ROOM_GAP);
  });

  it("second room is to the right of first", () => {
    const pos0 = getRoomPosition(0);
    const pos1 = getRoomPosition(1);
    const cellW = CANVAS_WIDTH * ROOM_SCALE;
    expect(pos1.x).toBe(ROOM_GAP + cellW + ROOM_GAP);
    expect(pos1.y).toBe(pos0.y);
  });

  it("third room wraps to second row", () => {
    const pos2 = getRoomPosition(2);
    expect(pos2.x).toBe(ROOM_GAP);
    const cellH = (FULL_ROOM_H + LABEL_H) * ROOM_SCALE;
    expect(pos2.y).toBe(ROOM_GAP + cellH + ROOM_GAP);
  });

  it("fourth room is second col second row", () => {
    const pos2 = getRoomPosition(2);
    const pos3 = getRoomPosition(3);
    expect(pos3.x).toBeGreaterThan(pos2.x);
    expect(pos3.y).toBe(pos2.y);
  });
});
