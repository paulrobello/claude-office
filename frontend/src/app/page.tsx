/**
 * Claude Office Visualizer - Main Page
 *
 * Uses the unified Zustand store, XState machines, and OfficeGame component.
 * Layout and logic are delegated to extracted components and custom hooks.
 */

"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback } from "react";
import { useWebSocketEvents } from "@/hooks/useWebSocketEvents";
import { useSessions } from "@/hooks/useSessions";
import { useSessionSwitch } from "@/hooks/useSessionSwitch";
import {
  useGameStore,
  selectIsConnected,
  selectDebugMode,
  selectAgents,
  selectBoss,
} from "@/stores/gameStore";
import { useShallow } from "zustand/react/shallow";
import { Menu, X } from "lucide-react";
import { SessionSidebar } from "@/components/layout/SessionSidebar";
import { MobileDrawer } from "@/components/layout/MobileDrawer";
import { MobileAgentActivity } from "@/components/layout/MobileAgentActivity";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { HeaderControls } from "@/components/layout/HeaderControls";
import {
  StatusToast,
  type StatusMessage,
} from "@/components/layout/StatusToast";
import Modal from "@/components/overlay/Modal";
import SettingsModal from "@/components/overlay/SettingsModal";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useProjectStore, selectViewMode } from "@/stores/projectStore";
import { useProjectWebSocket } from "@/hooks/useProjectWebSocket";
import { useTranslation } from "@/hooks/useTranslation";
import type { Session } from "@/hooks/useSessions";

// ============================================================================
// DYNAMIC IMPORT
// ============================================================================

function LoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="w-full h-full bg-slate-900 animate-pulse flex items-center justify-center text-white font-mono text-center">
      {t("app.initializingSystems")}
    </div>
  );
}

const OfficeGame = dynamic(
  () =>
    import("@/components/game/OfficeGame").then((m) => ({
      default: m.OfficeGame,
    })),
  {
    ssr: false,
    loading: () => <LoadingFallback />,
  },
);

const ProjectRoomGrid = dynamic(
  () =>
    import("@/components/game/ProjectRoomGrid").then((m) => ({
      default: m.ProjectRoomGrid,
    })),
  {
    ssr: false,
    loading: () => <LoadingFallback />,
  },
);

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function V2TestPage(): React.ReactNode {
  // ------------------------------------------------------------------
  // i18n
  // ------------------------------------------------------------------
  const { t, language } = useTranslation();

  // ------------------------------------------------------------------
  // UI-only state
  // ------------------------------------------------------------------
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
    null,
  );
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState<boolean | null>(
    null,
  );

  // Session pending delete drives the delete-confirmation modal
  const [sessionPendingDelete, setSessionPendingDelete] =
    useState<Session | null>(null);

  // ------------------------------------------------------------------
  // Status toast helper (stable reference via useCallback)
  // ------------------------------------------------------------------
  const showStatus = useCallback(
    (text: string, type: "info" | "error" | "success" = "info") => {
      setStatusMessage({ text, type });
      setTimeout(() => setStatusMessage(null), 3000);
    },
    [],
  );

  // ------------------------------------------------------------------
  // Session management hooks
  // ------------------------------------------------------------------
  const { sessions, sessionsLoading, sessionId, setSessionId, fetchSessions } =
    useSessions(showStatus);

  const {
    handleSessionSelect,
    handleDeleteSession,
    handleClearDB,
    handleSimulate,
    handleReset,
  } = useSessionSwitch({ sessionId, setSessionId, fetchSessions, showStatus });

  // ------------------------------------------------------------------
  // Multi-project state
  // ------------------------------------------------------------------
  useProjectWebSocket();
  const viewMode = useProjectStore(selectViewMode);
  const setViewMode = useProjectStore((s) => s.setViewMode);

  // ------------------------------------------------------------------
  // Store subscriptions
  // ------------------------------------------------------------------
  const isConnected = useGameStore(selectIsConnected);
  const debugMode = useGameStore(selectDebugMode);
  const agents = useGameStore(useShallow(selectAgents));
  const boss = useGameStore(selectBoss);
  const loadPersistedDebugSettings = useGameStore(
    (state) => state.loadPersistedDebugSettings,
  );
  const loadPreferences = usePreferencesStore((s) => s.loadPreferences);

  // ------------------------------------------------------------------
  // WebSocket connection — reconnects when sessionId changes
  // ------------------------------------------------------------------
  useWebSocketEvents({ sessionId });

  // ------------------------------------------------------------------
  // One-time initialization effects
  // ------------------------------------------------------------------
  useEffect(() => {
    fetch("http://localhost:8000/api/v1/status")
      .then((res) => res.json())
      .then((data: { aiSummaryEnabled: boolean }) =>
        setAiSummaryEnabled(data.aiSummaryEnabled),
      )
      .catch(() => setAiSummaryEnabled(false));
  }, []);

  useEffect(() => {
    loadPersistedDebugSettings();
  }, [loadPersistedDebugSettings]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // ------------------------------------------------------------------
  // Mobile breakpoint detection
  // ------------------------------------------------------------------
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // ------------------------------------------------------------------
  // Derived handlers
  // ------------------------------------------------------------------
  const handleToggleDebug = () =>
    useGameStore.getState().setDebugMode(!debugMode);

  const handleConfirmClearDB = async () => {
    setIsClearModalOpen(false);
    await handleClearDB();
  };

  const handleConfirmDeleteSession = async () => {
    if (!sessionPendingDelete) return;
    const pending = sessionPendingDelete;
    setSessionPendingDelete(null);
    await handleDeleteSession(pending);
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <main className="flex h-screen flex-col bg-neutral-950 p-2 overflow-hidden relative">
      {/* ----------------------------------------------------------------
          Modals
      ---------------------------------------------------------------- */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title={t("modal.confirmDbWipe")}
        footer={
          <>
            <button
              onClick={() => setIsClearModalOpen(false)}
              className="px-4 py-2 text-slate-400 hover:text-white text-sm font-bold transition-colors"
            >
              {t("modal.cancel")}
            </button>
            <button
              onClick={handleConfirmClearDB}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-rose-900/20"
            >
              {t("modal.wipeAllData")}
            </button>
          </>
        }
      >
        <p>{t("modal.wipeWarning")}</p>
      </Modal>

      <Modal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title={t("modal.keyboardShortcuts")}
        footer={
          <button
            onClick={() => setIsHelpModalOpen(false)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {t("modal.close")}
          </button>
        }
      >
        <div className="space-y-3 font-mono text-sm">
          <div className="flex justify-between items-center py-2 border-b border-slate-700">
            <kbd className="px-2 py-1 bg-slate-800 rounded text-white font-bold">
              D
            </kbd>
            <span className="text-slate-300">{t("modal.toggleDebug")}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-700">
            <kbd className="px-2 py-1 bg-slate-800 rounded text-white font-bold">
              P
            </kbd>
            <span className="text-slate-300">{t("modal.showAgentPaths")}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-700">
            <kbd className="px-2 py-1 bg-slate-800 rounded text-white font-bold">
              Q
            </kbd>
            <span className="text-slate-300">{t("modal.showQueueSlots")}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <kbd className="px-2 py-1 bg-slate-800 rounded text-white font-bold">
              L
            </kbd>
            <span className="text-slate-300">{t("modal.showPhaseLabels")}</span>
          </div>
        </div>
      </Modal>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      <Modal
        isOpen={sessionPendingDelete !== null}
        onClose={() => setSessionPendingDelete(null)}
        title={t("modal.deleteSession")}
        footer={
          <>
            <button
              onClick={() => setSessionPendingDelete(null)}
              className="px-4 py-2 text-slate-400 hover:text-white text-sm font-bold transition-colors"
            >
              {t("modal.cancel")}
            </button>
            <button
              onClick={handleConfirmDeleteSession}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-rose-900/20"
            >
              {t("modal.delete")}
            </button>
          </>
        }
      >
        <p>
          {t("modal.deleteSessionConfirm")}{" "}
          <span className="font-mono text-purple-400">
            {sessionPendingDelete?.projectName ||
              sessionPendingDelete?.id.slice(0, 8)}
          </span>
          ?
        </p>
        <p className="text-slate-400 text-sm mt-2">
          {t("modal.deleteSessionWarning")}{" "}
          {sessionPendingDelete?.eventCount ?? 0} {t("modal.events")}.{" "}
          {t("modal.cannotBeUndone")}
        </p>
      </Modal>

      {/* ----------------------------------------------------------------
          Header
      ---------------------------------------------------------------- */}
      <header className="flex justify-between items-center mb-2 px-1 relative h-12">
        <div className="flex items-center gap-3">
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? t("modal.close") : t("mobile.menu")}
              aria-expanded={mobileMenuOpen}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}
          <h1
            className={`font-bold text-white tracking-tight flex items-center gap-2 ${
              isMobile ? "text-lg" : "text-2xl"
            }`}
          >
            <span className="text-orange-500">Claude</span>{" "}
            {!isMobile && t("app.title")}
            {!isMobile && (
              <span className="text-xs font-mono font-normal px-2 py-0.5 bg-slate-800 rounded text-slate-400 border border-slate-700">
                v0.13.0
              </span>
            )}
          </h1>
        </div>

        {/* Centered status toast */}
        <div className="absolute left-1/3 -translate-x-1/2 flex items-center pointer-events-none">
          <StatusToast message={statusMessage} />
        </div>

        {!isMobile && (
          <HeaderControls
            isConnected={isConnected}
            debugMode={debugMode}
            aiSummaryEnabled={aiSummaryEnabled}
            onSimulate={handleSimulate}
            onReset={handleReset}
            onClearDB={() => setIsClearModalOpen(true)}
            onToggleDebug={handleToggleDebug}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onOpenHelp={() => setIsHelpModalOpen(true)}
          />
        )}

        {isMobile && (
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
              }`}
            />
            <span className="text-xs text-slate-400 font-mono">
              {agents.size} {t("header.agents")}
            </span>
          </div>
        )}
      </header>

      {/* ----------------------------------------------------------------
          Mobile Drawer
      ---------------------------------------------------------------- */}
      <MobileDrawer
        isOpen={isMobile && mobileMenuOpen}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        sessionId={sessionId}
        onClose={() => setMobileMenuOpen(false)}
        onSessionSelect={handleSessionSelect}
        onSimulate={handleSimulate}
        onReset={handleReset}
        onClearDB={() => {
          setIsClearModalOpen(true);
          setMobileMenuOpen(false);
        }}
      />

      {/* ----------------------------------------------------------------
          Main Content
      ---------------------------------------------------------------- */}
      {isMobile ? (
        <div className="flex-grow flex flex-col gap-1.5 overflow-hidden min-h-0">
          <div className="flex-[3] border border-slate-800 rounded-lg shadow-2xl bg-slate-900 overflow-hidden relative min-h-0">
            <OfficeGame />
          </div>
          <MobileAgentActivity agents={agents} boss={boss} />
        </div>
      ) : (
        <div className="flex-grow flex gap-2 overflow-hidden min-h-0">
          <SessionSidebar
            sessions={sessions}
            sessionsLoading={sessionsLoading}
            sessionId={sessionId}
            isCollapsed={leftSidebarCollapsed}
            onToggleCollapsed={() =>
              setLeftSidebarCollapsed(!leftSidebarCollapsed)
            }
            onSessionSelect={handleSessionSelect}
            onDeleteSession={setSessionPendingDelete}
          />

          <div className="flex-grow border border-slate-800 rounded-lg shadow-2xl bg-slate-900 overflow-hidden relative">
            {/* View Mode Toggle */}
            <div className="absolute top-2 left-2 z-10 flex gap-1 bg-slate-800/80 rounded-md p-0.5 backdrop-blur-sm">
              {(["all-merged", "overview"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    viewMode === mode
                      ? "bg-purple-600 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-700"
                  }`}
                >
                  {mode === "all-merged" ? "Office" : "Projects"}
                </button>
              ))}
            </div>

            {viewMode === "overview" || viewMode === "room-detail" ? (
              <ProjectRoomGrid />
            ) : (
              <OfficeGame />
            )}
          </div>

          <RightSidebar />
        </div>
      )}
    </main>
  );
}
