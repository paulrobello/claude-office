"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import { useRunStore } from "@/stores/runStore";
import { OrchestratorStation } from "@/components/office/OrchestratorStation";
import { RoleNook, type NookRole } from "@/components/office/RoleNook";
import { TaskWhiteboard } from "@/components/office/TaskWhiteboard";
import type { RunPhase } from "@/types/run";

const PHASE_COLORS: Record<RunPhase | "done", string> = {
  A: "#6366f1",
  B: "#f59e0b",
  C: "#10b981",
  D: "#8b5cf6",
  done: "#64748b",
};

// Index-based mapping: memberSessionIds[0]=Designer, [1]=Coder, [2]=Verifier, [3]=Reviewer
const ROLE_SLOTS: { role: NookRole; gridRow: number; gridCol: number }[] = [
  { role: "Designer", gridRow: 1, gridCol: 1 },
  { role: "Coder", gridRow: 1, gridCol: 3 },
  { role: "Verifier", gridRow: 3, gridCol: 1 },
  { role: "Reviewer", gridRow: 3, gridCol: 3 },
];

function shortRunId(runId: string): string {
  const parts = runId.split("-");
  return parts.length >= 3 ? parts.slice(-2).join("-") : runId.slice(-8);
}

export function RunOfficeView(): React.ReactNode {
  const activeRunId = useNavigationStore((s) => s.activeRunId);
  const goToCampus = useNavigationStore((s) => s.goToCampus);
  const goToNook = useNavigationStore((s) => s.goToNook);
  const run = useRunStore((s) =>
    activeRunId != null ? (s.runs.get(activeRunId) ?? null) : null,
  );

  if (!run) {
    return (
      <div
        className="flex-grow flex items-center justify-center"
        style={{ background: "#030712" }}
      >
        <div className="text-center">
          <p className="font-mono text-sm mb-4" style={{ color: "#475569" }}>
            Run not found
          </p>
          <button
            onClick={goToCampus}
            className="text-xs font-mono px-3 py-1.5 rounded"
            style={{ background: "#1e293b", color: "#94a3b8" }}
          >
            ← Back to Campus
          </button>
        </div>
      </div>
    );
  }

  const isLive = run.outcome === "in_progress";
  const phaseColor = PHASE_COLORS[run.phase];
  const repoName = run.primaryRepo.split("/").slice(-1)[0] ?? run.primaryRepo;

  return (
    <div
      className="flex-grow flex flex-col overflow-hidden"
      style={{ background: "#030712", padding: "16px", gap: "12px" }}
    >
      {/* Header */}
      <div className="flex items-center gap-4 shrink-0">
        <button
          onClick={goToCampus}
          className="text-xs font-mono px-3 py-1.5 rounded transition-colors"
          style={{
            background: "#0f172a",
            color: "#94a3b8",
            border: "1px solid #1e293b",
          }}
        >
          ← Campus
        </button>

        <div className="flex items-center gap-3">
          <span
            className="text-sm font-mono font-bold"
            style={{ color: "#e2e8f0" }}
          >
            {shortRunId(run.runId)}
          </span>
          <span
            className="text-xs font-mono px-2 py-0.5 rounded"
            style={{ background: phaseColor, color: "#fff" }}
          >
            Phase {run.phase}
          </span>
          <span className="text-xs font-mono" style={{ color: "#475569" }}>
            {repoName}
          </span>
          {isLive && (
            <div className="flex items-center gap-1">
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
      </div>

      {/* Task whiteboard */}
      <div className="shrink-0">
        <TaskWhiteboard tasks={run.planTasks} />
      </div>

      {/* Office grid — 3×3: nooks in corners, orchestrator center */}
      <div
        className="flex-grow flex items-center justify-center"
        style={{ minHeight: 0 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gridTemplateRows: "1fr auto 1fr",
            gap: "24px",
            width: "100%",
            maxWidth: "680px",
            maxHeight: "520px",
          }}
        >
          {ROLE_SLOTS.map(({ role, gridRow, gridCol }, i) => (
            <div
              key={role}
              style={{
                gridRow,
                gridColumn: gridCol,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <RoleNook
                role={role}
                sessionId={run.memberSessionIds[i] ?? null}
                runId={run.runId}
                onNookClick={goToNook}
              />
            </div>
          ))}

          {/* Empty grid cells for gaps */}
          <div style={{ gridRow: 1, gridColumn: 2 }} />
          <div style={{ gridRow: 2, gridColumn: 1 }} />
          <div style={{ gridRow: 2, gridColumn: 3 }} />
          <div style={{ gridRow: 3, gridColumn: 2 }} />

          {/* Orchestrator — center */}
          <div
            style={{
              gridRow: 2,
              gridColumn: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <OrchestratorStation
              orchestratorSessionId={run.orchestratorSessionId}
              phase={run.phase}
              isLive={isLive}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
