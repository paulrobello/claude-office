/**
 * Cliente read-only das rotas de coordenação (backend F1, lê o Postgres :5433).
 * Isolado em coordination/* para não colidir com o conceito interno "task" do office.
 */

const BASE = "http://localhost:8000/api/v1/coordination";

export interface CoordTask {
  number: number;
  title: string | null;
  state: string | null;
  labels: string[];
  project: string | null;
  url: string | null;
  source_ref: string;
  source_updated_at: string | null;
  claim_status: string | null;
  claim_agent: string | null;
  claim_mechanism: string | null;
  claimed_at: string | null;
  run_status: string | null;
  run_started_at: string | null;
  run_ended_at: string | null;
  run_agent: string | null;
}

export interface CoordRun {
  id: number;
  source_ref: string | null;
  project: string | null;
  agent: string | null;
  session_id: string | null;
  mechanism: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  error_text: string | null;
  log_path: string | null;
  duration_seconds: number | null;
  issue_url: string | null;
  issue_title: string | null;
}

export interface CoordAgent {
  nome: string;
  role: string;
  projetos: string[];
  mode: string;
  contratado_em: string | null;
  last_active_at: string | null;
  status: string;
  active_claims: number;
  queued_requests: number;
}

export interface CoordDashboard {
  github: { open: number; closed: number; total: number };
  database: { activeClaims: number; runsByStatus: Record<string, number> };
  closedByPeriod: {
    period: string;
    tz: string;
    buckets: { period: string; n: number }[];
  };
  openByProject: { project: string; n: number }[];
  health: {
    component: string;
    status: string;
    last_run: string | null;
    min_ago: number | null;
    error_text: string | null;
  }[];
}

/** Lançado quando o backend devolve 503 (DB de coordenação fora). */
export class CoordUnavailableError extends Error {
  constructor() {
    super("coordination_db_unavailable");
    this.name = "CoordUnavailableError";
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (res.status === 503) throw new CoordUnavailableError();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const fetchTasks = (qs = ""): Promise<{ tasks: CoordTask[] }> =>
  getJson<{ tasks: CoordTask[] }>(`/tasks${qs}`);

export const fetchRuns = (qs = ""): Promise<{ runs: CoordRun[] }> =>
  getJson<{ runs: CoordRun[] }>(`/agent-runs${qs}`);

export const fetchDashboard = (qs = ""): Promise<CoordDashboard> =>
  getJson<CoordDashboard>(`/dashboard${qs}`);

export const fetchAgents = (qs = ""): Promise<{ agents: CoordAgent[] }> =>
  getJson<{ agents: CoordAgent[] }>(`/agents${qs}`);

// ── HITL (human-in-the-loop): prompts que aguardam resposta do usuário ──────
export type HitlKind = "yesno" | "choice" | "multi" | "text";

export interface HitlOption {
  key: string;
  label: string;
}

export interface HitlPrompt {
  id: number;
  source_ref: string | null;
  session_id: string | null;
  agent: string | null;
  project: string | null;
  question: string;
  context: string | null;
  kind: HitlKind;
  options: HitlOption[] | null;
  status: "pending" | "answered" | "expired";
  answer: boolean | string | string[] | null;
  created_at: string;
  expires_at: string | null;
  issue_title: string | null;
  issue_url: string | null;
}

export type HitlAnswerValue = boolean | string | string[];

export const fetchHitlPending = (): Promise<{ prompts: HitlPrompt[] }> =>
  getJson<{ prompts: HitlPrompt[] }>(`/hitl?status=pending`);

export async function answerHitl(
  id: number,
  answer: HitlAnswerValue,
  answeredBy = "web",
): Promise<void> {
  const res = await fetch(`${BASE}/hitl/${id}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer, answered_by: answeredBy }),
  });
  if (res.status === 503) throw new CoordUnavailableError();
  if (res.status === 409) throw new Error("hitl_already_resolved");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
