import { describe, it, expect } from "vitest";
import type {
  CoordTask,
  HitlPrompt,
} from "../src/components/coordination/coordinationApi";
import { approveAction } from "../src/components/coordination/taskBatch";

const task = (over: Partial<CoordTask>): CoordTask => ({
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

const prompt = (over: Partial<HitlPrompt>): HitlPrompt => ({
  id: 1,
  source_ref: "agents-ia#1",
  session_id: null,
  agent: null,
  project: null,
  question: "q",
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
  ...over,
});

describe("approveAction", () => {
  it("prompt yesno → answer true", () => {
    expect(approveAction(task({}), prompt({ kind: "yesno" }))).toEqual({
      kind: "answer",
      value: true,
    });
  });
  it("prompt choice c/ recomendada → answer a recomendada", () => {
    const r = approveAction(
      task({}),
      prompt({ kind: "choice", options: [{ key: "A", label: "x" }], recommended_key: "A" }),
    );
    expect(r).toEqual({ kind: "answer", value: "A" });
  });
  it("prompt multi c/ recomendada → answer [recomendada]", () => {
    const r = approveAction(
      task({}),
      prompt({ kind: "multi", options: [{ key: "A", label: "x" }], recommended_key: "A" }),
    );
    expect(r).toEqual({ kind: "answer", value: ["A"] });
  });
  it("prompt choice sem recomendada → modal", () => {
    expect(
      approveAction(task({}), prompt({ kind: "choice", options: [{ key: "A", label: "x" }] })),
    ).toEqual({ kind: "modal" });
  });
  it("prompt text → modal", () => {
    expect(approveAction(task({}), prompt({ kind: "text", options: null }))).toEqual({
      kind: "modal",
    });
  });
  it("sem prompt mas label hitl → relabel", () => {
    expect(approveAction(task({ labels: ["hitl", "area:front"] }), undefined)).toEqual({
      kind: "relabel",
    });
  });
  it("sem prompt e sem hitl → none", () => {
    expect(approveAction(task({ labels: ["afk"] }), undefined)).toEqual({ kind: "none" });
  });
});
