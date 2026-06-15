"use client";

import { create } from "zustand";
import { useEffect } from "react";

/**
 * Lightweight exit animation for the Command Center "Ended" column. When a
 * session ends, its agent walks to the elevator, the doors open, the agent
 * steps in and fades out. Isolated from the rest of the canvas: only the
 * exiting agents and the door subscribe to the per-frame clock.
 */

export const EXIT_DURATION = 2400; // ms for the full walk-in-and-fade

interface ExitState {
  /** Monotonic clock (performance.now), bumped each animation frame. */
  now: number;
  /** sessionId → time (performance.now) the exit started. */
  startTimes: Map<string, number>;
  setNow: (now: number) => void;
  /** Register the current ended sessions; new ones start their exit now. */
  registerEnded: (ids: string[], t: number) => void;
  /** Drop sessions whose exit animation has finished by `now`. */
  pruneCompleted: (now: number) => void;
}

export const useExitStore = create<ExitState>()((set) => ({
  now: 0,
  startTimes: new Map(),
  setNow: (now) => set({ now }),
  registerEnded: (ids, t) => {
    let added = false;
    set((s) => {
      const idSet = new Set(ids);
      const next = new Map(s.startTimes);
      let changed = false;
      for (const id of ids)
        if (!next.has(id)) {
          next.set(id, t);
          changed = true;
          added = true;
        }
      for (const id of [...next.keys()])
        if (!idSet.has(id)) {
          next.delete(id);
          changed = true;
        }
      // Preserve Map identity when nothing changed (avoids re-render churn).
      return changed ? { startTimes: next } : {};
    });
    // Re-arm the self-gating driver loop when a new exit begins.
    if (added) ensureExitRaf();
  },
  pruneCompleted: (now) =>
    set((s) => {
      const next = new Map(s.startTimes);
      let changed = false;
      for (const [id, st] of s.startTimes)
        if ((now - st) / EXIT_DURATION >= 1) {
          next.delete(id);
          changed = true;
        }
      // Preserve Map identity when nothing changed (avoids re-render churn).
      return changed ? { startTimes: next } : {};
    }),
}));

/** Clear all exit state (call on Command Center unmount). */
export function resetExit(): void {
  useExitStore.setState({ now: 0, startTimes: new Map() });
}

/** 0→1 progress of a session's exit (0 if not exiting, 1 when fully gone). */
export function exitProgress(
  id: string,
  now: number,
  startTimes: Map<string, number>,
): number {
  const st = startTimes.get(id);
  if (st == null) return 0;
  return Math.min(1, Math.max(0, (now - st) / EXIT_DURATION));
}

/** True while any agent is mid-exit (doors should be open). */
export function selectDoorOpen(s: ExitState): boolean {
  for (const st of s.startTimes.values()) {
    const p = Math.min(1, Math.max(0, (s.now - st) / EXIT_DURATION));
    if (p >= 0.35 && p < 0.95) return true;
  }
  return false;
}

// ---- self-gating driver loop (mirrors commandCenterMotion) ----
let rafId: number | null = null;
let wasActive = false;

function tick(): void {
  const now = performance.now();
  const s = useExitStore.getState();
  // Only advance the clock while an exit is actually mid-animation, so we
  // don't spam store updates (and re-renders) when nobody is leaving.
  let active = false;
  let latestFinish = 0;
  for (const st of s.startTimes.values()) {
    if ((now - st) / EXIT_DURATION < 1) active = true;
    latestFinish = Math.max(latestFinish, st + EXIT_DURATION);
  }
  if (active) {
    s.setNow(now);
  } else if (wasActive && s.now < latestFinish) {
    // The frame where exits cross the finish line: pin the clock to (or
    // past) the last finish boundary so exitProgress reaches exactly 1 and
    // exited peers don't linger.
    s.setNow(latestFinish);
  }
  wasActive = active;
  if (active) {
    rafId = requestAnimationFrame(tick);
  } else {
    // Nothing animating: drop finished exits and stop the loop. It re-arms
    // from registerEnded when the next session leaves.
    s.pruneCompleted(now);
    rafId = null;
  }
}

/** Start the self-gating driver loop if it isn't already running. */
function ensureExitRaf(): void {
  if (rafId === null && typeof requestAnimationFrame !== "undefined") {
    rafId = requestAnimationFrame(tick);
  }
}

/** Drives the per-frame clock while the Command Center is mounted. */
export function useExitDriver(): void {
  useEffect(() => {
    ensureExitRaf();
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      wasActive = false;
      // Defensive: clear module-level exit state on unmount so a later mount
      // can't briefly observe stale startTimes (useMotionCleanup also resets).
      resetExit();
    };
  }, []);
}
