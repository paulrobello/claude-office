"use client";

import { agentMachineService } from "@/machines/agentMachineService";
import { useGameStore } from "@/stores/gameStore";
import type { Session } from "@/hooks/useSessions";

// ============================================================================
// TYPES
// ============================================================================

interface UseSessionSwitchOptions {
  sessionId: string;
  setSessionId: (id: string) => void;
  fetchSessions: () => Promise<Session[] | null>;
  showStatus: (text: string, type?: "info" | "error" | "success") => void;
}

interface UseSessionSwitchResult {
  handleSessionSelect: (id: string) => Promise<void>;
  handleDeleteSession: (session: Session) => Promise<void>;
  handleClearDB: () => Promise<void>;
  handleSimulate: () => Promise<void>;
  handleReset: () => void;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Provides action handlers for session switching, deletion, database clearing,
 * simulation triggering, and store resetting. All side-effects are isolated
 * here so page.tsx stays declarative.
 */
export function useSessionSwitch({
  sessionId,
  setSessionId,
  fetchSessions,
  showStatus,
}: UseSessionSwitchOptions): UseSessionSwitchResult {
  const handleSessionSelect = async (id: string): Promise<void> => {
    if (id === sessionId) return;

    // Reset state machines and store for session switch.
    // Use resetForSessionSwitch (not resetForReplay) to keep isReplaying=false
    // so WebSocket will reconnect to the new session.
    agentMachineService.reset();
    useGameStore.getState().resetForSessionSwitch();

    setSessionId(id);
    showStatus(`Switched to session ${id.slice(0, 8)}...`, "info");
  };

  const handleDeleteSession = async (session: Session): Promise<void> => {
    const id = session.id;

    try {
      showStatus(`Deleting session ${id.slice(0, 8)}...`, "info");
      const res = await fetch(`http://localhost:8000/api/v1/sessions/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        // If deleting current session, reset UI
        if (id === sessionId) {
          agentMachineService.reset();
          useGameStore.getState().resetForSessionSwitch();
          setSessionId("sim_session_123");
        }
        await fetchSessions();
        showStatus("Session deleted.", "success");
      } else {
        showStatus("Failed to delete session.", "error");
      }
    } catch (e) {
      console.error(e);
      showStatus("Error connecting to backend.", "error");
    }
  };

  const handleClearDB = async (): Promise<void> => {
    try {
      showStatus("Clearing database...", "info");
      const res = await fetch("http://localhost:8000/api/v1/sessions", {
        method: "DELETE",
      });
      if (res.ok) {
        agentMachineService.reset();
        useGameStore.getState().resetForSessionSwitch();
        setSessionId("sim_session_123");
        await fetchSessions();
        showStatus("Database cleared.", "success");
      } else {
        showStatus("Failed to clear database.", "error");
      }
    } catch (e) {
      console.error(e);
      showStatus("Error connecting to backend.", "error");
    }
  };

  const handleSimulate = async (): Promise<void> => {
    try {
      showStatus("Triggering simulation...", "info");
      const res = await fetch(
        "http://localhost:8000/api/v1/sessions/simulate",
        { method: "POST" },
      );
      if (res.ok) {
        showStatus("Simulation started!", "success");
      } else {
        showStatus("Failed to trigger simulation.", "error");
      }
    } catch (e) {
      console.error(e);
      showStatus("Error connecting to backend.", "error");
    }
  };

  const handleReset = (): void => {
    agentMachineService.reset();
    useGameStore.getState().resetForSessionSwitch();
    showStatus("Store reset.", "info");
  };

  return {
    handleSessionSelect,
    handleDeleteSession,
    handleClearDB,
    handleSimulate,
    handleReset,
  };
}
