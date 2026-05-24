import { describe, expect, it } from "vitest";
import { buildFloorChips } from "../src/components/views/building/viewModel";
import type { FloorLive } from "../src/types";

function floor(partial: Partial<FloorLive>): FloorLive {
  return {
    floorId: "backend",
    name: "Backend",
    floorNumber: 4,
    accent: "#0ea5e9",
    icon: "⚙️",
    sessions: [],
    agentCount: 0,
    isActive: false,
    lastActivityAt: null,
    ...partial,
  };
}

describe("buildFloorChips", () => {
  it("returns no chips for an empty floor", () => {
    expect(buildFloorChips(floor({}))).toEqual([]);
  });

  it("emits a boss chip plus one chip per subagent", () => {
    const chips = buildFloorChips(
      floor({
        sessions: [
          {
            sessionId: "s1",
            displayName: "hmtrack-api-py",
            bossState: "working",
            bossTask: "review PR",
            agents: [
              { id: "a1", name: "Helper", state: "working", task: "tests", color: "#3b82f6" },
            ],
          },
        ],
      }),
    );
    expect(chips).toHaveLength(2);
    expect(chips[0].isBoss).toBe(true);
    expect(chips[0].label).toBe("hmtrack-api-py");
    expect(chips[0].color).toBe("#f59e0b");
    expect(chips[1].isBoss).toBe(false);
    expect(chips[1].label).toBe("Helper");
    expect(chips[1].task).toBe("tests");
  });

  it("falls back to agent id when name is missing", () => {
    const chips = buildFloorChips(
      floor({
        sessions: [
          {
            sessionId: "s1",
            displayName: "x",
            bossState: "idle",
            bossTask: null,
            agents: [{ id: "agent-xyz", name: null, state: "idle", task: null, color: "#22c55e" }],
          },
        ],
      }),
    );
    expect(chips[1].label).toBe("agent-xyz");
  });
});
