/**
 * Types for multi-project office state.
 * Matches backend models in app/models/projects.py.
 */

import type { Agent, Boss, OfficeState, TodoItem } from "./generated";

export type ViewMode = "overview" | "room-detail" | "all-merged" | "sessions";

export interface ProjectGroup {
  key: string;
  name: string;
  color: string;
  root: string | null;
  agents: Agent[];
  boss: Boss;
  sessionCount: number;
  todos: TodoItem[];
}

export interface MultiProjectGameState {
  sessionId: string;
  projects: ProjectGroup[];
  office: OfficeState;
  lastUpdated: string;
}

export interface ProjectSummary {
  key: string;
  name: string;
  color: string;
  root: string | null;
  sessionCount: number;
}
