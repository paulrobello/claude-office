import { create } from "zustand";
import type { ViewMode, BuildingConfig, FloorConfig, TransitionDirection } from "@/types/navigation";

interface NavigationState {
  /** Current view mode */
  view: ViewMode;
  /** Selected floor ID (null when in building view) */
  floorId: string | null;
  /** Building configuration loaded from backend */
  buildingConfig: BuildingConfig | null;
  /** Whether config is loading */
  isLoading: boolean;
  /** Pixel coordinates of the click/scroll that triggered the transition */
  transitionOrigin: { x: number; y: number } | null;
  /** Direction of the current transition */
  transitionDirection: TransitionDirection;
  /** Whether a transition animation is in progress */
  isTransitioning: boolean;
  /** Set transition origin for the next navigation */
  setTransitionOrigin: (origin: { x: number; y: number } | null) => void;
  /** Mark transition as complete */
  completeTransition: () => void;
  /** All sessions from backend (for room/floor summaries) */
  allSessions: {
    id: string;
    roomId: string | null;
    status: string;
    eventCount: number;
  }[];
  setAllSessions: (
    sessions: {
      id: string;
      roomId: string | null;
      status: string;
      eventCount: number;
    }[],
  ) => void;

  /** Navigate to building view */
  goToBuilding: () => void;
  /** Navigate to a specific floor */
  goToFloor: (floorId: string) => void;
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
  buildingConfig: null,
  isLoading: true,
  transitionOrigin: null,
  transitionDirection: null,
  isTransitioning: false,
  setTransitionOrigin: (origin) => set({ transitionOrigin: origin }),
  completeTransition: () =>
    set({ isTransitioning: false, transitionDirection: null, transitionOrigin: null }),
  allSessions: [],
  setAllSessions: (sessions) => set({ allSessions: sessions }),

  goToBuilding: () =>
    set({
      view: "building",
      floorId: null,
      transitionDirection: "zoom-out",
      isTransitioning: true,
    }),

  goToFloor: (floorId) =>
    set({
      view: "floor",
      floorId,
      transitionDirection: "zoom-in",
      isTransitioning: true,
    }),

  setBuildingConfig: (config) =>
    set({ buildingConfig: config, isLoading: false }),

  setLoading: (loading) => set({ isLoading: loading }),

  getCurrentFloor: () => {
    const { buildingConfig, floorId } = get();
    if (!buildingConfig || !floorId) return null;
    return buildingConfig.floors.find((f) => f.id === floorId) ?? null;
  },
}));
