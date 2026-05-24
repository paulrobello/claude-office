"use client";

import { create } from "zustand";
import type { BuildingState } from "@/types";

interface BuildingFeedStore {
  /** Latest compact building state from /ws/building (null until first message). */
  buildingState: BuildingState | null;
  /** Whether the building feed WebSocket is currently connected. */
  isConnected: boolean;
  setBuildingState: (state: BuildingState) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

export const useBuildingStore = create<BuildingFeedStore>()((set) => ({
  buildingState: null,
  isConnected: false,
  setBuildingState: (state) => set({ buildingState: state }),
  setConnected: (connected) => set({ isConnected: connected }),
  reset: () => set({ buildingState: null, isConnected: false }),
}));
