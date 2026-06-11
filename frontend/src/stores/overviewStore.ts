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
// STORE
// ============================================================================

export const useOverviewStore = create<OverviewState>()((set) => ({
  entries: [],
  connected: false,
  lastUpdated: null,

  setEntries: (entries) => set({ entries, lastUpdated: Date.now() }),
  setConnected: (connected) => set({ connected }),
  clear: () => set({ entries: [], lastUpdated: null }),
}));

export const selectOverviewEntries = (s: OverviewState): OverviewEntry[] =>
  s.entries;
export const selectOverviewConnected = (s: OverviewState): boolean =>
  s.connected;
