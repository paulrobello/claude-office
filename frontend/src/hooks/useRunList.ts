"use client";

import { useEffect, useRef } from "react";
import { useRunStore } from "@/stores/runStore";
import type { Run } from "@/types/run";

const API_BASE = "http://localhost:3400/api/v1";
const POLL_INTERVAL_MS = 5000;

interface WsEntry {
  ws: WebSocket | null;
  active: boolean;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  backoffMs: number;
}

export function useRunList(): void {
  const wsMapRef = useRef(new Map<string, WsEntry>());

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

      const entry: WsEntry = {
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

        ws.onmessage = (event: MessageEvent) => {
          if (!entry.active) return;
          try {
            const msg = JSON.parse(event.data as string) as {
              type: string;
              run?: Run;
            };
            if (msg.type === "run_state" && msg.run) {
              useRunStore.getState().setRun(msg.run);
              if (msg.run.outcome !== "in_progress") {
                disconnectRun(runId);
              }
            }
          } catch {
            // Silently ignore malformed messages
          }
        };

        ws.onerror = () => {};

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

    async function syncRuns(): Promise<void> {
      try {
        const res = await fetch(`${API_BASE}/runs`);
        if (!res.ok) return;
        const runs = (await res.json()) as Run[];

        const store = useRunStore.getState();
        const fetchedIds = new Set(runs.map((r) => r.runId));

        for (const run of runs) {
          store.setRun(run);
          if (run.outcome === "in_progress") {
            connectRun(run.runId);
          } else {
            disconnectRun(run.runId);
          }
        }

        // Remove runs no longer returned by the API
        for (const [runId] of store.runs) {
          if (!fetchedIds.has(runId)) {
            store.removeRun(runId);
            disconnectRun(runId);
          }
        }
      } catch {
        // Silently fail — backend may not be running
      }
    }

    void syncRuns();
    const interval = setInterval(() => void syncRuns(), POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      for (const runId of [...wsMap.keys()]) {
        disconnectRun(runId);
      }
    };
  }, []);
}
