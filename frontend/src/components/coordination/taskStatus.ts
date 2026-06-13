import type { CoordTask, HitlPrompt } from "./coordinationApi";

export type TaskStatus =
  | "open"
  | "todo"
  | "sem_agente"
  | "pending"
  | "waiting_agent"
  | "running"
  | "error"
  | "done"
  | "backlog"
  | "unknown";

export type TaskGroup = "need_you" | "in_progress" | "queue" | "history";

const AREA_LABEL = /^area:|^afk$/;

/** Traduz os campos técnicos (issue + claim + run + hitl) num status humano. */
export function deriveStatus(
  task: CoordTask,
  hitlPrompts: HitlPrompt[],
): TaskStatus {
  if (task.state === "CLOSED") return "done";
  // Removida da fila pelo CEO (cockpit): sai dos grupos vivos como done/history.
  if (task.labels.includes("parked")) return "done";
  // Backlog (someday/longo prazo): sai da fila ativa e do "precisa de você" —
  // vive na lista de Backlog. Precede hitl/area (mesmo um backlog hitl é backlog).
  if (task.labels.includes("backlogs")) return "backlog";

  const claim = task.claim_status;
  if (claim === "in_progress" || task.run_status === "running")
    return "running";

  const hasPendingPrompt = hitlPrompts.some(
    (p) => p.source_ref === task.source_ref && p.status === "pending",
  );
  if (hasPendingPrompt || task.labels.includes("hitl")) return "pending";

  if (claim === "claimed") return "waiting_agent";

  if (task.run_status === "error" || task.run_status === "timeout")
    return "error";

  if (task.state === "OPEN") {
    // "Sem agente" (afk ocioso): pronto pro dispatch, só esperando o cron do
    // dev-loop. Fonte de verdade do "tem agente ativo" = label wip + claim em
    // work_claims (:5433) — ambos já excluídos acima (running/waiting_agent),
    // mas um label `wip` órfão (race, claim caiu) ainda pode estar presente, então
    // checamos explicitamente. `epic` é guarda-chuva, não vai pro dispatch.
    const hasAfk = task.labels.includes("afk");
    const blocked = task.labels.includes("wip") || task.labels.includes("epic");
    if (hasAfk && !blocked) return "sem_agente";
    return task.labels.some((l) => AREA_LABEL.test(l)) ? "todo" : "open";
  }
  return "unknown";
}

export function statusGroup(status: TaskStatus): TaskGroup {
  switch (status) {
    case "pending":
    case "error":
      return "need_you";
    case "running":
    case "waiting_agent":
      return "in_progress";
    case "sem_agente":
    case "todo":
    case "open":
    case "unknown":
      return "queue";
    case "done":
    case "backlog":
      return "history";
  }
}

export interface GroupedTasks {
  need_you: CoordTask[];
  in_progress: CoordTask[];
  queue: CoordTask[];
}

const byNumberAsc = (a: CoordTask, b: CoordTask): number => a.number - b.number;

/** Posição na fila: fila:topo primeiro (0), fila:fim por último (2), resto no meio (1). */
export function queueRank(t: CoordTask): number {
  if (t.labels.includes("fila:topo")) return 0;
  if (t.labels.includes("fila:fim")) return 2;
  return 1;
}

/** Agrupa as tasks vivas (exclui done). need_you/in_progress por nº; a FILA segue
 *  a ordem de despacho (fila:topo → meio → fila:fim), depois nº — pra numeração. */
export function groupAndSortTasks(
  tasks: CoordTask[],
  hitlPrompts: HitlPrompt[],
): GroupedTasks {
  const out: GroupedTasks = { need_you: [], in_progress: [], queue: [] };
  for (const t of tasks) {
    const g = statusGroup(deriveStatus(t, hitlPrompts));
    if (g === "history") continue;
    out[g].push(t);
  }
  out.need_you.sort(byNumberAsc);
  out.in_progress.sort(byNumberAsc);
  out.queue.sort((a, b) => queueRank(a) - queueRank(b) || a.number - b.number);
  return out;
}

export interface StuckTime {
  label: string;
  overdue: boolean;
}

/** Tempo decorrido desde `iso` até `nowMs`, com flag overdue acima de `limitMs`. */
export function formatStuckTime(
  iso: string | null,
  nowMs: number,
  limitMs: number,
): StuckTime {
  if (!iso) return { label: "", overdue: false };
  const elapsed = nowMs - Date.parse(iso);
  if (Number.isNaN(elapsed) || elapsed < 0)
    return { label: "", overdue: false };
  const min = Math.floor(elapsed / 60_000);
  const hours = Math.floor(min / 60);
  const days = Math.floor(hours / 24);
  let label: string;
  if (min < 60) label = `${min}min`;
  else if (hours < 24) label = `${hours}h`;
  else label = `${days}d ${hours - days * 24}h`;
  return { label, overdue: elapsed >= limitMs };
}

/** Quantas tasks estão no grupo "Precisa de você" (pending + error). */
export function needYouCount(
  tasks: CoordTask[],
  hitlPrompts: HitlPrompt[],
): number {
  return tasks.filter(
    (t) => statusGroup(deriveStatus(t, hitlPrompts)) === "need_you",
  ).length;
}

/** Limite padrão de SLA antes de marcar como atrasado: 4h. */
export const DEFAULT_SLA_MS = 4 * 3600_000;

/** Limite padrão de "ocioso demais" pro afk não despachado: ~3 ciclos do
 *  dev-loop (~90min). Acima disso = dev-loop possivelmente travado/sem slot. */
export const DEFAULT_IDLE_ALERT_MS = 90 * 60_000;

/** Desde quando uma task "sem agente" está ociosa: o último release de wip
 *  (run terminado) se houve run, senão a última transição de label (afk entrou).
 *  source_updated_at é o melhor proxy disponível pra "virou afk". */
export function idleSince(t: CoordTask): string | null {
  return t.run_ended_at ?? t.source_updated_at;
}
