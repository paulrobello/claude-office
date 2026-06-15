"use client";

import { create } from "zustand";
import type { OverviewEntry } from "@/types";

// ============================================================================
// TYPES
// ============================================================================

interface OverviewState {
  /** Raw per-session boss snapshots from /ws/overview (live sessions only). */
  entries: OverviewEntry[];
  /** Whether the overview WebSocket is currently connected. */
  connected: boolean;
  /** Wall-clock ms of the last received update (null if none yet). */
  lastUpdated: number | null;

  setEntries: (entries: OverviewEntry[]) => void;
  setConnected: (connected: boolean) => void;
  clear: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Shallow-equal two entry lists on only the fields consumers read. Lets the
 * store skip a state update (and the resulting re-render of every consumer)
 * when a WS frame carries no meaningful change.
 */
function entriesEqual(a: OverviewEntry[], b: OverviewEntry[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.sessionId !== y.sessionId ||
      x.bucket !== y.bucket ||
      x.state !== y.state ||
      x.currentTask !== y.currentTask ||
      x.todoDone !== y.todoDone ||
      x.todoTotal !== y.todoTotal ||
      x.subagentCount !== y.subagentCount
    ) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// STORE
// ============================================================================

export const useOverviewStore = create<OverviewState>()((set) => ({
  entries: [],
  connected: false,
  lastUpdated: null,

  setEntries: (entries) =>
    set((state) =>
      // Skip the update entirely when nothing consumers care about changed, so
      // React/zustand bail out and don't re-render consumers every WS frame.
      entriesEqual(state.entries, entries)
        ? state
        : { entries, lastUpdated: Date.now() },
    ),
  setConnected: (connected) => set({ connected }),
  clear: () => set({ entries: [], lastUpdated: null, connected: false }),
}));

export const selectOverviewEntries = (s: OverviewState): OverviewEntry[] =>
  s.entries;
export const selectOverviewConnected = (s: OverviewState): boolean =>
  s.connected;
