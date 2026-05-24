"use client";

import { useCallback, useEffect, useRef } from "react";
import { useBuildingStore } from "@/stores/buildingStore";
import type { BuildingState } from "@/types";

interface UseBuildingFeedOptions {
  enabled: boolean;
}

/**
 * Subscribes to the backend /ws/building feed while `enabled` is true.
 * Writes incoming BuildingState snapshots into the buildingStore.
 * Reconnects automatically (2s) while enabled.
 */
export function useBuildingFeed({ enabled }: UseBuildingFeedOptions): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionIdRef = useRef(0);

  const setBuildingState = useBuildingStore.getState().setBuildingState;
  const setConnected = useBuildingStore.getState().setConnected;

  const connect = useCallback(() => {
    connectionIdRef.current += 1;
    const id = connectionIdRef.current;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }

    const base =
      process.env.NEXT_PUBLIC_WS_URL || `ws://${window.location.hostname}:8000`;
    const ws = new WebSocket(`${base}/ws/building`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (connectionIdRef.current !== id) {
        ws.close();
        return;
      }
      setConnected(true);
    };

    ws.onmessage = (event) => {
      if (connectionIdRef.current !== id) return;
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          state?: BuildingState;
        };
        if (msg.type === "building_state" && msg.state) {
          setBuildingState(msg.state);
        }
      } catch (err) {
        console.error("[WS building] parse error:", err);
      }
    };

    ws.onclose = () => {
      if (connectionIdRef.current !== id) return;
      setConnected(false);
      if (enabled) {
        reconnectRef.current = setTimeout(() => {
          reconnectRef.current = null;
          connect();
        }, 2000);
      }
    };

    ws.onerror = () => {
      if (connectionIdRef.current !== id) return;
      console.error("[WS building] error");
    };
  }, [enabled, setBuildingState, setConnected]);

  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      useBuildingStore.getState().reset();
      return;
    }

    connect();

    return () => {
      connectionIdRef.current += 1; // invalidate handlers
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      useBuildingStore.getState().setConnected(false);
    };
  }, [enabled, connect]);
}
