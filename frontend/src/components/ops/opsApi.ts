/**
 * Cliente das rotas de ops/deploy (backend Task: /api/v1/ops/*).
 * Segue a convenção do app: BASE absoluta para o backend local (mesma do
 * coordinationApi.ts), não path relativo.
 */

export interface Destination {
  id: string;
  label: string;
  ssh_alias: string;
  remote_base: string;
  compose_file: string;
  front_api_url: string;
  registry: string;
  image_tag: string;
  enabled: boolean;
}

export interface OpsStatus {
  running: boolean;
  run_id: string | null;
  dest_id: string | null;
  dry_run: boolean;
  step: "idle" | "build" | "deploy" | "done" | "failed";
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  log_tail: string[];
}

const BASE = "http://localhost:8000/api/v1/ops";

export async function listDestinations(): Promise<Destination[]> {
  const r = await fetch(`${BASE}/destinations`);
  if (!r.ok) throw new Error("falha ao listar destinos");
  return r.json();
}

export async function createDestination(d: Destination): Promise<Destination> {
  const r = await fetch(`${BASE}/destinations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  });
  if (!r.ok) throw new Error((await readDetailError(r)) ?? "falha ao criar");
  return r.json();
}

export async function updateDestination(d: Destination): Promise<Destination> {
  const r = await fetch(`${BASE}/destinations/${d.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  });
  if (!r.ok) throw new Error((await readDetailError(r)) ?? "falha ao editar");
  return r.json();
}

export async function deleteDestination(id: string): Promise<void> {
  const r = await fetch(`${BASE}/destinations/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error((await readDetailError(r)) ?? "falha ao remover");
}

export interface RunResult {
  run_id: string;
  dest_id: string;
  dry_run: boolean;
  alreadyRunning?: boolean;
}

export async function runDeploy(
  destId: string,
  dryRun: boolean,
): Promise<RunResult> {
  const r = await fetch(`${BASE}/${destId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dry_run: dryRun }),
  });
  if (r.status === 409) {
    const body = (await r.json()) as {
      detail?: { run_id?: string };
    };
    return {
      run_id: body?.detail?.run_id ?? "",
      dest_id: destId,
      dry_run: dryRun,
      alreadyRunning: true,
    };
  }
  if (!r.ok) throw new Error("falha ao iniciar deploy");
  return r.json();
}

export async function getStatus(): Promise<OpsStatus> {
  const r = await fetch(`${BASE}/status`);
  if (!r.ok) throw new Error("falha ao obter status");
  return r.json();
}

/** Extrai `detail.error` do corpo de erro do backend (best-effort). */
async function readDetailError(r: Response): Promise<string | undefined> {
  try {
    const j = (await r.json()) as { detail?: { error?: string } };
    return j?.detail?.error;
  } catch {
    return undefined;
  }
}
