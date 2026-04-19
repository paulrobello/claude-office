"use client";

import type { Run } from "@/types/run";

function StatRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}): React.ReactNode {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-xs font-mono" style={{ color: "#64748b" }}>
        {label}
      </span>
      <span
        className="text-xs font-mono font-bold"
        style={{ color: "#e2e8f0" }}
      >
        {value}
      </span>
    </div>
  );
}

export interface CampusSidebarProps {
  runs: Run[];
  hotDeskCount: number;
}

export function CampusSidebar({
  runs,
  hotDeskCount,
}: CampusSidebarProps): React.ReactNode {
  const activeRuns = runs.filter((r) => r.outcome === "in_progress");
  const totalMembers = runs.reduce(
    (sum, r) => sum + r.memberSessionIds.length,
    0,
  );
  const totalTasks = runs.reduce((sum, r) => sum + r.planTasks.length, 0);
  const doneTasks = runs.reduce(
    (sum, r) => sum + r.planTasks.filter((t) => t.status === "done").length,
    0,
  );

  const phaseBreakdown: Record<string, number> = {};
  for (const run of activeRuns) {
    phaseBreakdown[run.phase] = (phaseBreakdown[run.phase] ?? 0) + 1;
  }

  return (
    <aside
      className="flex flex-col gap-4 rounded-lg p-4"
      style={{
        background: "#0f172a",
        border: "1px solid #1e293b",
        minWidth: "160px",
        width: "180px",
        flexShrink: 0,
      }}
    >
      <h2 className="text-sm font-mono font-bold" style={{ color: "#94a3b8" }}>
        Campus
      </h2>

      <div className="flex flex-col gap-2">
        <StatRow label="runs" value={runs.length} />
        <StatRow label="active" value={activeRuns.length} />
        <StatRow label="hot-desk" value={hotDeskCount} />
        <StatRow label="agents" value={totalMembers} />
        {totalTasks > 0 && (
          <StatRow label="tasks" value={`${doneTasks}/${totalTasks}`} />
        )}
      </div>

      {Object.keys(phaseBreakdown).length > 0 && (
        <>
          <div style={{ height: "1px", background: "#1e293b" }} />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-mono" style={{ color: "#475569" }}>
              phases
            </span>
            {(["A", "B", "C", "D"] as const).map((phase) =>
              phaseBreakdown[phase] ? (
                <StatRow
                  key={phase}
                  label={`Phase ${phase}`}
                  value={phaseBreakdown[phase]}
                />
              ) : null,
            )}
          </div>
        </>
      )}
    </aside>
  );
}
