"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { agentMachineService } from "@/machines/agentMachineService";
import { useGameStore } from "@/stores/gameStore";
import {
  usePreferencesStore,
  selectAutoFollowNewSessions,
} from "@/stores/preferencesStore";

// ============================================================================
// TYPES
// ============================================================================

export interface Session {
  id: string;
  projectName: string | null;
  projectRoot: string | null;
  createdAt: string;
  updatedAt: string;
  status: string;
  eventCount: number;
  floorId: string | null;
  roomId: string | null;
}

// ============================================================================
// HOOK
// ============================================================================

interface UseSessionsResult {
  sessions: Session[];
  sessionsLoading: boolean;
  sessionId: string;
  setSessionId: (id: string) => void;
  fetchSessions: () => Promise<Session[] | null>;
  showStatus: (text: string, type?: "info" | "error" | "success") => void;
}

/**
 * Manages session list fetching, auto-selection, auto-follow, and session
 * deletion event handling. Exposes fetchSessions so callers can trigger
 * a manual refresh (e.g., after delete or clear operations).
 */
export function useSessions(
  showStatus: (text: string, type?: "info" | "error" | "success") => void,
): UseSessionsResult {
  const [sessionId, setSessionId] = useState("sim_session_123");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const autoFollowNewSessions = usePreferencesStore(
    selectAutoFollowNewSessions,
  );

  // Track known session IDs for auto-follow detection
  const knownSessionIds = useRef<Set<string>>(new Set());
  const hasAutoSelected = useRef(false);

  // Fetch sessions list
  const fetchSessions = useCallback(async (): Promise<Session[] | null> => {
    setSessionsLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/sessions");
      if (res.ok) {
        const data = (await res.json()) as Session[];
        setSessions(data);
        return data;
      }
    } catch {
      // Silently fail
    } finally {
      setSessionsLoading(false);
    }
    return null;
  }, []);

  // Fetch sessions on mount and periodically
  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Listen for session deletion events from WebSocket
  useEffect(() => {
    const handleSessionDeleted = async (e: Event) => {
      const customEvent = e as CustomEvent<{ sessionId: string }>;
      const deletedSessionId = customEvent.detail.sessionId;

      // Refetch sessions to update the list
      const updatedSessions = await fetchSessions();

      // If the deleted session is the one we're viewing, switch to another
      if (deletedSessionId === sessionId) {
        if (updatedSessions && updatedSessions.length > 0) {
          const newSession =
            updatedSessions.find((s) => s.status === "active") ||
            updatedSessions[0];
          if (newSession) {
            setSessionId(newSession.id);
            showStatus(
              `Session deleted. Switched to ${newSession.projectName || newSession.id.slice(0, 8)}`,
              "info",
            );
          }
        } else {
          showStatus("Session deleted. No other sessions available.", "info");
        }
      }
    };
    window.addEventListener("session-deleted", handleSessionDeleted);
    return () =>
      window.removeEventListener("session-deleted", handleSessionDeleted);
  }, [fetchSessions, sessionId, showStatus]);

  // Auto-select most recent active session on initial mount only
  useEffect(() => {
    // Only auto-select once on initial load, not when user manually selects sim session
    if (
      !hasAutoSelected.current &&
      sessions.length > 0 &&
      sessionId === "sim_session_123"
    ) {
      hasAutoSelected.current = true;
      // Find an active session, or fall back to the first one
      const activeSession =
        sessions.find((s) => s.status === "active") || sessions[0];
      if (activeSession) {
        setSessionId(activeSession.id);
        showStatus(
          activeSession.projectName || activeSession.id.slice(0, 8),
          "success",
        );
      }
    }
  }, [sessions, sessionId, showStatus]);

  // Auto-follow new sessions in the current project
  useEffect(() => {
    if (!autoFollowNewSessions || sessions.length === 0) return;

    // Get current session's project root
    const currentSession = sessions.find((s) => s.id === sessionId);
    const currentProjectRoot = currentSession?.projectRoot;

    // Find new sessions that weren't in our known set
    const newSessions = sessions.filter(
      (s) => !knownSessionIds.current.has(s.id),
    );

    // Update known sessions set
    knownSessionIds.current = new Set(sessions.map((s) => s.id));

    // If no new sessions or no current project context, skip
    if (newSessions.length === 0 || !currentProjectRoot) return;

    // Find a new active session in the same project
    const newSessionInProject = newSessions.find(
      (s) => s.projectRoot === currentProjectRoot && s.status === "active",
    );

    if (newSessionInProject && newSessionInProject.id !== sessionId) {
      // Reset state machines and store for session switch
      agentMachineService.reset();
      useGameStore.getState().resetForSessionSwitch();

      setSessionId(newSessionInProject.id);
      showStatus(
        `Auto-followed new session: ${newSessionInProject.projectName || newSessionInProject.id.slice(0, 8)}`,
        "info",
      );
    }
  }, [sessions, sessionId, autoFollowNewSessions, showStatus]);

  return {
    sessions,
    sessionsLoading,
    sessionId,
    setSessionId,
    fetchSessions,
    showStatus,
  };
}
