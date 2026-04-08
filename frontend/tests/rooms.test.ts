import { describe, expect, it } from "vitest";
import {
  getRoomGridSize,
  getMultiRoomCanvasSize,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  ROOM_GAP,
  ROOM_GRID_COLS,
  ROOM_SCALE,
  SCALED_ROOM_W,
  SCALED_ROOM_H,
} from "../src/constants/rooms";

describe("getRoomGridSize", () => {
  it("returns 1 col 1 row for 1 room", () => {
    const size = getRoomGridSize(1);
    expect(size.cols).toBe(1);
    expect(size.rows).toBe(1);
    expect(size.width).toBe(ROOM_WIDTH);
    expect(size.height).toBe(ROOM_HEIGHT);
  });

  it("returns 2 cols 1 row for 2 rooms", () => {
    const size = getRoomGridSize(2);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(1);
    expect(size.width).toBe(2 * ROOM_WIDTH + ROOM_GAP);
    expect(size.height).toBe(ROOM_HEIGHT);
  });

  it("returns 2 cols 2 rows for 3 rooms", () => {
    const size = getRoomGridSize(3);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(2);
  });

  it("returns 2 cols 2 rows for 4 rooms", () => {
    const size = getRoomGridSize(4);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(2);
    expect(size.width).toBe(2 * ROOM_WIDTH + ROOM_GAP);
    expect(size.height).toBe(2 * ROOM_HEIGHT + ROOM_GAP);
  });

  it("returns 2 cols 3 rows for 6 rooms", () => {
    const size = getRoomGridSize(6);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(3);
  });

  it("never exceeds ROOM_GRID_COLS columns", () => {
    for (let n = 1; n <= 10; n++) {
      const size = getRoomGridSize(n);
      expect(size.cols).toBeLessThanOrEqual(ROOM_GRID_COLS);
    }
  });
});

describe("getMultiRoomCanvasSize", () => {
  it("returns correct canvas size for 1 project", () => {
    const size = getMultiRoomCanvasSize(1);
    expect(size.cols).toBe(1);
    expect(size.rows).toBe(1);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });

  it("returns wider canvas for 2 projects (2 cols)", () => {
    const size1 = getMultiRoomCanvasSize(1);
    const size2 = getMultiRoomCanvasSize(2);
    expect(size2.width).toBeGreaterThan(size1.width);
    expect(size2.height).toBe(size1.height); // same row
  });

  it("returns taller canvas for 3 projects (2 rows)", () => {
    const size2 = getMultiRoomCanvasSize(2);
    const size3 = getMultiRoomCanvasSize(3);
    expect(size3.height).toBeGreaterThan(size2.height);
  });

  it("ROOM_SCALE is 0.5", () => {
    expect(ROOM_SCALE).toBe(0.5);
  });

  it("SCALED_ROOM dimensions are half of ROOM dimensions", () => {
    expect(SCALED_ROOM_W).toBe(ROOM_WIDTH * ROOM_SCALE);
    expect(SCALED_ROOM_H).toBe(ROOM_HEIGHT * ROOM_SCALE);
  });
});
