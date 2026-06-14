import { describe, expect, it } from "vitest";

import type { CoordTask } from "./coordinationApi";
import { STATUS_FACET_ORDER, statusFacetOf } from "./taskFilters";

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

describe("statusFacetOf — parked é faceta própria, separada de done", () => {
  it("parked OPEN cai na faceta 'parked' (NÃO 'done')", () => {
    const task = makeTask({ labels: ["parked"] });
    expect(statusFacetOf(task, [])).toBe("parked");
  });

  it("parked NUNCA é contada como 'done' (o filtro Concluída fica fiel)", () => {
    const task = makeTask({ labels: ["parked"] });
    expect(statusFacetOf(task, [])).not.toBe("done");
  });

  it("CLOSED de verdade segue em 'done' (parked não rouba a faceta)", () => {
    const task = makeTask({ state: "CLOSED" });
    expect(statusFacetOf(task, [])).toBe("done");
  });

  it("'parked' está na ordem de exibição das facetas", () => {
    expect(STATUS_FACET_ORDER).toContain("parked");
  });
});
