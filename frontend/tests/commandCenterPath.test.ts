import { describe, expect, it } from "vitest";
import { getCommandCenterGrid } from "@/systems/commandCenterGrid";
import { ZONES, slotPosition, MAX_SLOTS } from "@/components/command/layout";
import { findWorldPath } from "@/systems/astar";
import { smoothPath } from "@/systems/pathSmoothing";
import type { Position } from "@/types";
import type { PathGrid } from "@/systems/navigationGrid";

/**
 * Densely sample every segment of a path and count points that land on a
 * blocked tile of `grid`, excluding the start/end tiles.
 *
 * A Command Center slot's standing spot is intentionally one tile above its
 * desk footprint, and many lower slot centres sit on the (blocked) footprint
 * tile itself. A* therefore snaps such endpoints to the nearest walkable tile,
 * but the motion code pins the rendered endpoint back to the exact slot. We
 * exempt the endpoints' own tiles so the assertion targets what actually
 * matters: the path must not cut through *other* furniture en route.
 */
function blockedSamples(
  path: Position[],
  grid: PathGrid,
  from: Position,
  to: Position,
): number {
  const fg = grid.worldToGrid(from.x, from.y);
  const tg = grid.worldToGrid(to.x, to.y);
  const exempt = new Set([`${fg.gx},${fg.gy}`, `${tg.gx},${tg.gy}`]);

  let blocked = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist / 4)); // ~4px resolution
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const gp = grid.worldToGrid(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      if (!grid.isWalkable(gp.gx, gp.gy) && !exempt.has(`${gp.gx},${gp.gy}`))
        blocked++;
    }
  }
  return blocked;
}

/** Build a CC path the way commandCenterMotion.computePath does. */
function ccPath(from: Position, to: Position): Position[] {
  const grid = getCommandCenterGrid();
  const raw = findWorldPath(from, to, "test-agent", grid);
  const sm = smoothPath(raw, grid);
  if (sm.length >= 2) {
    sm[0] = { ...from };
    sm[sm.length - 1] = { ...to };
  }
  return sm;
}

describe("Command Center pathfinding", () => {
  it("smoothed path never cuts through Command Center furniture", () => {
    const grid = getCommandCenterGrid();

    // In every desk/lounge column, walk top slot -> bottom slot of the same
    // sub-column. A straight line between them runs through the desk footprints,
    // so the route MUST weave around them.
    for (const zone of ZONES) {
      if (zone.kind === "exit") continue;
      const from = slotPosition(zone, 0);
      const to = slotPosition(zone, MAX_SLOTS - 2); // same sub-column, last row

      const raw = findWorldPath(from, to, "test-agent", grid);
      expect(raw.length).toBeGreaterThanOrEqual(2);

      const sm = ccPath(from, to);
      // The smoothed route is non-trivial...
      expect(sm.length).toBeGreaterThanOrEqual(2);
      // ...and crosses no Command Center furniture other than its endpoints.
      expect(blockedSamples(sm, grid, from, to)).toBe(0);
      // Guard: the equivalent straight line WOULD cut through furniture, so the
      // assertion above is meaningful (the path really had to route around).
      expect(blockedSamples([from, to], grid, from, to)).toBeGreaterThan(0);
    }
  });

  it("smoothing validates against the Command Center grid, not the office grid", () => {
    // Regression for the cut-corner bug: smoothPath used to validate skipped
    // waypoints against the OFFICE navigation grid, letting the funnel shortcut
    // through Command Center furniture (tiles walkable in the office but blocked
    // here). Smoothing with the CC grid must keep the path clear.
    const grid = getCommandCenterGrid();
    const from: Position = { x: 16, y: 176 };
    const to: Position = { x: 80, y: 368 };
    const raw = findWorldPath(from, to, "test-agent", grid);
    expect(raw.length).toBeGreaterThanOrEqual(3);

    // Buggy behaviour: default grid arg == office grid.
    const buggy = smoothPath(raw);
    buggy[0] = { ...from };
    buggy[buggy.length - 1] = { ...to };
    expect(blockedSamples(buggy, grid, from, to)).toBeGreaterThan(0);

    // Fixed behaviour: smoothing against the CC grid keeps it clear.
    const fixed = smoothPath(raw, grid);
    fixed[0] = { ...from };
    fixed[fixed.length - 1] = { ...to };
    expect(blockedSamples(fixed, grid, from, to)).toBe(0);
  });
});
