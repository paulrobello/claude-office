"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { agentMachineService } from "@/machines/agentMachineService";
import { useGameStore } from "@/stores/gameStore";
import type { Session } from "@/hooks/useSessions";

const API_BASE = "http://localhost:8000/api/v1";

interface UseRoomSessionsResult {
  /** Sessions for the current room */
  sessions: Session[];
  /** Whether sessions are loading */
  loading: boolean;
  /** Currently connected session ID */
  sessionId: string;
  /** Switch to a different session */
  selectSession: (id: string) => void;
}

/**
 * Manages sessions scoped to a specific room.
 * Auto-selects the latest active session when the room changes.
 */
export function useRoomSessions(roomId: string | null): UseRoomSessionsResult {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const prevRoomRef = useRef<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!roomId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/sessions?room_id=${encodeURIComponent(roomId)}`,
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
  }, [roomId]);

  // Fetch on mount and periodically
  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Auto-select session when room changes
  useEffect(() => {
    if (roomId !== prevRoomRef.current) {
      prevRoomRef.current = roomId;
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
  }, [roomId, sessions, sessionId]);

  // Auto-follow new active sessions in this room
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
