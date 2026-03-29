import { create } from "zustand";
import type { ViewMode, BuildingConfig, FloorConfig } from "@/types/navigation";

interface NavigationState {
  /** Current view mode */
  view: ViewMode;
  /** Selected floor ID (null when in building view) */
  floorId: string | null;
  /** Selected room ID (null when not in room view) */
  roomId: string | null;
  /** Building configuration loaded from backend */
  buildingConfig: BuildingConfig | null;
  /** Whether config is loading */
  isLoading: boolean;
  /** All sessions from backend (for room/floor summaries) */
  allSessions: { id: string; roomId: string | null; status: string; eventCount: number }[];
  setAllSessions: (sessions: { id: string; roomId: string | null; status: string; eventCount: number }[]) => void;

  /** Navigate to building view */
  goToBuilding: () => void;
  /** Navigate to a specific floor */
  goToFloor: (floorId: string) => void;
  /** Navigate to a specific room */
  goToRoom: (floorId: string, roomId: string) => void;
  /** Set building config from API */
  setBuildingConfig: (config: BuildingConfig) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Get the currently selected floor config */
  getCurrentFloor: () => FloorConfig | null;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  view: "building",
  floorId: null,
  roomId: null,
  buildingConfig: null,
  isLoading: true,
  allSessions: [],
  setAllSessions: (sessions) => set({ allSessions: sessions }),

  goToBuilding: () => set({ view: "building", floorId: null, roomId: null }),

  goToFloor: (floorId) => set({ view: "floor", floorId, roomId: null }),

  goToRoom: (floorId, roomId) => set({ view: "room", floorId, roomId }),

  setBuildingConfig: (config) =>
    set({ buildingConfig: config, isLoading: false }),

  setLoading: (loading) => set({ isLoading: loading }),

  getCurrentFloor: () => {
    const { buildingConfig, floorId } = get();
    if (!buildingConfig || !floorId) return null;
    return buildingConfig.floors.find((f) => f.id === floorId) ?? null;
  },
}));
