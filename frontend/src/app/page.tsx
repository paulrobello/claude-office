/**
 * Claude Office Visualizer - Main Page
 *
 * Uses the unified Zustand store, XState machines, and OfficeGame component.
 * Layout and logic are delegated to extracted components and custom hooks.
 */

"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
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
import { MobileDrawer } from "@/components/layout/MobileDrawer";
import { MobileAgentActivity } from "@/components/layout/MobileAgentActivity";
import { HeaderControls } from "@/components/layout/HeaderControls";
import {
  StatusToast,
  type StatusMessage,
} from "@/components/layout/StatusToast";
import Modal from "@/components/overlay/Modal";
import SettingsModal from "@/components/overlay/SettingsModal";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { Session } from "@/hooks/useSessions";
import { useFloorConfig } from "@/hooks/useFloorConfig";
import { useNavigationStore } from "@/stores/navigationStore";
import { useZoomNavigation } from "@/hooks/useZoomNavigation";
import { Breadcrumb } from "@/components/navigation/Breadcrumb";
import { ViewTransition } from "@/components/navigation/ViewTransition";
import { BuildingView } from "@/components/views/BuildingView";
import { FloorView } from "@/components/views/FloorView";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { useTourStore } from "@/stores/tourStore";

// ============================================================================
// DYNAMIC IMPORT (mobile branch only — desktop uses FloorView)
// ============================================================================

const OfficeGame = dynamic(
  () =>
    import("@/components/game/OfficeGame").then((m) => ({
      default: m.OfficeGame,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-900 animate-pulse flex items-center justify-center text-white font-mono text-center">
        Initializing Systems...
      </div>
    ),
  },
);

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function V2TestPage(): React.ReactNode {
  // ------------------------------------------------------------------
  // UI-only state
  // ------------------------------------------------------------------
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
    null,
  );
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
  const startTour = useTourStore((s) => s.startTour);
  const hasSeenTour = useTourStore((s) => s.hasSeenTour);
  const isTourActive = useTourStore((s) => s.isActive);
  const loadTourSeen = useTourStore((s) => s.loadTourSeen);

  // ------------------------------------------------------------------
  // Floor configuration + navigation
  // ------------------------------------------------------------------
  useFloorConfig();
  const view = useNavigationStore((s) => s.view);

  // ------------------------------------------------------------------
  // Zoom navigation (scroll/pinch between views)
  // ------------------------------------------------------------------
  const mainContentRef = useRef<HTMLDivElement>(null);
  const zoomState = useZoomNavigation(mainContentRef);

  // ------------------------------------------------------------------
  // WebSocket connection — reconnects when sessionId changes
  // ------------------------------------------------------------------
  // Only connect at page level when in building view (FloorView manages its own WS)
  useWebSocketEvents({ sessionId: view === "building" ? sessionId : "" });

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
    loadTourSeen();
  }, [loadTourSeen]);

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

  const handleStartTour = () => {
    useNavigationStore.getState().goToBuilding();
    startTour();
  };

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
        title="Confirm Database Wipe"
        footer={
          <>
            <button
              onClick={() => setIsClearModalOpen(false)}
              className="px-4 py-2 text-slate-400 hover:text-white text-sm font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmClearDB}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-rose-900/20"
            >
              Wipe All Data
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to permanently delete all session history and
          events? This action cannot be undone and will reset the current
          visualizer state.
        </p>
      </Modal>

      <Modal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title="Keyboard Shortcuts"
        footer={
          <button
            onClick={() => setIsHelpModalOpen(false)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold rounded-lg transition-colors"
          >
            Close
          </button>
        }
      >
        <div className="space-y-3 font-mono text-sm">
          <div className="flex justify-between items-center py-2 border-b border-slate-700">
            <kbd className="px-2 py-1 bg-slate-800 rounded text-white font-bold">
              D
            </kbd>
            <span className="text-slate-300">Toggle debug mode</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-700">
            <kbd className="px-2 py-1 bg-slate-800 rounded text-white font-bold">
              P
            </kbd>
            <span className="text-slate-300">Show agent paths</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-700">
            <kbd className="px-2 py-1 bg-slate-800 rounded text-white font-bold">
              Q
            </kbd>
            <span className="text-slate-300">Show queue slots</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <kbd className="px-2 py-1 bg-slate-800 rounded text-white font-bold">
              L
            </kbd>
            <span className="text-slate-300">Show phase labels</span>
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
        title="Delete Session"
        footer={
          <>
            <button
              onClick={() => setSessionPendingDelete(null)}
              className="px-4 py-2 text-slate-400 hover:text-white text-sm font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDeleteSession}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-rose-900/20"
            >
              Delete
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to delete session{" "}
          <span className="font-mono text-purple-400">
            {sessionPendingDelete?.projectName ||
              sessionPendingDelete?.id.slice(0, 8)}
          </span>
          ?
        </p>
        <p className="text-slate-400 text-sm mt-2">
          This will permanently remove {sessionPendingDelete?.eventCount ?? 0}{" "}
          events. This action cannot be undone.
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
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}
          <div className="flex items-center gap-3">
            <h1
              className={`font-bold text-white tracking-tight flex items-center gap-2 ${
                isMobile ? "text-lg" : "text-2xl"
              }`}
            >
              <span className="text-orange-500">Claude</span>{" "}
              {!isMobile && "Office Visualizer"}
              {!isMobile && (
                <span className="text-xs font-mono font-normal px-2 py-0.5 bg-slate-800 rounded text-slate-400 border border-slate-700">
                  v0.11.0
                </span>
              )}
            </h1>
            {!isMobile && (
              <div className="border-l border-slate-800 pl-3">
                <Breadcrumb />
              </div>
            )}
          </div>
        </div>

        {/* Status toast — rendered outside header flow to avoid overlap */}

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
            onStartTour={handleStartTour}
            tourBounce={!hasSeenTour && !isTourActive}
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
              {agents.size} agents
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
        <div
          ref={mainContentRef}
          className="flex-grow overflow-hidden min-h-0"
          style={
            zoomState.scale !== 1
              ? {
                  transform: `scale(${zoomState.scale})`,
                  transformOrigin: `${zoomState.originX}px ${zoomState.originY}px`,
                  filter: `blur(${Math.min((zoomState.scale - 1) * 1.5, 3)}px)`,
                  transition: "filter 100ms ease-out",
                }
              : undefined
          }
        >
          <ViewTransition
            view={view}
            buildingView={<BuildingView />}
            floorView={<FloorView />}
          />
        </div>
      )}

      {/* Tour overlay */}
      <TourOverlay />

      {/* Fixed bottom-right toast — never overlaps header or content */}
      <div className="fixed bottom-5 right-5 z-50 pointer-events-none">
        <StatusToast message={statusMessage} />
      </div>
    </main>
  );
}
