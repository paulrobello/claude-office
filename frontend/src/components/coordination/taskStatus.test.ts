import { describe, expect, it } from "vitest";

import type { CoordTask, HitlPrompt } from "./coordinationApi";
import { deriveStatus } from "./taskStatus";

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
