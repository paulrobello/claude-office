"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { agentMachineService } from "@/machines/agentMachineService";
import { useGameStore } from "@/stores/gameStore";
import type { Session } from "@/hooks/useSessions";

const API_BASE = "http://localhost:3400/api/v1";

interface UseFloorSessionsResult {
  /** Sessions for the current floor */
  sessions: Session[];
  /** Whether sessions are loading */
  loading: boolean;
  /** Currently connected session ID */
  sessionId: string;
  /** Switch to a different session */
  selectSession: (id: string) => void;
}

/**
 * Manages sessions scoped to a specific floor.
 * Auto-selects the latest active session when the floor changes.
 */
export function useFloorSessions(
  floorId: string | null,
): UseFloorSessionsResult {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const prevFloorRef = useRef<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!floorId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/sessions?floor_id=${encodeURIComponent(floorId)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as Session[];
        setSessions(data);
        return data;
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
    return null;
  }, [floorId]);

  // Fetch on mount and periodically
  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Auto-select session when floor changes
  useEffect(() => {
    if (floorId !== prevFloorRef.current) {
      prevFloorRef.current = floorId;
      if (sessions.length > 0) {
        const active = sessions.find((s) => s.status === "active");
        const target = active || sessions[0];
        if (target && target.id !== sessionId) {
          agentMachineService.reset();
          useGameStore.getState().resetForSessionSwitch();
          setSessionId(target.id);
        }
      }
    }
  }, [floorId, sessions, sessionId]);

  // Auto-follow new active sessions on this floor
  useEffect(() => {
    if (sessions.length > 0 && !sessionId) {
      const active = sessions.find((s) => s.status === "active");
      const target = active || sessions[0];
      if (target) {
        setSessionId(target.id);
      }
    }
  }, [sessions, sessionId]);

  const selectSession = useCallback(
    (id: string) => {
      if (id !== sessionId) {
        agentMachineService.reset();
        useGameStore.getState().resetForSessionSwitch();
        setSessionId(id);
      }
    },
    [sessionId],
  );

  return { sessions, loading, sessionId, selectSession };
}
