"use client";

import type { Run, RunPhase } from "@/types/run";
import { useNavigationStore } from "@/stores/navigationStore";

const PHASE_COLORS: Record<RunPhase | "done", string> = {
  A: "#6366f1",
  B: "#f59e0b",
  C: "#10b981",
  D: "#8b5cf6",
  done: "#64748b",
};

const PHASE_LABELS: Record<RunPhase | "done", string> = {
  A: "Phase A",
  B: "Phase B",
  C: "Phase C",
  D: "Phase D",
  done: "Done",
};

const ROLE_NOOKS = ["D", "C", "V", "R"] as const;

function shortRunId(runId: string): string {
  // e.g. "ral-20260418-a7f3" → "a7f3" or last 8 chars
  const parts = runId.split("-");
  return parts.length >= 3 ? parts.slice(-2).join("-") : runId.slice(-8);
}

function TaskProgressBar({
  tasks,
}: {
  tasks: Run["planTasks"];
}): React.ReactNode {
  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="w-full">
      <div
        className="flex justify-between text-xs font-mono mb-1"
        style={{ color: "#94a3b8" }}
      >
        <span>tasks</span>
        <span>
          {done}/{total}
        </span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "#1e293b" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: "#f59e0b" }}
        />
      </div>
    </div>
  );
}

export interface RunOfficeCardProps {
  run: Run;
}

export function RunOfficeCard({ run }: RunOfficeCardProps): React.ReactNode {
  const goToRunOffice = useNavigationStore((s) => s.goToRunOffice);
  const phaseColor = PHASE_COLORS[run.phase];
  const isEnded = run.outcome !== "in_progress";

  const occupiedCount = Math.min(run.memberSessionIds.length, 4);

  return (
    <button
      onClick={() => goToRunOffice(run.runId)}
      className="flex flex-col gap-3 rounded-lg p-4 text-left transition-opacity cursor-pointer"
      style={{
        background: "#0f172a",
        border: `2px solid ${phaseColor}`,
        opacity: isEnded ? 0.5 : 1,
        minWidth: "180px",
        maxWidth: "220px",
      }}
    >
      {/* Header: run id + phase badge */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-xs font-mono font-bold truncate"
          style={{ color: "#e2e8f0" }}
        >
          {shortRunId(run.runId)}
        </span>
        <span
          className="shrink-0 text-xs font-mono px-1.5 py-0.5 rounded"
          style={{ background: phaseColor, color: "#fff" }}
        >
          {PHASE_LABELS[run.phase]}
        </span>
      </div>

      {/* Repo name */}
      <span className="text-xs truncate" style={{ color: "#64748b" }}>
        {run.primaryRepo.split("/").slice(-1)[0] ?? run.primaryRepo}
      </span>

      {/* Role nook indicators */}
      <div className="flex gap-1.5">
        {ROLE_NOOKS.map((role, i) => {
          const lit = i < occupiedCount;
          return (
            <div
              key={role}
              className="w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold"
              style={{
                background: lit ? phaseColor : "#1e293b",
                color: lit ? "#fff" : "#475569",
              }}
              title={["Designer", "Coder", "Verifier", "Reviewer"][i]}
            >
              {role}
            </div>
          );
        })}
      </div>

      {/* Task progress */}
      {run.planTasks.length > 0 && <TaskProgressBar tasks={run.planTasks} />}

      {/* Outcome glyph when ended */}
      {isEnded && (
        <span className="text-xs font-mono" style={{ color: "#94a3b8" }}>
          {run.outcome === "completed" && "✓ completed"}
          {run.outcome === "stuck" && "⚠ stuck"}
          {run.outcome === "abandoned" && "✗ abandoned"}
        </span>
      )}
    </button>
  );
}
