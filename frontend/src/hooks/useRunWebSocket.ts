"use client";

import { useEffect, useRef } from "react";
import { useRunStore } from "@/stores/runStore";
import type { Run } from "@/types/run";

interface RunWebSocketMessage {
  type: string;
  run?: Run;
}

export function useRunWebSocket(runId: string | null): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const backoffMsRef = useRef(2000);

  useEffect(() => {
    if (!runId) {
      wsRef.current?.close();
      wsRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    backoffMsRef.current = 2000;

    // `active` flag prevents stale reconnects after cleanup
    let active = true;

    function connect() {
      if (!active) return;

      wsRef.current?.close();
      wsRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      const ws = new WebSocket(`ws://localhost:3400/ws/_run:${runId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!active) {
          ws.close();
          return;
        }
        backoffMsRef.current = 2000;
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!active) return;
        try {
          const message: RunWebSocketMessage = JSON.parse(event.data as string);
          if (message.type === "run_state" && message.run) {
            useRunStore.getState().setRun(message.run);
          }
        } catch (error) {
          console.error("[RunWS] Failed to parse message:", error);
        }
      };

      ws.onerror = () => {
        if (!active) return;
      };

      ws.onclose = () => {
        if (!active) return;
        const delay = backoffMsRef.current;
        backoffMsRef.current = Math.min(backoffMsRef.current * 2, 10000);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, delay);
      };
    }

    connect();

    return () => {
      active = false;
      wsRef.current?.close();
      wsRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [runId]);
}
