"use client";

import { create } from "zustand";
import type {
  ViewMode,
  BuildingConfig,
  FloorConfig,
  TransitionDirection,
} from "@/types/navigation";

// ============================================================================
// TYPES
// ============================================================================

interface NavigationState {
  /** Current view mode */
  view: ViewMode;
  /** Selected floor ID (null when in building view or single mode) */
  floorId: string | null;
  /** Building configuration loaded from backend */
  buildingConfig: BuildingConfig | null;
  /** Whether config is loading */
  isLoading: boolean;
  /** Pixel coordinates of the click that triggered the transition */
  transitionOrigin: { x: number; y: number } | null;
  /** Direction of the current transition */
  transitionDirection: TransitionDirection;
  /** Whether a transition animation is in progress */
  isTransitioning: boolean;
  /** Whether an edit-building request is pending */
  pendingEditBuilding: boolean;
}

interface NavigationActions {
  /** Navigate to building view */
  goToBuilding: () => void;
  /** Navigate to a specific floor */
  goToFloor: (floorId: string) => void;
  /** Set building config from API (auto-switches to building view if floors exist) */
  setBuildingConfig: (config: BuildingConfig) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Set transition origin for the next navigation */
  setTransitionOrigin: (origin: { x: number; y: number } | null) => void;
  /** Mark transition as complete */
  completeTransition: () => void;
  /** Get the currently selected floor config */
  getCurrentFloor: () => FloorConfig | null;
  /** Reset back to single view (no building config) */
  resetToSingle: () => void;
  /** Request the settings modal open on the building tab */
  requestEditBuilding: () => void;
  /** Consume the pending edit-building request (returns true if one was pending) */
  consumeEditBuilding: () => boolean;
}

type NavigationStore = NavigationState & NavigationActions;

// ============================================================================
// STORE
// ============================================================================

export const useNavigationStore = create<NavigationStore>()((set, get) => ({
  view: "single",
  floorId: null,
  buildingConfig: null,
  isLoading: false,
  transitionOrigin: null,
  transitionDirection: null,
  isTransitioning: false,
  pendingEditBuilding: false,

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
    set((state) => {
      // If config has floors, auto-switch to building view from single
      const hasFloors = config.floors.length > 0;
      const currentView = state.view;
      const newView: ViewMode =
        currentView === "single" && hasFloors
          ? "building"
          : currentView === "single"
            ? "single"
            : currentView;
      return {
        buildingConfig: config,
        isLoading: false,
        view: newView,
      };
    }),

  setLoading: (loading) => set({ isLoading: loading }),

  setTransitionOrigin: (origin) => set({ transitionOrigin: origin }),

  completeTransition: () =>
    set({
      isTransitioning: false,
      transitionDirection: null,
      transitionOrigin: null,
    }),

  getCurrentFloor: () => {
    const { buildingConfig, floorId } = get();
    if (!buildingConfig || !floorId) return null;
    return buildingConfig.floors.find((f) => f.id === floorId) ?? null;
  },

  resetToSingle: () =>
    set({
      view: "single",
      floorId: null,
      buildingConfig: null,
      transitionDirection: null,
      isTransitioning: false,
      transitionOrigin: null,
    }),

  requestEditBuilding: () => set({ pendingEditBuilding: true }),

  consumeEditBuilding: () => {
    const pending = get().pendingEditBuilding;
    if (pending) set({ pendingEditBuilding: false });
    return pending;
  },
}));
