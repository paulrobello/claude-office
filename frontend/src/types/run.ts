export type RunPhase = "A" | "B" | "C" | "D" | "done";

export type RunOutcome =
  | "in_progress"
  | "completed"
  | "stuck"
  | "abandoned";

export type PlanTaskStatus = "todo" | "in_progress" | "done";

export interface PlanTask {
  id: string;
  title: string;
  status: PlanTaskStatus;
  assignedSessionId: string | null;
}

export interface RunStats {
  elapsedSeconds: number;
  phaseTimings: Record<string, number>;
}

export interface Run {
  runId: string;
  orchestratorSessionId: string | null;
  primaryRepo: string;
  workdocsDir: string;
  phase: RunPhase;
  startedAt: string;
  endedAt: string | null;
  outcome: RunOutcome;
  modelConfig: Record<string, string>;
  memberSessionIds: string[];
  planTasks: PlanTask[];
  stats: RunStats;
  tokenUsage: Record<string, unknown> | null;
  costUsd: number | null;
}
