import { describe, it, expect, beforeEach } from "vitest";
import { useRunStore, selectHotDeskSessions } from "./runStore";
import type { Run } from "@/types/run";

const makeRun = (overrides: Partial<Run> = {}): Run => ({
  runId: "ral-test-001",
  orchestratorSessionId: null,
  primaryRepo: "test/repo",
  workdocsDir: "workdocs",
  phase: "B",
  startedAt: "2026-04-18T00:00:00Z",
  endedAt: null,
  outcome: "in_progress",
  modelConfig: {},
  memberSessionIds: [],
  planTasks: [],
  stats: { elapsedSeconds: 0, phaseTimings: {} },
  tokenUsage: null,
  costUsd: null,
  ...overrides,
});

describe("useRunStore", () => {
  beforeEach(() => {
    useRunStore.getState().clear();
  });

  it("setRun adds a run to the store", () => {
    const run = makeRun();
    useRunStore.getState().setRun(run);
    expect(useRunStore.getState().runs.get("ral-test-001")).toEqual(run);
  });

  it("setRun overwrites an existing run with the same id", () => {
    const run = makeRun();
    useRunStore.getState().setRun(run);
    const updated = makeRun({ phase: "C" });
    useRunStore.getState().setRun(updated);
    expect(useRunStore.getState().runs.get("ral-test-001")?.phase).toBe("C");
    expect(useRunStore.getState().runs.size).toBe(1);
  });

  it("removeRun deletes a run from the store", () => {
    useRunStore.getState().setRun(makeRun());
    useRunStore.getState().removeRun("ral-test-001");
    expect(useRunStore.getState().runs.has("ral-test-001")).toBe(false);
  });

  it("removeRun clears activeRunId if it matched", () => {
    useRunStore.getState().setRun(makeRun());
    useRunStore.getState().setActiveRun("ral-test-001");
    useRunStore.getState().removeRun("ral-test-001");
    expect(useRunStore.getState().activeRunId).toBeNull();
  });

  it("removeRun leaves activeRunId unchanged if it does not match", () => {
    useRunStore.getState().setRun(makeRun({ runId: "ral-a" }));
    useRunStore.getState().setRun(makeRun({ runId: "ral-b" }));
    useRunStore.getState().setActiveRun("ral-a");
    useRunStore.getState().removeRun("ral-b");
    expect(useRunStore.getState().activeRunId).toBe("ral-a");
  });

  it("clear resets all state", () => {
    useRunStore.getState().setRun(makeRun());
    useRunStore.getState().setActiveRun("ral-test-001");
    useRunStore.getState().clear();
    expect(useRunStore.getState().runs.size).toBe(0);
    expect(useRunStore.getState().activeRunId).toBeNull();
  });
});

describe("selectHotDeskSessions", () => {
  it("returns only sessions with runId == null", () => {
    const sessions = [
      { id: "s1", runId: null },
      { id: "s2", runId: "ral-001" },
      { id: "s3", runId: undefined },
      { id: "s4", runId: null },
    ];
    const hotDesk = selectHotDeskSessions(sessions);
    expect(hotDesk.map((s) => s.id)).toEqual(["s1", "s3", "s4"]);
  });

  it("returns empty array when all sessions belong to a run", () => {
    const sessions = [
      { id: "s1", runId: "ral-001" },
      { id: "s2", runId: "ral-002" },
    ];
    expect(selectHotDeskSessions(sessions)).toHaveLength(0);
  });

  it("returns all sessions when none belong to a run", () => {
    const sessions = [{ id: "s1", runId: null }, { id: "s2" }];
    expect(selectHotDeskSessions(sessions)).toHaveLength(2);
  });
});
