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
  title: string;
  description: string;
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

  startTour: () => void;
  advanceStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  currentStep: () => TourStep | null;
  loadTourSeen: () => void;
}

// ============================================================================
// STEP DEFINITIONS
// ============================================================================

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    type: "interactive",
    view: "building",
    targetTourId: null,
    title: "Welcome",
    description:
      "This is your command center. Scroll in or click a floor to explore.",
    advanceOn: { kind: "navigation", targetView: "floor" },
    pointerLabel: "scroll or click a floor",
    wideSpotlight: true,
  },
  {
    id: "rooms-overview",
    type: "narrated",
    view: "floor",
    targetTourId: null,
    title: "Rooms",
    description:
      "Each room is a project. Active rooms have live Claude sessions.",
    advanceOn: { kind: "timer", durationMs: 4000 },
    pointerLabel: null,
    wideSpotlight: true,
  },
  {
    id: "enter-room",
    type: "interactive",
    view: "floor",
    targetTourId: null,
    title: "Enter a Room",
    description: "Zoom into a room to see your agents at work.",
    advanceOn: { kind: "navigation", targetView: "room" },
    pointerLabel: "scroll or click a room",
    wideSpotlight: true,
  },
  {
    id: "start-simulation",
    type: "interactive",
    view: "room",
    targetTourId: "simulate-btn",
    title: "Start Simulation",
    description: "Click Simulate to bring the office to life.",
    advanceOn: { kind: "click", targetTourId: "simulate-btn" },
    pointerLabel: "click here",
    wideSpotlight: false,
  },
  {
    id: "agents-arrive",
    type: "narrated",
    view: "room",
    targetTourId: null,
    title: "Agents Arrive",
    description:
      "Agents arrive through the elevator, walk to their desks, and start working.",
    advanceOn: { kind: "simulation-event", event: "agent-idle" },
    pointerLabel: null,
    wideSpotlight: true,
  },
  {
    id: "inspect-agent",
    type: "interactive",
    view: "room",
    targetTourId: "game-canvas",
    title: "Inspect an Agent",
    description: "Click on any character to inspect them.",
    advanceOn: { kind: "focus-popup" },
    pointerLabel: "click a character",
    wideSpotlight: true,
  },
  {
    id: "focus-popup",
    type: "narrated",
    view: "room",
    targetTourId: null,
    title: "Focus Popup",
    description:
      "From here you can copy a message to clipboard and jump to your terminal. The office updates in real time as Claude works.",
    advanceOn: { kind: "timer", durationMs: 5000 },
    pointerLabel: null,
    wideSpotlight: true,
  },
  {
    id: "zoom-out",
    type: "interactive",
    view: "room",
    targetTourId: "breadcrumb-building",
    title: "Zoom Out",
    description: "Try zooming back out to see the big picture.",
    advanceOn: { kind: "navigation", targetView: "building" },
    pointerLabel: "scroll out or click breadcrumb",
    wideSpotlight: false,
  },
];

// ============================================================================
// STORE
// ============================================================================

const TOUR_SEEN_KEY = "panoptica-tour-seen";

export const useTourStore = create<TourState>((set, get) => ({
  isActive: false,
  currentStepIndex: 0,
  steps: TOUR_STEPS,
  hasSeenTour: false,

  startTour: () =>
    set({ isActive: true, currentStepIndex: 0 }),

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
    localStorage.setItem(TOUR_SEEN_KEY, "true");
    set({ isActive: false, currentStepIndex: 0, hasSeenTour: true });
  },

  completeTour: () => {
    localStorage.setItem(TOUR_SEEN_KEY, "true");
    set({ isActive: false, currentStepIndex: 0, hasSeenTour: true });
  },

  currentStep: () => {
    const { isActive, currentStepIndex, steps } = get();
    if (!isActive || currentStepIndex >= steps.length) return null;
    return steps[currentStepIndex];
  },

  loadTourSeen: () => {
    const seen = localStorage.getItem(TOUR_SEEN_KEY) === "true";
    set({ hasSeenTour: seen });
  },
}));
