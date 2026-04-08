"use client";

import { create } from "zustand";
import type {
  ViewMode,
  ProjectGroup,
  MultiProjectGameState,
} from "@/types/projects";

/** Minimal session info needed for session-room derivation. */
export interface SessionInfo {
  id: string;
  projectName: string | null;
}

interface ProjectStoreState {
  // State
  viewMode: ViewMode;
  previousViewMode: ViewMode | null;
  activeRoomKey: string | null;
  projects: ProjectGroup[];
  sessions: SessionInfo[];
  lastUpdated: string | null;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setActiveRoom: (key: string | null) => void;
  zoomToProject: (key: string) => void;
  zoomToProjects: () => void;
  zoomToSession: (key: string) => void;
  goBackToMultiRoom: () => void;
  updateFromServer: (state: MultiProjectGameState) => void;
  setSessions: (sessions: SessionInfo[]) => void;
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  viewMode: "office",
  previousViewMode: null,
  activeRoomKey: null,
  projects: [],
  sessions: [],
  lastUpdated: null,

  setViewMode: (mode) =>
    set((state) => ({
      previousViewMode: state.viewMode,
      viewMode: mode,
    })),

  setActiveRoom: (key) => set({ activeRoomKey: key }),

  zoomToProject: (key) =>
    set((state) => ({
      previousViewMode: state.viewMode,
      viewMode: "project",
      activeRoomKey: key,
    })),

  zoomToProjects: () => set({ viewMode: "projects", activeRoomKey: null }),

  zoomToSession: (key) =>
    set((state) => ({
      previousViewMode: state.viewMode,
      viewMode: "session",
      activeRoomKey: key,
    })),

  goBackToMultiRoom: () =>
    set((state) => ({
      viewMode: state.previousViewMode ?? "projects",
      previousViewMode: null,
      activeRoomKey: null,
    })),

  updateFromServer: (state) =>
    set({
      projects: state.projects,
      lastUpdated: state.lastUpdated,
    }),

  setSessions: (sessions) => set({ sessions }),
}));

// Selectors
export const selectViewMode = (s: ProjectStoreState) => s.viewMode;
export const selectActiveRoomKey = (s: ProjectStoreState) => s.activeRoomKey;
export const selectProjects = (s: ProjectStoreState) => s.projects;
export const selectSessions = (s: ProjectStoreState) => s.sessions;
export const selectActiveProject = (s: ProjectStoreState) =>
  s.projects.find((p) => p.key === s.activeRoomKey) ?? null;
export const selectPreviousViewMode = (s: ProjectStoreState) =>
  s.previousViewMode;
