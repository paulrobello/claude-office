"use client";

import { create } from "zustand";
import { getAgentJob, AgentJobStatus } from "@/components/coordination/coordinationApi";

export interface ActiveJob {
  jobId: string;
  agentNome: string;
  functionLabel: string;
  status: "running" | "done" | "failed";
  progress: number;
  message: string;
  error?: string;
}

interface JobStoreState {
  job: ActiveJob | null;
  _pollInterval: ReturnType<typeof setInterval> | null;
  startJob: (jobId: string, agentNome: string, functionLabel: string) => void;
  clearJob: () => void;
  _updateFromApi: (jobId: string) => Promise<void>;
}

export const useJobStore = create<JobStoreState>((set, get) => ({
  job: null,
  _pollInterval: null,

  startJob(jobId, agentNome, functionLabel) {
    // limpa job anterior se houver
    const prev = get()._pollInterval;
    if (prev) clearInterval(prev);

    set({
      job: {
        jobId,
        agentNome,
        functionLabel,
        status: "running",
        progress: 0,
        message: "Iniciando...",
      },
    });

    // polling a cada 2s
    const interval = setInterval(async () => {
      await get()._updateFromApi(jobId);
      // para quando terminar
      const current = get().job;
      if (current && current.status !== "running") {
        clearInterval(interval);
        set({ _pollInterval: null });
      }
    }, 2000);

    set({ _pollInterval: interval });
  },

  clearJob() {
    const interval = get()._pollInterval;
    if (interval) clearInterval(interval);
    set({ job: null, _pollInterval: null });
  },

  async _updateFromApi(jobId: string): Promise<void> {
    try {
      const data: AgentJobStatus = await getAgentJob(jobId);
      set((state) => ({
        job: state.job
          ? {
              ...state.job,
              status: data.status,
              progress: data.progress,
              message: data.message,
              error: data.error,
            }
          : null,
      }));
    } catch {
      // falha de rede: mantém estado atual, tenta de novo no próximo ciclo
    }
  },
}));
