"use client";

import { useCallback, useEffect, useRef } from "react";
import { useOverviewStore } from "@/stores/overviewStore";
import type { OverviewEntry } from "@/types";

/**
 * Connects to the global `/ws/overview` feed that carries one boss snapshot per
 * live session (the Command Center). Separate from {@link useWebSocketEvents},
 * which is session-bound. Connects only while {@link enabled} is true (i.e. the
 * user is viewing the Command Center) and tears down on disable/unmount.
 *
 * Mirrors the reconnect / connection-id guard pattern of useWebSocketEvents.
 */
export function useOverviewWebSocket({ enabled }: { enabled: boolean }): void {
  const wsRef = useRef<WebSocket | null>(null);
  const connectionIdRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const retryCountRef = useRef(0);
  const enabledRef = useRef(enabled);
  // Holds the latest `connect` so the reconnect timer can call it without a
  // self-reference (which trips no-use-before-define).
  const connectRef = useRef<(() => void) | null>(null);

  // Keep refs in sync without touching them during render.
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const setEntries = useOverviewStore((s) => s.setEntries);
  const setConnected = useOverviewStore((s) => s.setConnected);

  const connect = useCallback(() => {
    connectionIdRef.current++;
    const thisConnectionId = connectionIdRef.current;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL ||
      `${wsScheme}://${window.location.hostname}:8000`;
    const ws = new WebSocket(`${wsUrl}/ws/overview`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (connectionIdRef.current !== thisConnectionId) {
        ws.close();
        return;
      }
      retryCountRef.current = 0;
      setConnected(true);
    };

    ws.onmessage = (event) => {
      if (connectionIdRef.current !== thisConnectionId) return;
      try {
        const msg = JSON.parse(event.data) as {
          type?: string;
          state?: { entries?: OverviewEntry[] };
        };
        if (msg.type === "state_update") {
          // Validate the shape before applying so a malformed payload can't
          // throw at render time.
          if (Array.isArray(msg.state?.entries)) {
            setEntries(msg.state.entries);
          } else {
            console.warn("[overview WS] ignoring malformed state_update frame");
          }
        }
      } catch {
        // Ignore malformed frames.
      }
    };

    ws.onerror = () => {
      if (connectionIdRef.current !== thisConnectionId) return;
      console.warn("[overview WS] connection error — will retry");
    };

    ws.onclose = () => {
      if (connectionIdRef.current !== thisConnectionId) return;
      setConnected(false);
      if (enabledRef.current) {
        // Exponential backoff with random jitter (0–500ms) so many clients
        // don't reconnect in lockstep after a backend restart.
        const baseDelay = Math.min(
          1000 * Math.pow(2, retryCountRef.current),
          30000,
        );
        const delay = baseDelay + Math.random() * 500;
        retryCountRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          if (enabledRef.current) connectRef.current?.();
        }, delay);
      }
    };
  }, [setConnected, setEntries]);

  // Expose the latest connect to the reconnect timer.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!enabled) {
      connectionIdRef.current++; // invalidate any pending handlers
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setConnected(false);
      useOverviewStore.getState().clear();
      return;
    }

    connect();

    const connectionIdAtSetup = connectionIdRef;
    return () => {
      // Invalidate any in-flight handlers so a closing socket doesn't reconnect
      // after unmount.
      connectionIdAtSetup.current++;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Don't leave a stale "connected" + old entries behind on unmount.
      setConnected(false);
      useOverviewStore.getState().clear();
    };
  }, [enabled, connect, setConnected]);
}
