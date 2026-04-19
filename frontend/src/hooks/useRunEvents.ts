"use client";

import { useEffect, useRef } from "react";
import { useRunStore } from "@/stores/runStore";
import type { Run, RunOutcome } from "@/types/run";

// ============================================================================
// TYPES
// ============================================================================

interface EventWsEntry {
  ws: WebSocket | null;
  active: boolean;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  backoffMs: number;
}

interface RunEventMessage {
  type: string;
  run?: Run;
  event?: {
    type: string;
    agentId?: string;
    detail?: Record<string, unknown>;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function refetchRuns(): Promise<void> {
  try {
    const res = await fetch("http://localhost:3400/api/v1/runs");
    if (!res.ok) return;
    const runs = (await res.json()) as Run[];
    const { setRun } = useRunStore.getState();
    for (const run of runs) {
      setRun(run);
    }
  } catch {
    // Backend may not be running
  }
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Subscribes to per-run WebSocket channels and dispatches store updates when
 * synthetic run events arrive (run_start, run_phase_change, run_end,
 * role_session_joined). Works in concert with useRunList which handles
 * run_state messages and REST discovery on the same channels.
 *
 * Called once in page.tsx alongside useRunList().
 */
export function useRunEvents(): void {
  const wsMapRef = useRef(new Map<string, EventWsEntry>());

  useEffect(() => {
    const wsMap = wsMapRef.current;

    function disconnectRun(runId: string): void {
      const entry = wsMap.get(runId);
      if (!entry) return;
      entry.active = false;
      entry.ws?.close();
      if (entry.reconnectTimeout) {
        clearTimeout(entry.reconnectTimeout);
        entry.reconnectTimeout = null;
      }
      wsMap.delete(runId);
    }

    function connectRun(runId: string): void {
      if (wsMap.has(runId)) return;

      const entry: EventWsEntry = {
        ws: null,
        active: true,
        reconnectTimeout: null,
        backoffMs: 2000,
      };
      wsMap.set(runId, entry);

      function connect(): void {
        if (!entry.active) return;

        if (entry.reconnectTimeout) {
          clearTimeout(entry.reconnectTimeout);
          entry.reconnectTimeout = null;
        }

        const ws = new WebSocket(`ws://localhost:3400/ws/_run:${runId}`);
        entry.ws = ws;

        ws.onopen = () => {
          if (!entry.active) {
            ws.close();
            return;
          }
          entry.backoffMs = 2000;
        };

        ws.onmessage = (ev: MessageEvent) => {
          if (!entry.active) return;
          try {
            const msg = JSON.parse(ev.data as string) as RunEventMessage;
            if (msg.type !== "event" || !msg.event) return;

            const store = useRunStore.getState();
            const run = store.runs.get(runId);
            const eventType = msg.event.type;

            switch (eventType) {
              case "run_start": {
                if (!run) {
                  // Run not yet in store — re-fetch so store gets populated and
                  // RunOfficeCard mounts (triggering the office-appear animation).
                  void refetchRuns();
                } else {
                  // Re-set existing run to ensure office-appear fires on remount.
                  store.setRun({ ...run });
                }
                break;
              }

              case "run_phase_change": {
                // Phase data is not in the event detail (backend does not map it).
                // Re-fetch immediately so phase-tint transition fires without
                // waiting for the next 5 s REST poll in useRunList.
                void refetchRuns();
                break;
              }

              case "run_end": {
                if (run) {
                  const rawOutcome = msg.event.detail?.outcome;
                  const outcome: RunOutcome =
                    rawOutcome === "completed" ||
                    rawOutcome === "stuck" ||
                    rawOutcome === "abandoned"
                      ? (rawOutcome as RunOutcome)
                      : "completed";
                  store.setRun({ ...run, outcome });
                }
                // Disconnect — no more events expected on this run channel.
                disconnectRun(runId);
                break;
              }

              case "role_session_joined": {
                if (run) {
                  const sessionId = msg.event.agentId;
                  if (sessionId && !run.memberSessionIds.includes(sessionId)) {
                    store.setRun({
                      ...run,
                      memberSessionIds: [...run.memberSessionIds, sessionId],
                    });
                  }
                }
                break;
              }
            }
          } catch {
            // Silently ignore malformed messages
          }
        };

        ws.onerror = () => {
          // Reconnect on next onclose
        };

        ws.onclose = () => {
          if (!entry.active) return;
          const delay = entry.backoffMs;
          entry.backoffMs = Math.min(entry.backoffMs * 2, 10000);
          entry.reconnectTimeout = setTimeout(() => {
            entry.reconnectTimeout = null;
            connect();
          }, delay);
        };
      }

      connect();
    }

    // Watch the run store: create event-WS connections as useRunList
    // discovers new runs, remove them when runs are purged.
    const unsubscribe = useRunStore.subscribe((state) => {
      const currentRunIds = new Set(state.runs.keys());

      for (const [runId, run] of state.runs) {
        if (run.outcome === "in_progress") {
          connectRun(runId);
        }
      }

      for (const runId of wsMap.keys()) {
        if (!currentRunIds.has(runId)) {
          disconnectRun(runId);
        }
      }
    });

    return () => {
      unsubscribe();
      for (const runId of [...wsMap.keys()]) {
        disconnectRun(runId);
      }
    };
  }, []);
}
