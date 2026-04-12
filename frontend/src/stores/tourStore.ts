"use client";

import { create } from "zustand";
import type { ViewMode } from "@/types/navigation";

// ============================================================================
// TYPES
// ============================================================================

export type TourStepType = "interactive" | "narrated";

export type AdvanceCondition =
  | { kind: "navigation"; targetView: ViewMode }
  | { kind: "click"; targetTourId: string }
  | { kind: "timer"; durationMs: number }
  | { kind: "simulation-event"; event: string }
  | { kind: "focus-popup" };

export interface TourStep {
  id: string;
  type: TourStepType;
  view: ViewMode;
  targetTourId: string | null;
  titleKey: string;
  descriptionKey: string;
  advanceOn: AdvanceCondition;
  /** Hint label shown near the pointer ring */
  pointerLabel: string | null;
  /** If true, spotlight is wide/absent so user can see the full canvas */
  wideSpotlight: boolean;
}

interface TourState {
  isActive: boolean;
  currentStepIndex: number;
  steps: TourStep[];
  hasSeenTour: boolean;
  /** Whether the tour is running in single-session or building mode */
  mode: "single" | "building";

  startTour: (mode: "single" | "building") => void;
  advanceStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  currentStep: () => TourStep | null;
  loadTourSeen: () => void;
}

// ============================================================================
// STEP DEFINITIONS — BUILDING MODE
// ============================================================================

const BUILDING_TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    type: "interactive",
    view: "building",
    targetTourId: null,
    titleKey: "tour.steps.welcome.title",
    descriptionKey: "tour.steps.welcome.description",
    advanceOn: { kind: "navigation", targetView: "floor" },
    pointerLabel: "scroll or click a floor",
    wideSpotlight: true,
  },
  {
    id: "start-simulation",
    type: "interactive",
    view: "floor",
    targetTourId: "simulate-btn",
    titleKey: "tour.steps.simulate.title",
    descriptionKey: "tour.steps.simulate.description",
    advanceOn: { kind: "click", targetTourId: "simulate-btn" },
    pointerLabel: "click here",
    wideSpotlight: false,
  },
  {
    id: "agents-arrive",
    type: "narrated",
    view: "floor",
    targetTourId: null,
    titleKey: "tour.steps.agentsArrive.title",
    descriptionKey: "tour.steps.agentsArrive.description",
    advanceOn: { kind: "simulation-event", event: "agent-idle" },
    pointerLabel: null,
    wideSpotlight: true,
  },
  {
    id: "inspect-agent",
    type: "interactive",
    view: "floor",
    targetTourId: "game-canvas",
    titleKey: "tour.steps.inspectAgent.title",
    descriptionKey: "tour.steps.inspectAgent.description",
    advanceOn: { kind: "focus-popup" },
    pointerLabel: "click a character",
    wideSpotlight: true,
  },
  {
    id: "focus-popup",
    type: "narrated",
    view: "floor",
    targetTourId: null,
    titleKey: "tour.steps.focusPopup.title",
    descriptionKey: "tour.steps.focusPopup.description",
    advanceOn: { kind: "timer", durationMs: 5000 },
    pointerLabel: null,
    wideSpotlight: true,
  },
  {
    id: "zoom-out",
    type: "interactive",
    view: "floor",
    targetTourId: "breadcrumb-building",
    titleKey: "tour.steps.zoomOut.title",
    descriptionKey: "tour.steps.zoomOut.description",
    advanceOn: { kind: "navigation", targetView: "building" },
    pointerLabel: "scroll out or click breadcrumb",
    wideSpotlight: false,
  },
];

// ============================================================================
// STEP DEFINITIONS — SINGLE SESSION MODE
// ============================================================================

const SINGLE_TOUR_STEPS: TourStep[] = [
  {
    id: "single-welcome",
    type: "interactive",
    view: "single",
    targetTourId: null,
    titleKey: "tour.steps.singleWelcome.title",
    descriptionKey: "tour.steps.singleWelcome.description",
    advanceOn: { kind: "timer", durationMs: 4000 },
    pointerLabel: null,
    wideSpotlight: true,
  },
  {
    id: "single-simulate",
    type: "interactive",
    view: "single",
    targetTourId: "simulate-btn",
    titleKey: "tour.steps.simulate.title",
    descriptionKey: "tour.steps.simulate.description",
    advanceOn: { kind: "click", targetTourId: "simulate-btn" },
    pointerLabel: "click here",
    wideSpotlight: false,
  },
  {
    id: "single-agents-arrive",
    type: "narrated",
    view: "single",
    targetTourId: null,
    titleKey: "tour.steps.agentsArrive.title",
    descriptionKey: "tour.steps.agentsArrive.description",
    advanceOn: { kind: "simulation-event", event: "agent-idle" },
    pointerLabel: null,
    wideSpotlight: true,
  },
  {
    id: "single-inspect-agent",
    type: "interactive",
    view: "single",
    targetTourId: "game-canvas",
    titleKey: "tour.steps.inspectAgent.title",
    descriptionKey: "tour.steps.inspectAgent.description",
    advanceOn: { kind: "focus-popup" },
    pointerLabel: "click a character",
    wideSpotlight: true,
  },
  {
    id: "single-focus-popup",
    type: "narrated",
    view: "single",
    targetTourId: null,
    titleKey: "tour.steps.focusPopup.title",
    descriptionKey: "tour.steps.focusPopup.description",
    advanceOn: { kind: "timer", durationMs: 5000 },
    pointerLabel: null,
    wideSpotlight: true,
  },
  {
    id: "single-settings",
    type: "interactive",
    view: "single",
    targetTourId: "settings-btn",
    titleKey: "tour.steps.settings.title",
    descriptionKey: "tour.steps.settings.description",
    advanceOn: { kind: "timer", durationMs: 6000 },
    pointerLabel: "configure floors here",
    wideSpotlight: false,
  },
];

// ============================================================================
// STORE
// ============================================================================

const TOUR_SEEN_KEY = "claude-office-tour-seen";

export const useTourStore = create<TourState>()((set, get) => ({
  isActive: false,
  currentStepIndex: 0,
  steps: SINGLE_TOUR_STEPS,
  hasSeenTour: false,
  mode: "single",

  startTour: (mode: "single" | "building") =>
    set({
      isActive: true,
      currentStepIndex: 0,
      mode,
      steps: mode === "building" ? BUILDING_TOUR_STEPS : SINGLE_TOUR_STEPS,
    }),

  advanceStep: () => {
    const { currentStepIndex, steps } = get();
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= steps.length) {
      get().completeTour();
    } else {
      set({ currentStepIndex: nextIndex });
    }
  },

  skipTour: () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(TOUR_SEEN_KEY, "true");
    }
    set({ isActive: false, currentStepIndex: 0, hasSeenTour: true });
  },

  completeTour: () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(TOUR_SEEN_KEY, "true");
    }
    set({ isActive: false, currentStepIndex: 0, hasSeenTour: true });
  },

  currentStep: () => {
    const { isActive, currentStepIndex, steps } = get();
    if (!isActive || currentStepIndex >= steps.length) return null;
    return steps[currentStepIndex];
  },

  loadTourSeen: () => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(TOUR_SEEN_KEY) === "true";
    set({ hasSeenTour: seen });
  },
}));
