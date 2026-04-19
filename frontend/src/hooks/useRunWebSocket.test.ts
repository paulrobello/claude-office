// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { useRunWebSocket } from "./useRunWebSocket";
import { useRunStore } from "@/stores/runStore";
import type { Run } from "@/types/run";

// ============================================================================
// WebSocket mock
// ============================================================================

interface MockWebSocket {
  url: string;
  onopen: ((e: Event) => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onclose: ((e: CloseEvent) => void) | null;
  close: ReturnType<typeof vi.fn>;
  triggerOpen: () => void;
  triggerMessage: (data: unknown) => void;
  triggerClose: () => void;
}

let lastWs: MockWebSocket | null = null;
const WS_INSTANCES: MockWebSocket[] = [];

class FakeWebSocket {
  url: string;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  close = vi.fn();
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    lastWs = this as unknown as MockWebSocket;
    WS_INSTANCES.push(this as unknown as MockWebSocket);
  }

  triggerOpen() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  triggerMessage(data: unknown) {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }

  triggerClose() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }
}

// ============================================================================
// Test helpers
// ============================================================================

function renderHook(fn: () => void): {
  unmount: () => void;
  rerender: (newFn: () => void) => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let latestFn = fn;

  function HookWrapper() {
    latestFn();
    return null;
  }

  act(() => {
    root.render(createElement(HookWrapper));
  });

  return {
    unmount: () =>
      act(() => {
        root.unmount();
        container.remove();
      }),
    rerender: (newFn: () => void) => {
      latestFn = newFn;
      act(() => {
        root.render(createElement(HookWrapper));
      });
    },
  };
}

// ============================================================================
// Fixtures
// ============================================================================

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

// ============================================================================
// Tests
// ============================================================================

describe("useRunWebSocket", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    WS_INSTANCES.length = 0;
    lastWs = null;
    useRunStore.getState().clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects to correct URL when given a valid runId", () => {
    const { unmount } = renderHook(() => useRunWebSocket("ral-test-001"));
    expect(WS_INSTANCES).toHaveLength(1);
    expect(WS_INSTANCES[0].url).toBe(
      "ws://localhost:3400/ws/_run:ral-test-001",
    );
    unmount();
  });

  it("does not connect when runId is null", () => {
    const { unmount } = renderHook(() => useRunWebSocket(null));
    expect(WS_INSTANCES).toHaveLength(0);
    unmount();
  });

  it("dispatches setRun on incoming run_state message", () => {
    const { unmount } = renderHook(() => useRunWebSocket("ral-test-001"));
    const ws = lastWs!;

    act(() => {
      ws.triggerOpen();
      ws.triggerMessage({ type: "run_state", run: makeRun() });
    });

    expect(useRunStore.getState().runs.get("ral-test-001")).toEqual(makeRun());
    unmount();
  });

  it("ignores messages with unknown type", () => {
    const { unmount } = renderHook(() => useRunWebSocket("ral-test-001"));

    act(() => {
      lastWs!.triggerMessage({ type: "other_event", data: {} });
    });

    expect(useRunStore.getState().runs.size).toBe(0);
    unmount();
  });

  it("closes WebSocket on unmount", () => {
    const { unmount } = renderHook(() => useRunWebSocket("ral-test-001"));
    const ws = lastWs!;
    unmount();
    expect(ws.close).toHaveBeenCalled();
  });

  it("closes previous WebSocket when runId changes", () => {
    let runId: string | null = "ral-a";
    const { rerender, unmount } = renderHook(() => useRunWebSocket(runId));
    const firstWs = lastWs!;

    act(() => {
      runId = "ral-b";
      rerender(() => useRunWebSocket(runId));
    });

    expect(firstWs.close).toHaveBeenCalled();
    expect(WS_INSTANCES).toHaveLength(2);
    expect(WS_INSTANCES[1].url).toBe("ws://localhost:3400/ws/_run:ral-b");
    unmount();
  });

  it("closes WebSocket when runId changes to null", () => {
    let runId: string | null = "ral-a";
    const { rerender, unmount } = renderHook(() => useRunWebSocket(runId));
    const ws = lastWs!;

    act(() => {
      runId = null;
      rerender(() => useRunWebSocket(runId));
    });

    expect(ws.close).toHaveBeenCalled();
    expect(WS_INSTANCES).toHaveLength(1);
    unmount();
  });
});
