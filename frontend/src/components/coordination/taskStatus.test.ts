import { describe, expect, it } from "vitest";

import type { CoordTask, HitlPrompt } from "./coordinationApi";
import { deriveStatus, isParked, statusGroup } from "./taskStatus";

function makeTask(overrides: Partial<CoordTask> = {}): CoordTask {
  return {
    number: 1,
    title: "t",
    state: "OPEN",
    labels: [],
    project: null,
    url: null,
    source_ref: "ref-1",
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
    ...overrides,
  };
}

function pendingPrompt(sourceRef: string): HitlPrompt {
  return {
    source_ref: sourceRef,
    status: "pending",
  } as HitlPrompt;
}

describe("deriveStatus — hitl false-positive guard (#841)", () => {
  it("hitl + afk → NOT pending (já decidida/em fila)", () => {
    const task = makeTask({ labels: ["hitl", "afk"] });
    expect(deriveStatus(task, [])).not.toBe("pending");
    expect(deriveStatus(task, [])).toBe("sem_agente");
  });

  it("hitl + wip → NOT pending (em execução)", () => {
    const task = makeTask({ labels: ["hitl", "wip"] });
    expect(deriveStatus(task, [])).not.toBe("pending");
  });

  it("hitl + epic → NOT pending (umbrella)", () => {
    const task = makeTask({ labels: ["hitl", "epic"] });
    expect(deriveStatus(task, [])).not.toBe("pending");
  });

  it("hitl puro (sem disposição) → pending (mantém)", () => {
    const task = makeTask({ labels: ["hitl"] });
    expect(deriveStatus(task, [])).toBe("pending");
  });

  it("hasPendingPrompt sem hitl → pending (mantém)", () => {
    const task = makeTask({ labels: [], source_ref: "ref-9" });
    expect(deriveStatus(task, [pendingPrompt("ref-9")])).toBe("pending");
  });

  it("hasPendingPrompt SEMPRE vence o guarda (hitl + afk + prompt pendente)", () => {
    const task = makeTask({ labels: ["hitl", "afk"], source_ref: "ref-9" });
    expect(deriveStatus(task, [pendingPrompt("ref-9")])).toBe("pending");
  });
});

describe("deriveStatus — epic sai da fila ativa (status próprio → history)", () => {
  it("epic OPEN parado → status epic (não todo/sem_dono)", () => {
    const task = makeTask({ labels: ["epic"] });
    expect(deriveStatus(task, [])).toBe("epic");
  });

  it("epic + afk → epic (NÃO sem_agente — não vai pro dispatch)", () => {
    const task = makeTask({ labels: ["epic", "afk"] });
    expect(deriveStatus(task, [])).toBe("epic");
  });

  it("epic + area → epic (não todo)", () => {
    const task = makeTask({ labels: ["epic", "area:front"] });
    expect(deriveStatus(task, [])).toBe("epic");
  });

  it("epic vai pro grupo history (fora da fila, igual ao backlog)", () => {
    expect(statusGroup("epic")).toBe("history");
    expect(statusGroup("backlog")).toBe("history");
  });

  it("epic FECHADA continua done (epic só vale pra OPEN)", () => {
    const task = makeTask({ labels: ["epic"], state: "CLOSED" });
    expect(deriveStatus(task, [])).toBe("done");
  });

  it("epic em execução continua running (não regride pra epic)", () => {
    const task = makeTask({ labels: ["epic"], run_status: "running" });
    expect(deriveStatus(task, [])).toBe("running");
  });

  it("epic + backlogs → backlog (backlogs vence; epic só pra OPEN parado)", () => {
    const task = makeTask({ labels: ["epic", "backlogs"] });
    expect(deriveStatus(task, [])).toBe("backlog");
  });
});

describe("deriveStatus — parked tem status PRÓPRIO (não é done)", () => {
  it("parked OPEN → status parked (NÃO done)", () => {
    const task = makeTask({ labels: ["parked"] });
    expect(deriveStatus(task, [])).toBe("parked");
  });

  it("parked vai pro grupo history (fora da fila, igual done/backlog/epic)", () => {
    expect(statusGroup("parked")).toBe("history");
  });

  it("parked FECHADA continua done (CLOSED vence — parked só vale pra OPEN)", () => {
    const task = makeTask({ labels: ["parked"], state: "CLOSED" });
    expect(deriveStatus(task, [])).toBe("done");
  });

  it("parked vence backlogs e epic (decisão mais recente do CEO)", () => {
    expect(deriveStatus(makeTask({ labels: ["parked", "backlogs"] }), [])).toBe(
      "parked",
    );
    expect(deriveStatus(makeTask({ labels: ["parked", "epic"] }), [])).toBe(
      "parked",
    );
  });

  it("parked + afk → parked (NÃO sem_agente — não vai pro dispatch)", () => {
    const task = makeTask({ labels: ["parked", "afk"] });
    expect(deriveStatus(task, [])).toBe("parked");
  });

  it("parked vence running (alta precedência, logo após CLOSED — o CEO tirou da fila)", () => {
    // Diferente do epic (baixa precedência): a checagem de parked está no TOPO
    // (logo após CLOSED, ANTES de running/pending), exatamente onde o `parked →
    // done` original ficava — preservamos essa ordem, só trocamos o destino.
    const task = makeTask({ labels: ["parked"], run_status: "running" });
    expect(deriveStatus(task, [])).toBe("parked");
  });

  it("isParked reflete o label parked", () => {
    expect(isParked(makeTask({ labels: ["parked"] }))).toBe(true);
    expect(isParked(makeTask({ labels: ["afk"] }))).toBe(false);
  });

  it("não-regressão: done/backlog/epic seguem como antes", () => {
    expect(deriveStatus(makeTask({ state: "CLOSED" }), [])).toBe("done");
    expect(deriveStatus(makeTask({ labels: ["backlogs"] }), [])).toBe("backlog");
    expect(deriveStatus(makeTask({ labels: ["epic"] }), [])).toBe("epic");
  });
});
