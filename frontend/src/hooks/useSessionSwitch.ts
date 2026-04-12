"use client";

import { agentMachineService } from "@/machines/agentMachineService";
import { useGameStore } from "@/stores/gameStore";
import { useTranslation } from "@/hooks/useTranslation";
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
  handleRenameSession: (sessionId: string, newName: string) => Promise<void>;
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
  const { t } = useTranslation();

  const handleSessionSelect = async (id: string): Promise<void> => {
    if (id === sessionId) return;

    // Reset state machines and store for session switch.
    // Use resetForSessionSwitch (not resetForReplay) to keep isReplaying=false
    // so WebSocket will reconnect to the new session.
    agentMachineService.reset();
    useGameStore.getState().resetForSessionSwitch();

    setSessionId(id);
    showStatus(
      t("status.switchedToSession", { sessionId: id.slice(0, 8) }),
      "info",
    );
  };

  const handleDeleteSession = async (session: Session): Promise<void> => {
    const id = session.id;

    try {
      showStatus(
        t("status.deletingSession", { sessionId: id.slice(0, 8) }),
        "info",
      );
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
        showStatus(t("status.sessionDeleted"), "success");
      } else {
        showStatus(t("status.failedDeleteSession"), "error");
      }
    } catch (e) {
      console.error(e);
      showStatus(t("status.errorConnecting"), "error");
    }
  };

  const handleClearDB = async (): Promise<void> => {
    try {
      showStatus(t("status.clearingDatabase"), "info");
      const res = await fetch("http://localhost:8000/api/v1/sessions", {
        method: "DELETE",
      });
      if (res.ok) {
        agentMachineService.reset();
        useGameStore.getState().resetForSessionSwitch();
        setSessionId("sim_session_123");
        await fetchSessions();
        showStatus(t("status.databaseCleared"), "success");
      } else {
        showStatus(t("status.failedClearDatabase"), "error");
      }
    } catch (e) {
      console.error(e);
      showStatus(t("status.errorConnecting"), "error");
    }
  };

  const handleSimulate = async (): Promise<void> => {
    try {
      showStatus(t("status.triggeringSimulation"), "info");
      const res = await fetch(
        "http://localhost:8000/api/v1/sessions/simulate",
        { method: "POST" },
      );
      if (res.ok) {
        showStatus(t("status.simulationStarted"), "success");
      } else {
        showStatus(t("status.failedSimulation"), "error");
      }
    } catch (e) {
      console.error(e);
      showStatus(t("status.errorConnecting"), "error");
    }
  };

  const handleReset = (): void => {
    agentMachineService.reset();
    useGameStore.getState().resetForSessionSwitch();
    showStatus(t("status.storeReset"), "info");
  };

  const handleRenameSession = async (
    sessionId: string,
    newName: string,
  ): Promise<void> => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    try {
      const res = await fetch(
        `http://localhost:8000/api/v1/sessions/${sessionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: trimmed }),
        },
      );
      if (res.ok) {
        await fetchSessions();
        showStatus(t("status.sessionRenamed"), "success");
      } else {
        showStatus(t("status.failedRenameSession"), "error");
      }
    } catch (e) {
      console.error(e);
      showStatus(t("status.errorConnecting"), "error");
    }
  };

  return {
    handleSessionSelect,
    handleDeleteSession,
    handleClearDB,
    handleSimulate,
    handleReset,
    handleRenameSession,
  };
}
