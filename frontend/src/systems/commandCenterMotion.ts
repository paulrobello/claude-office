"use client";

import { create } from "zustand";
import { useEffect } from "react";
import type { Position } from "@/types";
import { findWorldPath } from "./astar";
import { smoothPath } from "./pathSmoothing";
import { getCommandCenterGrid } from "./commandCenterGrid";
import { resetExit } from "./exitAnimation";
import { resetSlotAlloc } from "@/components/command/useCommandCenterPeers";

/**
 * Walks Command Center agents to their (fixed) slot positions, pathing AROUND
 * the static furniture via the shared A* on {@link getCommandCenterGrid}.
 * Furniture never moves — only the agent body travels. The RAF loop self-gates
 * (runs only while something is moving), and settled agents keep a stable
 * Position identity so memoised sprites don't re-render.
 */

const SPEED = 260; // px/s

interface MotionStore {
  positions: Map<string, Position>;
  _set: (positions: Map<string, Position>) => void;
}

export const useMotionStore = create<MotionStore>()((set) => ({
  positions: new Map(),
  _set: (positions) => set({ positions }),
}));

export const selectMotionPos =
  (id: string) =>
  (s: MotionStore): Position | undefined =>
    s.positions.get(id);

// ---- internal mover state (outside React) ----
interface PathState {
  waypoints: Position[];
  index: number;
}
const current = new Map<string, Position>();
const target = new Map<string, Position>();
const paths = new Map<string, PathState>();
let rafId: number | null = null;
let lastTime = 0;

function computePath(from: Position, to: Position, id: string): Position[] {
  const grid = getCommandCenterGrid();
  const raw = findWorldPath(from, to, id, grid);
  // No valid route: return empty so the caller snaps the peer to its slot
  // instead of animating a straight line through CC furniture.
  if (raw.length < 2) return [];
  const sm = smoothPath(raw, grid);
  if (sm.length >= 2) {
    sm[0] = { ...from };
    sm[sm.length - 1] = { ...to };
  }
  return sm;
}

function publish(): void {
  const prev = useMotionStore.getState().positions;
  const next = new Map<string, Position>();
  for (const [id, cur] of current) {
    const old = prev.get(id);
    if (old && old.x === cur.x && old.y === cur.y) next.set(id, old);
    else next.set(id, { x: cur.x, y: cur.y });
  }
  useMotionStore.getState()._set(next);
}

/** Advance one agent along its path. Returns true if it moved. */
function advance(id: string, dt: number): boolean {
  const path = paths.get(id);
  const cur = current.get(id);
  if (!path || !cur) return false;
  let { index } = path;
  const wp = path.waypoints;
  if (index >= wp.length - 1) {
    paths.delete(id);
    return false;
  }
  let remaining = SPEED * dt;
  let pos: Position = cur;
  while (remaining > 0 && index < wp.length - 1) {
    const next = wp[index + 1];
    const dx = next.x - pos.x;
    const dy = next.y - pos.y;
    const seg = Math.hypot(dx, dy);
    if (seg < 0.1) {
      index++;
      continue;
    }
    if (remaining >= seg) {
      remaining -= seg;
      pos = { x: next.x, y: next.y };
      index++;
    } else {
      const t = remaining / seg;
      pos = { x: pos.x + dx * t, y: pos.y + dy * t };
      remaining = 0;
    }
  }
  current.set(id, pos);
  path.index = index;
  if (index >= wp.length - 1) paths.delete(id);
  return true;
}

function tick(): void {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  let moving = false;
  for (const id of current.keys()) {
    if (advance(id, dt)) moving = true;
  }

  publish();
  if (moving) rafId = requestAnimationFrame(tick);
  else rafId = null;
}

function ensureRaf(): void {
  if (rafId === null) {
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }
}

/** Reconcile the desired agents + their fixed slot targets. */
export function setMotionTargets(
  items: { id: string; target: Position }[],
): void {
  const wanted = new Set(items.map((i) => i.id));
  for (const id of [...current.keys()]) {
    if (!wanted.has(id)) {
      current.delete(id);
      target.delete(id);
      paths.delete(id);
    }
  }
  let needsRaf = false;
  for (const { id, target: tgt } of items) {
    if (!current.has(id)) {
      // New agent: appear at its slot (no walk on first show).
      current.set(id, { x: tgt.x, y: tgt.y });
      target.set(id, { x: tgt.x, y: tgt.y });
    } else {
      const t = target.get(id);
      if (!t || Math.abs(t.x - tgt.x) > 1 || Math.abs(t.y - tgt.y) > 1) {
        target.set(id, { x: tgt.x, y: tgt.y });
        const waypoints = computePath(current.get(id)!, tgt, id);
        if (waypoints.length < 2) {
          // No walkable route: snap straight to the slot (no wall-crossing
          // animation) so the peer still reaches its destination.
          current.set(id, { x: tgt.x, y: tgt.y });
          paths.delete(id);
        } else {
          paths.set(id, { waypoints, index: 0 });
          needsRaf = true;
        }
      }
    }
  }
  publish();
  if (needsRaf) ensureRaf();
}

/** Stop the loop and clear state when the Command Center unmounts. */
export function useMotionCleanup(): void {
  useEffect(() => {
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      current.clear();
      target.clear();
      paths.clear();
      useMotionStore.getState()._set(new Map());
      // Clear sibling module-level state so a re-mount starts clean (no stale
      // slot reservations, no exit flash at the elevator).
      resetSlotAlloc();
      resetExit();
    };
  }, []);
}
