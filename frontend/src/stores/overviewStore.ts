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
 * Shallow-equal two entry lists so the store can skip a state update (and the
 * resulting re-render of every consumer) when a WS frame carries no meaningful
 * change.
 *
 * Compares *every* field present on either entry rather than a hardcoded list,
 * so a newly-added OverviewEntry field can't silently fail to trigger a
 * re-render. All current fields are primitives, so a value comparison is
 * enough (a future nested field would over-render — safe, just less optimal).
 * Using the union of keys lets an omitted optional field compare equal to an
 * explicit undefined.
 */
export function entriesEqual(a: OverviewEntry[], b: OverviewEntry[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    const keys = new Set<string>([...Object.keys(x), ...Object.keys(y)]);
    for (const key of keys) {
      if (x[key] !== y[key]) return false;
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
