/**
 * Navigation grid for the Command Center floor.
 *
 * Marks the STATIC furniture (desks, lounge couches, the exit elevator, and the
 * top wall) as obstacles so walking agents path AROUND them via the shared A*
 * (astar.ts). Each agent's slot centre is left walkable (the agent stands just
 * above its desk), and lanes between desk rows/columns stay open.
 */

import type { Position } from "@/types";
import type { GridPosition, PathGrid } from "./navigationGrid";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";
import {
  ZONES,
  MAX_SLOTS,
  TOP_WALL_H,
  slotPosition,
} from "@/components/command/layout";

const TILE = 32;
const W = Math.ceil(CANVAS_WIDTH / TILE); // 40
const H = Math.ceil(CANVAS_HEIGHT / TILE); // 32

class CommandCenterGrid implements PathGrid {
  private blocked: Uint8Array;

  constructor() {
    this.blocked = new Uint8Array(W * H);
    this.build();
  }

  private idx(gx: number, gy: number): number {
    return gy * W + gx;
  }
  private valid(gx: number, gy: number): boolean {
    return gx >= 0 && gx < W && gy >= 0 && gy < H;
  }
  private mark(x1: number, y1: number, x2: number, y2: number): void {
    const sgx = Math.floor(x1 / TILE);
    const egx = Math.ceil(x2 / TILE);
    const sgy = Math.floor(y1 / TILE);
    const egy = Math.ceil(y2 / TILE);
    for (let gx = sgx; gx < egx; gx++)
      for (let gy = sgy; gy < egy; gy++)
        if (this.valid(gx, gy)) this.blocked[this.idx(gx, gy)] = 1;
  }

  private build(): void {
    // Top wall (posters, board, clock) — agents stay on the floor below it.
    this.mark(0, 0, CANVAS_WIDTH, TOP_WALL_H);

    for (const zone of ZONES) {
      if (zone.kind === "exit") {
        // Elevator doorway (matches CommandCenterFurniture ExitDoor baseY).
        const cx = zone.x + zone.w / 2;
        const baseY = zone.y + 150;
        this.mark(cx - 58, baseY - 130, cx + 58, baseY);
        continue;
      }
      // A furniture footprint just below each slot's standing spot.
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        const p = slotPosition(zone, slot);
        const halfW = zone.kind === "lounge" ? 50 : 46;
        this.mark(p.x - halfW, p.y + 8, p.x + halfW, p.y + 40);
      }
    }
  }

  worldToGrid(x: number, y: number): GridPosition {
    return { gx: Math.floor(x / TILE), gy: Math.floor(y / TILE) };
  }
  gridToWorld(gx: number, gy: number): Position {
    return { x: gx * TILE + TILE / 2, y: gy * TILE + TILE / 2 };
  }
  isWalkable(gx: number, gy: number, _ignoreAgentId?: string): boolean {
    if (!this.valid(gx, gy)) return false;
    return this.blocked[this.idx(gx, gy)] === 0;
  }
  getCost(_gx?: number, _gy?: number, _ignoreAgentId?: string): number {
    return 1;
  }
  getNeighbors(gx: number, gy: number): GridPosition[] {
    const neighbors: GridPosition[] = [];
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: 1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: -1 },
    ];
    for (const { dx, dy } of dirs) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (!this.valid(nx, ny)) continue;
      // Prevent diagonal corner cutting.
      if (dx !== 0 && dy !== 0) {
        if (!this.isWalkable(gx + dx, gy) || !this.isWalkable(gx, gy + dy))
          continue;
      }
      neighbors.push({ gx: nx, gy: ny });
    }
    return neighbors;
  }
}

let instance: CommandCenterGrid | null = null;

export function getCommandCenterGrid(): CommandCenterGrid {
  if (!instance) instance = new CommandCenterGrid();
  return instance;
}
