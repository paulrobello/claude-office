import { create } from "zustand";
import type { Run } from "@/types/run";

interface RunState {
  runs: Map<string, Run>;
  activeRunId: string | null;
  setRun: (run: Run) => void;
  removeRun: (runId: string) => void;
  setActiveRun: (runId: string | null) => void;
  clear: () => void;
}

export const useRunStore = create<RunState>((set) => ({
  runs: new Map(),
  activeRunId: null,

  setRun: (run) =>
    set((state) => {
      const next = new Map(state.runs);
      next.set(run.runId, run);
      return { runs: next };
    }),

  removeRun: (runId) =>
    set((state) => {
      const next = new Map(state.runs);
      next.delete(runId);
      return {
        runs: next,
        activeRunId: state.activeRunId === runId ? null : state.activeRunId,
      };
    }),

  setActiveRun: (runId) => set({ activeRunId: runId }),

  clear: () => set({ runs: new Map(), activeRunId: null }),
}));

export const selectRuns = (state: RunState) => state.runs;

export const selectActiveRun = (state: RunState): Run | null =>
  state.activeRunId != null
    ? (state.runs.get(state.activeRunId) ?? null)
    : null;

export const selectHotDeskSessions = <T extends { runId?: string | null }>(
  sessions: T[],
): T[] => sessions.filter((s) => s.runId == null);
