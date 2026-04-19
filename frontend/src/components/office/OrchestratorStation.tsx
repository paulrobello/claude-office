"use client";

import type { RunPhase } from "@/types/run";

const PHASE_COLORS: Record<RunPhase | "done", string> = {
  A: "#6366f1",
  B: "#f59e0b",
  C: "#10b981",
  D: "#8b5cf6",
  done: "#64748b",
};

const PHASE_LABELS: Record<RunPhase | "done", string> = {
  A: "Phase A — Prep",
  B: "Phase B — Impl",
  C: "Phase C — QA",
  D: "Phase D — Wrap",
  done: "Done",
};

interface OrchestratorStationProps {
  orchestratorSessionId: string | null;
  phase: RunPhase | "done";
  isLive: boolean;
}

export function OrchestratorStation({
  orchestratorSessionId,
  phase,
  isLive,
}: OrchestratorStationProps): React.ReactNode {
  const phaseColor = PHASE_COLORS[phase];

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-xl p-5"
      style={{
        background: "#0f172a",
        border: `2px solid ${phaseColor}`,
        boxShadow: isLive ? `0 0 16px ${phaseColor}44` : "none",
        minWidth: "160px",
        minHeight: "140px",
      }}
    >
      {/* Orchestrator icon */}
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold"
        style={{
          background: `${phaseColor}22`,
          border: `2px solid ${phaseColor}`,
        }}
        title="Orchestrator (🕹️)"
      >
        🕹️
      </div>

      {/* Label */}
      <div className="text-center">
        <p className="text-xs font-mono font-bold" style={{ color: "#e2e8f0" }}>
          Orchestrator
        </p>
        {orchestratorSessionId && (
          <p className="text-xs font-mono mt-0.5" style={{ color: "#475569" }}>
            {orchestratorSessionId.slice(0, 8)}
          </p>
        )}
      </div>

      {/* Phase badge */}
      <span
        className="text-xs font-mono px-2 py-0.5 rounded"
        style={{ background: phaseColor, color: "#fff" }}
      >
        {PHASE_LABELS[phase]}
      </span>

      {/* Live pulse indicator */}
      {isLive && (
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: "#10b981" }}
          />
          <span className="text-xs font-mono" style={{ color: "#10b981" }}>
            live
          </span>
        </div>
      )}
    </div>
  );
}
