/**
 * Filtros multi-seleção da tela Tasks (#818).
 *
 * Três facetas — Status, Projeto/Área, Agente. Semântica:
 *  - Dentro de uma faceta = OR (marcar 2+ caixas → união).
 *  - Entre facetas = AND (interseção).
 *  - Faceta sem nenhuma caixa marcada = não filtra por ela (mostra tudo).
 *
 * As fechadas (`done`) ficam ESCONDIDAS por padrão: a faceta Status abre sem
 * `done` marcado, e a página só busca as CLOSED quando `done` é selecionado.
 * Aqui só tratamos a lógica de match; o lazy-fetch das fechadas é na página.
 */
import type { CoordTask, CoordAgent, HitlPrompt } from "./coordinationApi";
import { deriveStatus, type TaskStatus } from "./taskStatus";
import { PROJECT_TO_AREA_SHORT } from "./projectArea";

// ── Faceta Status ─────────────────────────────────────────────────────────
// Cada task cai em EXATAMENTE uma chave (partição total dos status derivados),
// espelhando os 7 status operacionais que o CEO definiu na #818.
export type StatusFacetKey =
  | "em_execucao" // running / waiting_agent (claim ativo, wip)
  | "sem_agente" // afk ocioso, pronto pro dispatch (#817)
  | "aguardando" // pending / error — precisa de você
  | "backlog" // backlog/parked + todo/unknown (na fila, sem agente ativo)
  | "epic" // guarda-chuva, não vai pro dispatch
  | "sem_dono" // OPEN sem area:* — órfã, ninguém responsável
  | "done"; // closed — escondida por padrão

/** Ordem de exibição das caixas da faceta Status. */
export const STATUS_FACET_ORDER: StatusFacetKey[] = [
  "em_execucao",
  "sem_agente",
  "aguardando",
  "backlog",
  "epic",
  "sem_dono",
  "done",
];

/** Mapeia uma task para a sua chave de faceta Status (total, 1 chave por task). */
export function statusFacetOf(
  task: CoordTask,
  hitlPrompts: HitlPrompt[],
): StatusFacetKey {
  const d: TaskStatus = deriveStatus(task, hitlPrompts);
  switch (d) {
    case "running":
    case "waiting_agent":
      return "em_execucao";
    case "pending":
    case "error":
      return "aguardando";
    case "sem_agente":
      return "sem_agente";
    case "done":
      return "done";
    case "sem_dono":
    case "todo":
    case "backlog":
    case "unknown":
      // epic sobrepõe os status "parados" (só quando não está ativo/fechado acima).
      if (task.labels.includes("epic")) return "epic";
      return d === "sem_dono" ? "sem_dono" : "backlog"; // backlog, todo, unknown
    default: {
      // Exaustividade: um TaskStatus novo não-mapeado vira erro de compilação
      // aqui (em vez de cair em "backlog" silenciosamente).
      const _exhaustive: never = d;
      return _exhaustive;
    }
  }
}

// ── Faceta Projeto/Área ─────────────────────────────────────────────────────
/** Nomes curtos das áreas (`area:front` → `front`). Vazio = sem dono. */
export function areaKeysOf(task: CoordTask): string[] {
  return task.labels
    .filter((l) => l.startsWith("area:"))
    .map((l) => l.slice("area:".length));
}

// ── Faceta Agente ───────────────────────────────────────────────────────────
/** Mapa área-curta → agentes do roster que a cobrem (pra derivar "dono" por área). */
export function buildAreaToAgents(agents: CoordAgent[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const a of agents) {
    if (a.archived_at) continue;
    for (const proj of a.projetos) {
      const area = PROJECT_TO_AREA_SHORT[proj];
      if (!area) continue;
      const list = m.get(area) ?? [];
      if (!list.includes(a.nome)) list.push(a.nome);
      m.set(area, list);
    }
  }
  return m;
}

/** Agentes ligados a uma task: claim ativo, último run e os donos da área. */
export function agentKeysOf(
  task: CoordTask,
  areaToAgents: Map<string, string[]> = new Map(),
): string[] {
  const s = new Set<string>();
  if (task.claim_agent) s.add(task.claim_agent);
  if (task.run_agent) s.add(task.run_agent);
  for (const area of areaKeysOf(task))
    for (const ag of areaToAgents.get(area) ?? []) s.add(ag);
  return [...s];
}

// ── Estado do filtro + match ────────────────────────────────────────────────
export interface TaskFilters {
  status: Set<StatusFacetKey>;
  area: Set<string>;
  agent: Set<string>;
}

export function emptyFilters(): TaskFilters {
  return { status: new Set(), area: new Set(), agent: new Set() };
}

/** Por padrão, mostra as fechadas? Só quando `done` está marcado. */
export function showsClosed(f: TaskFilters): boolean {
  return f.status.has("done");
}

/** AND entre facetas, OR dentro de cada faceta. Faceta vazia = sem restrição. */
export function matchesFilters(
  task: CoordTask,
  hitlPrompts: HitlPrompt[],
  f: TaskFilters,
  areaToAgents: Map<string, string[]> = new Map(),
): boolean {
  if (f.status.size && !f.status.has(statusFacetOf(task, hitlPrompts)))
    return false;
  if (f.area.size) {
    const areas = areaKeysOf(task);
    if (!areas.some((a) => f.area.has(a))) return false;
  }
  if (f.agent.size) {
    const agents = agentKeysOf(task, areaToAgents);
    if (!agents.some((a) => f.agent.has(a))) return false;
  }
  return true;
}

export type FacetName = "status" | "area" | "agent";

/** Toggle imutável de uma caixa numa faceta (devolve novos Sets/objeto). */
export function toggleFacet(
  f: TaskFilters,
  facet: FacetName,
  value: string,
): TaskFilters {
  const next: TaskFilters = {
    status: new Set(f.status),
    area: new Set(f.area),
    agent: new Set(f.agent),
  };
  const set = next[facet] as Set<string>;
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return next;
}

// ── Contadores por opção (bom de ter) ───────────────────────────────────────
/**
 * Quantas tasks cairiam em cada opção de uma faceta, respeitando as OUTRAS
 * facetas já marcadas (contagem de busca facetada padrão). A própria faceta
 * não se filtra — por isso dá pra ver o efeito de marcar mais uma caixa.
 */
export function facetCounts(
  facet: FacetName,
  tasks: CoordTask[],
  hitlPrompts: HitlPrompt[],
  f: TaskFilters,
  areaToAgents: Map<string, string[]> = new Map(),
): Record<string, number> {
  const others: TaskFilters = {
    status: facet === "status" ? new Set() : f.status,
    area: facet === "area" ? new Set() : f.area,
    agent: facet === "agent" ? new Set() : f.agent,
  };
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  for (const t of tasks) {
    if (!matchesFilters(t, hitlPrompts, others, areaToAgents)) continue;
    if (facet === "status") bump(statusFacetOf(t, hitlPrompts));
    else if (facet === "area") {
      const areas = areaKeysOf(t);
      if (areas.length === 0) continue;
      for (const a of areas) bump(a);
    } else for (const a of agentKeysOf(t, areaToAgents)) bump(a);
  }
  return counts;
}

// ── Serialização na URL (compartilhável + sobrevive reload) ─────────────────
const FACET_PARAM: Record<FacetName, string> = {
  status: "status",
  area: "area",
  agent: "agent",
};

/** Filtros → querystring (ex.: `?status=sem_agente,done&area=front`). */
export function filtersToQuery(f: TaskFilters): string {
  const p = new URLSearchParams();
  if (f.status.size) p.set(FACET_PARAM.status, [...f.status].join(","));
  if (f.area.size) p.set(FACET_PARAM.area, [...f.area].join(","));
  if (f.agent.size) p.set(FACET_PARAM.agent, [...f.agent].join(","));
  const s = p.toString();
  return s ? `?${s}` : "";
}

const STATUS_KEYS = new Set<string>(STATUS_FACET_ORDER);

/** Querystring → filtros (ignora chaves de status inválidas). */
export function filtersFromQuery(search: string): TaskFilters {
  const p = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const split = (v: string | null): string[] =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const status = new Set<StatusFacetKey>();
  for (const s of split(p.get(FACET_PARAM.status)))
    if (STATUS_KEYS.has(s)) status.add(s as StatusFacetKey);
  return {
    status,
    area: new Set(split(p.get(FACET_PARAM.area))),
    agent: new Set(split(p.get(FACET_PARAM.agent))),
  };
}
