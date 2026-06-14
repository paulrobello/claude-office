import { describe, it, expect } from "vitest";
import type {
  CoordTask,
  HitlPrompt,
} from "../src/components/coordination/coordinationApi";
import {
  deriveStatus,
  statusGroup,
  groupAndSortTasks,
  queueRank,
  formatStuckTime,
  needYouCount,
  idleSince,
  applyStartedOverride,
  startedOverrideSettled,
  DEFAULT_IDLE_ALERT_MS,
} from "../src/components/coordination/taskStatus";

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

describe("deriveStatus", () => {
  it("CLOSED → done", () => {
    expect(deriveStatus(baseTask({ state: "CLOSED" }), [])).toBe("done");
  });
  it("label parked → parked (tirada da fila pelo CEO — status próprio, NÃO done)", () => {
    expect(
      deriveStatus(baseTask({ labels: ["parked", "area:trackers"] }), []),
    ).toBe("parked");
  });
  it("claim in_progress → running (precede pendente)", () => {
    const t = baseTask({ claim_status: "in_progress", labels: ["hitl"] });
    expect(deriveStatus(t, [pendingPrompt(t.source_ref)])).toBe("running");
  });
  it("run running → running", () => {
    expect(deriveStatus(baseTask({ run_status: "running" }), [])).toBe(
      "running",
    );
  });
  it("prompt HITL pendente → pending", () => {
    const t = baseTask({});
    expect(deriveStatus(t, [pendingPrompt(t.source_ref)])).toBe("pending");
  });
  it("label hitl no GitHub → pending", () => {
    expect(deriveStatus(baseTask({ labels: ["hitl"] }), [])).toBe("pending");
  });
  it("claim claimed (não iniciado) → waiting_agent", () => {
    expect(deriveStatus(baseTask({ claim_status: "claimed" }), [])).toBe(
      "waiting_agent",
    );
  });
  it("run error sem claim ativo → error", () => {
    expect(deriveStatus(baseTask({ run_status: "error" }), [])).toBe("error");
  });
  it("run timeout → error", () => {
    expect(deriveStatus(baseTask({ run_status: "timeout" }), [])).toBe("error");
  });
  it("OPEN afk ocioso (sem wip/claim) → sem_agente", () => {
    expect(deriveStatus(baseTask({ labels: ["afk"] }), [])).toBe("sem_agente");
  });
  it("OPEN afk + area:* (sem wip/claim) → sem_agente", () => {
    expect(deriveStatus(baseTask({ labels: ["afk", "area:office"] }), [])).toBe(
      "sem_agente",
    );
  });
  it("OPEN afk + epic → epic (guarda-chuva sai da fila ativa, fora do dispatch)", () => {
    expect(
      deriveStatus(baseTask({ labels: ["afk", "epic", "area:office"] }), []),
    ).toBe("epic");
  });
  it("OPEN afk + label wip órfão → todo (não conta como sem-agente)", () => {
    expect(deriveStatus(baseTask({ labels: ["afk", "wip"] }), [])).toBe("todo");
  });
  it("OPEN com area:* mas SEM afk → todo (não é sem-agente)", () => {
    expect(deriveStatus(baseTask({ labels: ["area:office"] }), [])).toBe(
      "todo",
    );
  });
  it("OPEN sem label de área → sem_dono (órfã)", () => {
    expect(deriveStatus(baseTask({ labels: [] }), [])).toBe("sem_dono");
  });
});

describe("statusGroup", () => {
  it("pending e error → need_you", () => {
    expect(statusGroup("pending")).toBe("need_you");
    expect(statusGroup("error")).toBe("need_you");
  });
  it("running e waiting_agent → in_progress", () => {
    expect(statusGroup("running")).toBe("in_progress");
    expect(statusGroup("waiting_agent")).toBe("in_progress");
  });
  it("todo, sem_dono e sem_agente → queue", () => {
    expect(statusGroup("todo")).toBe("queue");
    expect(statusGroup("sem_dono")).toBe("queue");
    expect(statusGroup("sem_agente")).toBe("queue");
  });
  it("done → history", () => {
    expect(statusGroup("done")).toBe("history");
  });
});

describe("groupAndSortTasks", () => {
  it("separa em 3 grupos vivos, exclui done, ordena por número asc", () => {
    const tasks = [
      baseTask({ number: 30, state: "CLOSED", source_ref: "r30" }), // done → fora
      baseTask({ number: 20, run_status: "error", source_ref: "r20" }), // need_you
      baseTask({ number: 5, run_status: "error", source_ref: "r5" }), // need_you
      baseTask({ number: 10, claim_status: "in_progress", source_ref: "r10" }), // in_progress
      baseTask({ number: 7, labels: ["afk"], source_ref: "r7" }), // queue
    ];
    const g = groupAndSortTasks(tasks, []);
    expect(g.need_you.map((t) => t.number)).toEqual([5, 20]);
    expect(g.in_progress.map((t) => t.number)).toEqual([10]);
    expect(g.queue.map((t) => t.number)).toEqual([7]);
  });
});

describe("queueRank + ordem da fila", () => {
  it("fila:topo=0, fila:fim=2, normal=1", () => {
    expect(queueRank(baseTask({ labels: ["fila:topo"] }))).toBe(0);
    expect(queueRank(baseTask({ labels: ["fila:fim"] }))).toBe(2);
    expect(queueRank(baseTask({ labels: ["afk"] }))).toBe(1);
  });
  it("fila ordena topo → chegada(nº) → fim", () => {
    const tasks = [
      baseTask({ number: 50, labels: ["afk"], source_ref: "r50" }),
      baseTask({ number: 10, labels: ["afk", "fila:fim"], source_ref: "r10" }),
      baseTask({ number: 90, labels: ["afk", "fila:topo"], source_ref: "r90" }),
      baseTask({ number: 20, labels: ["afk"], source_ref: "r20" }),
    ];
    const g = groupAndSortTasks(tasks, []);
    // topo(90) primeiro; meio por nº (20, 50); fim(10) por último
    expect(g.queue.map((t) => t.number)).toEqual([90, 20, 50, 10]);
  });
});

describe("formatStuckTime", () => {
  const now = Date.parse("2026-06-01T12:00:00Z");
  it("menos de 1h", () => {
    const r = formatStuckTime("2026-06-01T11:30:00Z", now, 4 * 3600_000);
    expect(r.label).toBe("30min");
    expect(r.overdue).toBe(false);
  });
  it("horas", () => {
    expect(
      formatStuckTime("2026-06-01T10:00:00Z", now, 4 * 3600_000).label,
    ).toBe("2h");
  });
  it("dias + overdue quando passa do limite", () => {
    const r = formatStuckTime("2026-05-31T06:00:00Z", now, 4 * 3600_000);
    expect(r.label).toBe("1d 6h");
    expect(r.overdue).toBe(true);
  });
  it("timestamp nulo → label vazio, não overdue", () => {
    expect(formatStuckTime(null, now, 4 * 3600_000)).toEqual({
      label: "",
      overdue: false,
    });
  });
});

describe("idleSince (tempo ocioso do sem-agente)", () => {
  it("usa o último release de wip (run_ended_at) quando houve run", () => {
    const t = baseTask({
      labels: ["afk"],
      run_ended_at: "2026-06-01T10:00:00Z",
      source_updated_at: "2026-06-01T09:00:00Z",
    });
    expect(idleSince(t)).toBe("2026-06-01T10:00:00Z");
  });
  it("cai pra source_updated_at quando nunca rodou", () => {
    const t = baseTask({
      labels: ["afk"],
      source_updated_at: "2026-06-01T08:00:00Z",
    });
    expect(idleSince(t)).toBe("2026-06-01T08:00:00Z");
  });
  it("threshold padrão de ocioso = 90min", () => {
    expect(DEFAULT_IDLE_ALERT_MS).toBe(90 * 60_000);
  });
});

describe("needYouCount", () => {
  it("conta pending + error", () => {
    const tasks = [
      baseTask({ run_status: "error", source_ref: "r1" }),
      baseTask({ labels: ["hitl"], source_ref: "r2" }),
      baseTask({ claim_status: "in_progress", source_ref: "r3" }),
    ];
    expect(needYouCount(tasks, [])).toBe(2);
  });
});

describe("applyStartedOverride (#839)", () => {
  const queued = baseTask({ labels: ["afk"], source_ref: "agents-ia#7" }); // sem_agente (queue)

  it("promove task na fila a running ('Em execução')", () => {
    const out = applyStartedOverride(queued, [], new Set(["agents-ia#7"]));
    expect(deriveStatus(out, [])).toBe("running");
    expect(statusGroup(deriveStatus(out, []))).toBe("in_progress");
  });

  it("não toca refs fora do Set", () => {
    const out = applyStartedOverride(queued, [], new Set(["outra#1"]));
    expect(out).toBe(queued);
    expect(deriveStatus(out, [])).toBe("sem_agente");
  });

  it("é no-op quando o real já saiu da fila (poll venceu)", () => {
    // claim real ativo → running de verdade; override não precisa mexer.
    const claimed = baseTask({
      claim_status: "in_progress",
      source_ref: "agents-ia#7",
    });
    const out = applyStartedOverride(claimed, [], new Set(["agents-ia#7"]));
    expect(out).toBe(claimed);
    // e erro real (need_you) NÃO é mascarado como running pelo override:
    const errored = baseTask({
      run_status: "error",
      source_ref: "agents-ia#7",
    });
    expect(applyStartedOverride(errored, [], new Set(["agents-ia#7"]))).toBe(
      errored,
    );
  });
});

describe("startedOverrideSettled (#839)", () => {
  it("false enquanto na fila, true quando o real avança", () => {
    const queued = baseTask({ labels: ["afk"] }); // sem_agente (queue)
    expect(startedOverrideSettled(queued, [])).toBe(false);
    expect(
      startedOverrideSettled(baseTask({ claim_status: "in_progress" }), []),
    ).toBe(true);
    expect(startedOverrideSettled(baseTask({ state: "CLOSED" }), [])).toBe(
      true,
    );
  });
});
