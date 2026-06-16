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
  claim_model: string | null;
  run_status: string | null;
  run_started_at: string | null;
  run_ended_at: string | null;
  run_agent: string | null;
  run_model: string | null;
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
  cron_expr: string | null;
  enabled: boolean;
  archived_at: string | null;
  model: string | null;
  effort_level: string | null;
  thinking_enabled: boolean | null;
  current_ref: string | null;
  current_title: string | null;
  recent_done: { ref: string | null; at: string | null }[];
}

export interface CoordAgentMetrics {
  project: string;
  total: number;
  success: number;
  error: number;
  timeout: number;
  running: number;
  success_rate: number | null; // fração 0..1
  avg_duration_seconds: number | null;
  p50_duration_seconds: number | null;
  last_run_at: string | null;
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

/** Cria issue real no agents-ia (via `gh` no backend). Retorna a URL criada. */
export async function createTask(input: {
  title: string;
  body?: string;
  agent?: string;
  labels?: string[];
}): Promise<{ url: string }> {
  const res = await fetch(`${BASE}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 503) throw new CoordUnavailableError();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as {
        detail?: { message?: string; error?: string };
      };
      msg = j?.detail?.message ?? j?.detail?.error ?? msg;
    } catch {
      /* mantém msg padrão */
    }
    throw new Error(msg);
  }
  return (await res.json()) as { url: string };
}

/** Responde uma issue HITL (label-only) IN-SYSTEM: posta comentário + relabela
 *  hitl→afk. O dev-loop lê os comentários, então a resposta chega na implementação. */
export async function respondTask(
  sourceRef: string,
  response: string,
  relabelAfk = true,
): Promise<{ ok: boolean; issue: number }> {
  const res = await fetch(
    `${BASE}/tasks/${encodeURIComponent(sourceRef)}/respond`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response, relabel_afk: relabelAfk }),
    },
  );
  if (res.status === 503) throw new CoordUnavailableError();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as {
        detail?: { message?: string; error?: string };
      };
      msg = j?.detail?.message ?? j?.detail?.error ?? msg;
    } catch {
      /* mantém msg padrão */
    }
    throw new Error(msg);
  }
  return (await res.json()) as { ok: boolean; issue: number };
}

/** Linha da caixa de pedidos (`requests` :5433) — alimenta o detector de gargalo. */
export interface CoordRequest {
  id: number;
  from_kind: string;
  from_ref: string | null;
  to_role: string | null;
  to_agent: string | null;
  kind: string;
  payload: Record<string, unknown> | null;
  status: string;
  queued_at: string;
}

/**
 * Convoca um agente: grava um pedido na caixa (`requests`) — produtor que acende
 * o detector de gargalo. Alvo por função (to_role) OU por agente (to_agent).
 */
export async function createRequest(input: {
  to_role?: string;
  to_agent?: string;
  kind?: "work" | "question" | "meeting";
  payload?: Record<string, unknown>;
}): Promise<{ request: CoordRequest }> {
  const res = await fetch(`${BASE}/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 503) throw new CoordUnavailableError();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as {
        detail?: { message?: string; error?: string };
      };
      msg = j?.detail?.message ?? j?.detail?.error ?? msg;
    } catch {
      /* mantém msg padrão */
    }
    throw new Error(msg);
  }
  return (await res.json()) as { request: CoordRequest };
}

/**
 * Contrata/atualiza um agente no roster (upsert por nome). Caminho do cockpit pra
 * contratação manual pelo CEO — par do hire-executor (lado coletor, via HITL).
 */
export async function createAgent(input: {
  nome: string;
  role: string;
  projetos?: string[];
  mode?: "on-demand" | "persistent-24-7";
  model?: string | null;
  effort_level?: string | null;
  thinking_enabled?: boolean | null;
}): Promise<{ agent: CoordAgent }> {
  const res = await fetch(`${BASE}/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 503) throw new CoordUnavailableError();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as {
        detail?: { message?: string; error?: string };
      };
      msg = j?.detail?.message ?? j?.detail?.error ?? msg;
    } catch {
      /* mantém msg padrão */
    }
    throw new Error(msg);
  }
  return (await res.json()) as { agent: CoordAgent };
}

export const fetchRuns = (qs = ""): Promise<{ runs: CoordRun[] }> =>
  getJson<{ runs: CoordRun[] }>(`/agent-runs${qs}`);

export const fetchDashboard = (qs = ""): Promise<CoordDashboard> =>
  getJson<CoordDashboard>(`/dashboard${qs}`);

export interface CoordFlowHealth {
  hours: number;
  runs: number;
  by_status: Record<string, number>;
  tokens: { input: number; output: number; cost_usd: number };
  slots_active: number;
  by_agent: { agent: string; runs: number; cost_usd: number }[];
}

export const fetchFlowHealth = (hours = 24): Promise<CoordFlowHealth> =>
  getJson<CoordFlowHealth>(`/flow-health?hours=${hours}`);

/** PR aberto (estado vivo do GitHub, fora do mirror). */
export interface CoordOpenPr {
  number: number;
  title: string;
  url: string;
  created_at: string;
  /** Head atual tem veredito QA ✅ GO (#843) — gateia QA vs DevOps no PrModal. */
  qa_approved: boolean;
}
export interface CoordOpenPrsByProject {
  repo: string;
  project: string;
  count: number;
  /** Agente QA que analisa o PR deste projeto (do roster). */
  reviewer: string | null;
  reviewer_cron: string | null;
  /** Previsão do início da próxima análise (próximo tick do cron do QA), ISO. */
  next_review_at: string | null;
  next_review_in_min: number | null;
  prs: CoordOpenPr[];
}
export interface CoordOpenPrs {
  total: number;
  by_project: CoordOpenPrsByProject[];
  stale?: boolean;
  error?: string;
}

/** PRs abertos em todos os repos de código (org hmtrack). Fetch ao vivo via gh
 *  no backend, com cache curto. Nunca lança 503 (degrade: total=0). */
export const fetchOpenPrs = (): Promise<CoordOpenPrs> =>
  getJson<CoordOpenPrs>(`/open-prs`);

export const fetchAgents = (qs = ""): Promise<{ agents: CoordAgent[] }> =>
  getJson<{ agents: CoordAgent[] }>(`/agents${qs}`);

/** Métricas de performance agregadas por projeto (#382 passo 2). */
export const fetchAgentMetrics = (
  qs = "",
): Promise<{ metrics: CoordAgentMetrics[] }> =>
  getJson<{ metrics: CoordAgentMetrics[] }>(`/agents/metrics${qs}`);

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
  recommended_key: string | null;
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

/** Poll de um prompt HITL específico — acompanha uma reunião até o agente responder. */
export const fetchHitlPrompt = (id: number): Promise<{ prompt: HitlPrompt }> =>
  getJson<{ prompt: HitlPrompt }>(`/hitl/${id}`);

/**
 * Reunião CEO→agente (#547): clicar num agente no mapa cria um hitl_prompt
 * DIRECIONADO (kind=text, session_id='cockpit-meeting', 24h). O agente lê no próximo
 * ciclo (`hitl.py inbox`) e responde FOREGROUND (`hitl.py reply`); a resposta volta
 * ao cockpit via fetchHitlPrompt. Ponte HITL (decisão CEO "Opção B").
 */
export async function createMeeting(input: {
  agent: string;
  message: string;
  project?: string;
}): Promise<{ prompt: HitlPrompt }> {
  const res = await fetch(`${BASE}/meeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 503) throw new CoordUnavailableError();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as {
        detail?: { message?: string; error?: string };
      };
      msg = j?.detail?.message ?? j?.detail?.error ?? msg;
    } catch {
      /* mantém msg padrão */
    }
    throw new Error(msg);
  }
  return (await res.json()) as { prompt: HitlPrompt };
}

// ── Mutações de agentes (PATCH / archive / restore / delete) ─────────────────

async function mutate<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 503) throw new CoordUnavailableError();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as {
        detail?: { error?: string; message?: string };
      };
      msg = j?.detail?.error ?? j?.detail?.message ?? msg;
    } catch {
      /* mantém */
    }
    throw new Error(msg);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const patchAgent = (
  nome: string,
  patch: Partial<{
    role: string;
    projetos: string[];
    mode: string;
    cron_expr: string | null;
    enabled: boolean;
    model: string | null;
    effort_level: string | null;
    thinking_enabled: boolean | null;
  }>,
): Promise<{ agent: CoordAgent }> =>
  mutate(`/agents/${encodeURIComponent(nome)}`, "PATCH", patch);

export const archiveAgent = (nome: string): Promise<{ agent: CoordAgent }> =>
  mutate(`/agents/${encodeURIComponent(nome)}/archive`, "POST");

export const restoreAgent = (nome: string): Promise<{ agent: CoordAgent }> =>
  mutate(`/agents/${encodeURIComponent(nome)}/restore`, "POST");

export const deleteAgent = (nome: string): Promise<void> =>
  mutate(`/agents/${encodeURIComponent(nome)}`, "DELETE");

// ── Botão Play (#833): disparar agente/issue AGORA, sem esperar o cron ──────────
/** Resultado do Play do AGENTE: roda 1 ciclo do loop agora. */
export interface RunAgentResult {
  status: "started" | "already_running";
  agent: string;
  pid?: number;
  claim_key?: string | null;
}

/** Resultado do Play da TASK: despacha a issue agora (custa tokens). */
export interface DispatchIssueResult {
  status: "started" | "already_running" | "cap_full" | "closed";
  issue: number;
  project?: string;
  agent?: string | null;
  pid?: number;
  active?: number;
  cap?: number;
}

/**
 * ▶ Play no AGENTE: roda o loop do agente AGORA (1 ciclo), sem esperar o cron.
 * Aditivo ao agendamento. Respeita o loop-claim (already_running) — não força 2º.
 */
export const runAgentNow = (nome: string): Promise<RunAgentResult> =>
  mutate(`/agents/${encodeURIComponent(nome)}/run`, "POST");

/**
 * ▶ Play na TASK: despacha a issue #n AGORA (dispara `claude -p` → custa tokens).
 * Respeita claim ativo (already_running) e DISPATCH_CAP (cap_full). Confirme antes
 * de chamar (a UI pede confirmação). `agent` opcional (#851) força um agente
 * específico (entre os que cobrem a área); sem ele, usa o dono da área.
 */
export const dispatchIssueNow = (
  n: number,
  agent?: string,
): Promise<DispatchIssueResult> =>
  mutate(`/issues/${n}/dispatch`, "POST", agent ? { agent } : undefined);

/** Skip/Retry do cockpit: aplica label de prioridade (fila:topo/fila:fim) via backend. */
export const setTaskPriority = (
  sourceRef: string,
  rank: "top" | "bottom",
): Promise<{ source_ref: string; label: string }> =>
  mutate(`/tasks/${encodeURIComponent(sourceRef)}/priority`, "POST", { rank });

/** Aprovar pendência label `hitl`: libera pro agente (hitl→afk) via backend. */
export const approveTask = (
  sourceRef: string,
): Promise<{ source_ref: string; action: string }> =>
  mutate(`/tasks/${encodeURIComponent(sourceRef)}/approve`, "POST");

/** Aprovar um item do BACKLOG p/ desenvolvimento: remove `backlogs` + adiciona
 *  `afk` via backend — sai do someday e entra na fila do dispatch. */
export const approveBacklog = (
  sourceRef: string,
): Promise<{ source_ref: string; action: string }> =>
  mutate(`/tasks/${encodeURIComponent(sourceRef)}/approve-backlog`, "POST");

/** Reativar uma task PARKED: remove `parked` + adiciona `afk` via backend — sai da
 *  geladeira (grupo history) e volta pra fila do dispatch. Inverso do `/remove`. */
export const reactivateParked = (
  sourceRef: string,
): Promise<{ source_ref: string; action: string }> =>
  mutate(`/tasks/${encodeURIComponent(sourceRef)}/reactivate-parked`, "POST");

/** Atribuir dono (#840): issue sem `area:*` (ou afk ociosa) ganha `area:<x>`+`afk`
 *  via backend — sai de "Sem dono"/"Sem agente" e entra na fila do dispatch. */
export const assignArea = (
  sourceRef: string,
  area: string,
): Promise<{ source_ref: string; action: string; labels: string }> =>
  mutate(`/tasks/${encodeURIComponent(sourceRef)}/assign-area`, "POST", {
    area,
  });

/** Remover da fila de dispatch: tira o label afk via backend. */
export const removeFromQueue = (
  sourceRef: string,
): Promise<{ source_ref: string; action: string }> =>
  mutate(`/tasks/${encodeURIComponent(sourceRef)}/remove`, "POST");

// ── Detalhe da task (corpo da issue ao vivo) + notas do CEO ──────────────────
export interface TaskNote {
  id: number;
  note: string;
  created_by: string;
  created_at: string;
  consumed_at: string | null;
}

export interface TaskDetail {
  source_ref: string;
  title: string | null;
  url: string | null;
  body: string;
  notes: TaskNote[];
}

export const fetchTaskDetail = (sourceRef: string): Promise<TaskDetail> =>
  getJson<TaskDetail>(`/tasks/${encodeURIComponent(sourceRef)}/detail`);

/** Grava uma nota livre do CEO pra task (lida pelo agente no início — via dispatch). */
export const addTaskNote = (
  sourceRef: string,
  note: string,
  createdBy = "web",
): Promise<{ id: number; source_ref: string; created_at: string }> =>
  mutate(`/tasks/${encodeURIComponent(sourceRef)}/note`, "POST", {
    note,
    created_by: createdBy,
  });

// ── Agent Functions ───────────────────────────────────────────────────────────

export interface AgentJobStatus {
  job_id: string
  agent_nome: string
  function_id: string
  status: 'running' | 'done' | 'failed'
  progress: number
  message: string
  error?: string
}

export async function execAgentFunction(
  agentNome: string,
  functionId: string,
): Promise<{ job_id: string }> {
  const resp = await fetch('/api/v1/coordination/agent-functions/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_nome: agentNome, function_id: functionId }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail ?? `HTTP ${resp.status}`)
  }
  return resp.json()
}

export async function getAgentJob(jobId: string): Promise<AgentJobStatus> {
  const resp = await fetch(`/api/v1/coordination/agent-functions/jobs/${jobId}`)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}
