"use client";

import { create } from "zustand";
import type {
  ViewMode,
  ProjectGroup,
  MultiProjectGameState,
} from "@/types/projects";

interface ProjectStoreState {
  // State
  viewMode: ViewMode;
  previousViewMode: ViewMode | null;
  activeRoomKey: string | null;
  projects: ProjectGroup[];
  lastUpdated: string | null;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setActiveRoom: (key: string | null) => void;
  zoomToRoom: (key: string) => void;
  zoomToOverview: () => void;
  goBackToMultiRoom: () => void;
  updateFromServer: (state: MultiProjectGameState) => void;
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  viewMode: "all-merged",
  previousViewMode: null,
  activeRoomKey: null,
  projects: [],
  lastUpdated: null,

  setViewMode: (mode) =>
    set((state) => ({
      previousViewMode: state.viewMode,
      viewMode: mode,
    })),

  setActiveRoom: (key) => set({ activeRoomKey: key }),

  zoomToRoom: (key) => set({ viewMode: "room-detail", activeRoomKey: key }),

  zoomToOverview: () => set({ viewMode: "overview", activeRoomKey: null }),

  goBackToMultiRoom: () =>
    set((state) => ({
      viewMode: state.previousViewMode ?? "overview",
      previousViewMode: null,
      activeRoomKey: null,
    })),

  updateFromServer: (state) =>
    set({
      projects: state.projects,
      lastUpdated: state.lastUpdated,
    }),
}));

// Selectors
export const selectViewMode = (s: ProjectStoreState) => s.viewMode;
export const selectActiveRoomKey = (s: ProjectStoreState) => s.activeRoomKey;
export const selectProjects = (s: ProjectStoreState) => s.projects;
export const selectActiveProject = (s: ProjectStoreState) =>
  s.projects.find((p) => p.key === s.activeRoomKey) ?? null;
export const selectPreviousViewMode = (s: ProjectStoreState) =>
  s.previousViewMode;
export const selectSessionRooms = (s: ProjectStoreState): ProjectGroup[] => {
  const sessionMap = new Map<string, {
    agents: ProjectGroup["agents"];
    project: ProjectGroup;
  }>();

  for (const project of s.projects) {
    const hasSessionIds = project.agents.some((a) => (a as Record<string, unknown>).sessionId);
    if (!hasSessionIds) {
      sessionMap.set(project.key, { agents: project.agents, project });
      continue;
    }
    for (const agent of project.agents) {
      const sid = String((agent as Record<string, unknown>).sessionId ?? "unknown");
      if (!sessionMap.has(sid)) {
        sessionMap.set(sid, { agents: [], project });
      }
      sessionMap.get(sid)!.agents.push(agent);
    }
  }

  return Array.from(sessionMap.entries()).map(([sid, { agents, project }]) => ({
    key: sid,
    name: `${project.name} · ${sid.slice(0, 8)}`,
    color: project.color,
    root: project.root,
    agents,
    boss: project.boss,
    sessionCount: 1,
    todos: project.todos,
  }));
};
