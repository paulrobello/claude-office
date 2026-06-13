import { describe, it, expect } from "vitest";
import type {
  CoordTask,
  CoordAgent,
  HitlPrompt,
} from "../src/components/coordination/coordinationApi";
import {
  statusFacetOf,
  areaKeysOf,
  agentKeysOf,
  buildAreaToAgents,
  matchesFilters,
  toggleFacet,
  emptyFilters,
  showsClosed,
  facetCounts,
  filtersToQuery,
  filtersFromQuery,
  STATUS_FACET_ORDER,
  type TaskFilters,
  type StatusFacetKey,
} from "../src/components/coordination/taskFilters";

const baseTask = (over: Partial<CoordTask>): CoordTask => ({
  number: 1,
  title: "t",
  state: "OPEN",
  labels: [],
  project: "p",
  url: null,
  source_ref: "agents-ia#1",
  source_updated_at: null,
  claim_status: null,
  claim_agent: null,
  claim_mechanism: null,
  claimed_at: null,
  claim_model: null,
  run_status: null,
  run_started_at: null,
  run_ended_at: null,
  run_agent: null,
  run_model: null,
  ...over,
});

const pendingPrompt = (ref: string): HitlPrompt => ({
  id: 1,
  source_ref: ref,
  session_id: null,
  agent: "a",
  project: "p",
  question: "q?",
  context: null,
  kind: "yesno",
  options: null,
  recommended_key: null,
  status: "pending",
  answer: null,
  created_at: "2026-06-01T00:00:00Z",
  expires_at: null,
  issue_title: null,
  issue_url: null,
});

const agent = (over: Partial<CoordAgent>): CoordAgent => ({
  nome: "dev-front",
  role: "dev-loop",
  projetos: ["hmtrack-front"],
  mode: "on-demand",
  contratado_em: null,
  last_active_at: null,
  status: "idle",
  active_claims: 0,
  queued_requests: 0,
  cron_expr: null,
  enabled: true,
  archived_at: null,
  model: null,
  effort_level: null,
  thinking_enabled: null,
  current_ref: null,
  current_title: null,
  recent_done: [],
  ...over,
});

const filters = (over: Partial<TaskFilters> = {}): TaskFilters => ({
  ...emptyFilters(),
  ...over,
});

describe("statusFacetOf", () => {
  it("running / waiting_agent → em_execucao", () => {
    expect(statusFacetOf(baseTask({ run_status: "running" }), [])).toBe(
      "em_execucao",
    );
    expect(statusFacetOf(baseTask({ claim_status: "claimed" }), [])).toBe(
      "em_execucao",
    );
  });
  it("pending / error → aguardando", () => {
    const t = baseTask({});
    expect(statusFacetOf(t, [pendingPrompt(t.source_ref)])).toBe("aguardando");
    expect(statusFacetOf(baseTask({ run_status: "error" }), [])).toBe(
      "aguardando",
    );
  });
  it("afk ocioso → sem_agente", () => {
    expect(statusFacetOf(baseTask({ labels: ["afk"] }), [])).toBe("sem_agente");
  });
  it("closed → done", () => {
    expect(statusFacetOf(baseTask({ state: "CLOSED" }), [])).toBe("done");
  });
  it("epic OPEN parado → epic (sobrepõe backlog/sem_dono)", () => {
    expect(
      statusFacetOf(baseTask({ labels: ["epic", "area:front"] }), []),
    ).toBe("epic");
    expect(statusFacetOf(baseTask({ labels: ["epic"] }), [])).toBe("epic");
  });
  it("OPEN sem area:* → sem_dono (órfã)", () => {
    expect(statusFacetOf(baseTask({ labels: [] }), [])).toBe("sem_dono");
  });
  it("todo / backlog → backlog", () => {
    expect(statusFacetOf(baseTask({ labels: ["area:front"] }), [])).toBe(
      "backlog",
    );
    expect(statusFacetOf(baseTask({ labels: ["backlogs"] }), [])).toBe(
      "backlog",
    );
  });
  it("cada task cai em exatamente 1 chave conhecida", () => {
    const t = baseTask({ labels: ["area:api"], claim_status: "in_progress" });
    expect(STATUS_FACET_ORDER).toContain(statusFacetOf(t, []));
  });
});

describe("areaKeysOf", () => {
  it("extrai nomes curtos das áreas", () => {
    expect(
      areaKeysOf(baseTask({ labels: ["area:front", "afk", "area:api"] })),
    ).toEqual(["front", "api"]);
  });
  it("sem area:* → vazio (órfã)", () => {
    expect(areaKeysOf(baseTask({ labels: ["afk"] }))).toEqual([]);
  });
});

describe("buildAreaToAgents + agentKeysOf", () => {
  it("mapeia área → agentes do roster", () => {
    const m = buildAreaToAgents([
      agent({ nome: "dev-front", projetos: ["hmtrack-front"] }),
      agent({ nome: "dev-api", projetos: ["hmtrack-api-py"] }),
    ]);
    expect(m.get("front")).toEqual(["dev-front"]);
    expect(m.get("api")).toEqual(["dev-api"]);
  });
  it("ignora agentes arquivados", () => {
    const m = buildAreaToAgents([
      agent({ nome: "old", projetos: ["hmtrack-front"], archived_at: "x" }),
    ]);
    expect(m.get("front")).toBeUndefined();
  });
  it("agentKeysOf reúne claim, run e donos da área", () => {
    const m = buildAreaToAgents([
      agent({ nome: "dev-front", projetos: ["hmtrack-front"] }),
    ]);
    const t = baseTask({
      labels: ["area:front"],
      claim_agent: "claimer",
      run_agent: "runner",
    });
    expect(agentKeysOf(t, m).sort()).toEqual(
      ["claimer", "dev-front", "runner"].sort(),
    );
  });
});

describe("matchesFilters", () => {
  it("faceta vazia = sem restrição", () => {
    expect(matchesFilters(baseTask({}), [], emptyFilters())).toBe(true);
  });
  it("OR dentro da faceta Status (union)", () => {
    const f = filters({
      status: new Set<StatusFacetKey>(["sem_agente", "sem_dono"]),
    });
    expect(matchesFilters(baseTask({ labels: ["afk"] }), [], f)).toBe(true); // sem_agente
    expect(matchesFilters(baseTask({ labels: [] }), [], f)).toBe(true); // sem_dono
    expect(
      matchesFilters(baseTask({ run_status: "running" }), [], f),
    ).toBe(false); // em_execucao não está marcado
  });
  it("AND entre facetas (Status ∩ Área)", () => {
    const f = filters({
      status: new Set<StatusFacetKey>(["sem_agente"]),
      area: new Set(["front"]),
    });
    expect(
      matchesFilters(baseTask({ labels: ["afk", "area:front"] }), [], f),
    ).toBe(true);
    // sem agente mas área errada → fora
    expect(
      matchesFilters(baseTask({ labels: ["afk", "area:api"] }), [], f),
    ).toBe(false);
  });
  it("filtra por agente (claim/run/área)", () => {
    const m = buildAreaToAgents([
      agent({ nome: "dev-front", projetos: ["hmtrack-front"] }),
    ]);
    const f = filters({ agent: new Set(["dev-front"]) });
    expect(
      matchesFilters(baseTask({ labels: ["area:front"] }), [], f, m),
    ).toBe(true);
    expect(
      matchesFilters(baseTask({ labels: ["area:api"] }), [], f, m),
    ).toBe(false);
  });
});

describe("showsClosed", () => {
  it("fechadas escondidas por padrão; só com done marcado", () => {
    expect(showsClosed(emptyFilters())).toBe(false);
    expect(
      showsClosed(filters({ status: new Set<StatusFacetKey>(["done"]) })),
    ).toBe(true);
  });
});

describe("toggleFacet", () => {
  it("liga e desliga imutavelmente", () => {
    const f0 = emptyFilters();
    const f1 = toggleFacet(f0, "status", "done");
    expect(f1.status.has("done")).toBe(true);
    expect(f0.status.has("done")).toBe(false); // imutável
    const f2 = toggleFacet(f1, "status", "done");
    expect(f2.status.has("done")).toBe(false);
  });
});

describe("facetCounts", () => {
  it("conta por opção respeitando as outras facetas", () => {
    const tasks = [
      baseTask({ labels: ["afk", "area:front"], source_ref: "r1" }),
      baseTask({ labels: ["afk", "area:api"], source_ref: "r2" }),
      baseTask({ labels: ["area:front"], source_ref: "r3" }), // backlog
    ];
    // sem filtro: front=2, api=1
    const c = facetCounts("area", tasks, [], emptyFilters());
    expect(c.front).toBe(2);
    expect(c.api).toBe(1);
    // com Status=sem_agente marcado, a contagem de área ignora a faceta área
    // mas respeita a de status → só os afk: front=1, api=1
    const f = filters({ status: new Set<StatusFacetKey>(["sem_agente"]) });
    const c2 = facetCounts("area", tasks, [], f);
    expect(c2.front).toBe(1);
    expect(c2.api).toBe(1);
  });
});

describe("URL serialization", () => {
  it("round-trip filtros ↔ querystring", () => {
    const f = filters({
      status: new Set<StatusFacetKey>(["sem_agente", "done"]),
      area: new Set(["front"]),
    });
    const qs = filtersToQuery(f);
    const back = filtersFromQuery(qs);
    expect([...back.status].sort()).toEqual(["done", "sem_agente"]);
    expect([...back.area]).toEqual(["front"]);
    expect(back.agent.size).toBe(0);
  });
  it("vazio → querystring vazia", () => {
    expect(filtersToQuery(emptyFilters())).toBe("");
  });
  it("ignora chaves de status inválidas", () => {
    const back = filtersFromQuery("?status=lixo,done");
    expect([...back.status]).toEqual(["done"]);
  });
});
