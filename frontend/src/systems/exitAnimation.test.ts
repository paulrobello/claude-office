import { describe, it, expect, beforeEach } from "vitest";
import {
  useExitStore,
  resetExit,
  exitProgress,
  EXIT_DURATION,
} from "./exitAnimation";

describe("exitAnimation registerEnded", () => {
  beforeEach(() => resetExit());

  it("does not re-walk a peer that already finished its exit", () => {
    const id = "s1";
    // Session ends → starts walking out at t=0.
    useExitStore.getState().registerEnded([id], 0);
    const t0 = useExitStore.getState().startTimes.get(id);
    expect(t0).toBe(0);

    // Exit completes.
    expect(exitProgress(id, EXIT_DURATION, useExitStore.getState().startTimes)).toBe(1);

    // Peer still lingers in the Ended zone, so the effect calls registerEnded
    // again with a fresh clock. The start time must NOT reset — otherwise the
    // agent loops walking out of the elevator forever.
    useExitStore.getState().registerEnded([id], 99999);
    expect(useExitStore.getState().startTimes.get(id)).toBe(0);
  });

  it("drops a session once it leaves the ended set (bounded map)", () => {
    useExitStore.getState().registerEnded(["s1"], 0);
    useExitStore.getState().registerEnded([], 100);
    expect(useExitStore.getState().startTimes.has("s1")).toBe(false);
  });
});
