import { beforeEach, describe, expect, it } from "vitest";
import { useBuildingStore } from "../src/stores/buildingStore";
import type { BuildingState } from "../src/types";

const sample: BuildingState = {
  buildingName: "HMTrack",
  floors: [],
  lobby: { sessions: [], agentCount: 0 },
  totals: { activeAgents: 0, activeFloors: 0, activeSessions: 0 },
};

describe("buildingStore", () => {
  beforeEach(() => {
    useBuildingStore.getState().reset();
  });

  it("starts empty and disconnected", () => {
    const s = useBuildingStore.getState();
    expect(s.buildingState).toBeNull();
    expect(s.isConnected).toBe(false);
  });

  it("stores a building state", () => {
    useBuildingStore.getState().setBuildingState(sample);
    expect(useBuildingStore.getState().buildingState?.buildingName).toBe("HMTrack");
  });

  it("tracks connection flag", () => {
    useBuildingStore.getState().setConnected(true);
    expect(useBuildingStore.getState().isConnected).toBe(true);
  });

  it("reset clears state", () => {
    useBuildingStore.getState().setBuildingState(sample);
    useBuildingStore.getState().setConnected(true);
    useBuildingStore.getState().reset();
    expect(useBuildingStore.getState().buildingState).toBeNull();
    expect(useBuildingStore.getState().isConnected).toBe(false);
  });
});
