import { describe, it, expect, beforeEach } from "vitest";
import { useNavigationStore } from "./navigationStore";

const resetStore = () =>
  useNavigationStore.setState({
    view: "building",
    floorId: null,
    activeRunId: null,
    activeNookSessionId: null,
    isTransitioning: false,
    transitionDirection: null,
    transitionOrigin: null,
  });

describe("useNavigationStore — campus navigation actions", () => {
  beforeEach(() => {
    resetStore();
  });

  it("goToCampus sets view=campus and clears run/nook IDs", () => {
    useNavigationStore.setState({
      activeRunId: "ral-abc",
      activeNookSessionId: "s-123",
    });
    useNavigationStore.getState().goToCampus();
    const state = useNavigationStore.getState();
    expect(state.view).toBe("campus");
    expect(state.activeRunId).toBeNull();
    expect(state.activeNookSessionId).toBeNull();
  });

  it("goToRunOffice sets view=run-office and activeRunId", () => {
    useNavigationStore.getState().goToRunOffice("ral-xxx");
    const state = useNavigationStore.getState();
    expect(state.view).toBe("run-office");
    expect(state.activeRunId).toBe("ral-xxx");
    expect(state.activeNookSessionId).toBeNull();
  });

  it("goToRunOffice clears activeNookSessionId from previous nook", () => {
    useNavigationStore.setState({ activeNookSessionId: "s-old" });
    useNavigationStore.getState().goToRunOffice("ral-xxx");
    expect(useNavigationStore.getState().activeNookSessionId).toBeNull();
  });

  it("goToNook sets view=nook and both IDs", () => {
    useNavigationStore.getState().goToNook("ral-xxx", "session-123");
    const state = useNavigationStore.getState();
    expect(state.view).toBe("nook");
    expect(state.activeRunId).toBe("ral-xxx");
    expect(state.activeNookSessionId).toBe("session-123");
  });

  it("goToNook accepts null runId for hot-desk drill-down", () => {
    useNavigationStore.getState().goToNook(null, "session-hotdesk");
    const state = useNavigationStore.getState();
    expect(state.view).toBe("nook");
    expect(state.activeRunId).toBeNull();
    expect(state.activeNookSessionId).toBe("session-hotdesk");
  });

  it("goToCampus after goToNook resets all IDs", () => {
    useNavigationStore.getState().goToNook("ral-xxx", "session-123");
    useNavigationStore.getState().goToCampus();
    const state = useNavigationStore.getState();
    expect(state.view).toBe("campus");
    expect(state.activeRunId).toBeNull();
    expect(state.activeNookSessionId).toBeNull();
  });

  it("legacy goToBuilding still works and does not touch run IDs", () => {
    useNavigationStore.setState({ activeRunId: "ral-abc" });
    useNavigationStore.getState().goToBuilding();
    const state = useNavigationStore.getState();
    expect(state.view).toBe("building");
    expect(state.floorId).toBeNull();
  });

  it("legacy goToFloor still works", () => {
    useNavigationStore.getState().goToFloor("floor-1");
    const state = useNavigationStore.getState();
    expect(state.view).toBe("floor");
    expect(state.floorId).toBe("floor-1");
  });

  it("goToCampus sets transition direction zoom-out", () => {
    useNavigationStore.getState().goToCampus();
    expect(useNavigationStore.getState().transitionDirection).toBe("zoom-out");
    expect(useNavigationStore.getState().isTransitioning).toBe(true);
  });

  it("goToRunOffice sets transition direction zoom-in", () => {
    useNavigationStore.getState().goToRunOffice("ral-yyy");
    expect(useNavigationStore.getState().transitionDirection).toBe("zoom-in");
    expect(useNavigationStore.getState().isTransitioning).toBe(true);
  });
});
