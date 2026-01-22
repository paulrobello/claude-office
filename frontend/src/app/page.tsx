/**
 * Claude Office Visualizer - Main Page
 *
 * Uses the unified Zustand store, XState machines, and OfficeGame component.
 */

"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocketEvents } from "@/hooks/useWebSocketEvents";
import {
  useGameStore,
  selectIsConnected,
  selectDebugMode,
  selectAgents,
  selectBoss,
} from "@/stores/gameStore";
import { useShallow } from "zustand/react/shallow";
import {
  Activity,
  Play,
  RefreshCw,
  Bug,
  Trash2,
  History,
  Radio,
  PlayCircle,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Users,
} from "lucide-react";
import { GitStatusPanel } from "@/components/game/GitStatusPanel";
import { EventLog } from "@/components/game/EventLog";
import { AgentStatus } from "@/components/game/AgentStatus";
import { agentMachineService } from "@/machines/agentMachineService";
import { formatDistanceToNow } from "date-fns";
import Modal from "@/components/overlay/Modal";

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

interface Session {
  id: string;
  projectName: string | null;
  projectRoot: string | null; // Git project root path
  createdAt: string;
  updatedAt: string;
  status: string;
  eventCount: number;
}

export default function V2TestPage(): React.ReactNode {
  const [sessionId, setSessionId] = useState("sim_session_123");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [sessionPendingDelete, setSessionPendingDelete] =
    useState<Session | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "info" | "error" | "success";
  } | null>(null);
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState<boolean | null>(
    null,
  );
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Connect to WebSocket with new hook
  useWebSocketEvents({ sessionId });

  // Fetch server status (AI summary enabled)
  useEffect(() => {
    fetch("http://localhost:8000/api/v1/status")
      .then((res) => res.json())
      .then((data) => setAiSummaryEnabled(data.aiSummaryEnabled))
      .catch(() => setAiSummaryEnabled(false));
  }, []);

  // Store selectors
  const isConnected = useGameStore(selectIsConnected);
  const debugMode = useGameStore(selectDebugMode);
  const agents = useGameStore(useShallow(selectAgents));
  const boss = useGameStore(selectBoss);
  const loadPersistedDebugSettings = useGameStore(
    (state) => state.loadPersistedDebugSettings,
  );

  // Detect mobile breakpoint (< 768px)
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Load persisted debug settings on mount (after hydration to avoid mismatch)
  useEffect(() => {
    loadPersistedDebugSettings();
  }, [loadPersistedDebugSettings]);

  const showStatus = useCallback(
    (text: string, type: "info" | "error" | "success" = "info") => {
      setStatusMessage({ text, type });
      setTimeout(() => setStatusMessage(null), 3000);
    },
    [],
  );

  // Fetch sessions list
  const fetchSessions = useCallback(async (): Promise<
    typeof sessions | null
  > => {
    setSessionsLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/sessions");
      if (res.ok) {
        const data = await res.json();
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
  const hasAutoSelected = useRef(false);
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
          `Connected to ${activeSession.projectName || activeSession.id.slice(0, 8)}`,
          "info",
        );
      }
    }
  }, [sessions, sessionId, showStatus]);

  // Handle session selection
  const handleSessionSelect = async (id: string) => {
    if (id === sessionId) {
      return;
    }

    // Reset state machines and store for session switch
    // Use resetForSessionSwitch (not resetForReplay) to keep isReplaying=false
    // so WebSocket will reconnect to the new session
    agentMachineService.reset();
    useGameStore.getState().resetForSessionSwitch();

    setSessionId(id);
    showStatus(`Switched to session ${id.slice(0, 8)}...`, "info");
  };

  // Handle Clear DB
  const handleClearDB = async () => {
    setIsClearModalOpen(false);

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

  // Handle delete single session
  const handleDeleteSession = async () => {
    if (!sessionPendingDelete) return;
    const id = sessionPendingDelete.id;
    setSessionPendingDelete(null);

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
        showStatus(`Session deleted.`, "success");
      } else {
        showStatus(`Failed to delete session.`, "error");
      }
    } catch (e) {
      console.error(e);
      showStatus("Error connecting to backend.", "error");
    }
  };

  // Note: Don't reset on mount - it clears agents detected by WebSocket
  // Only reset manually via the RESET button

  const handleSimulate = async () => {
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

  const handleReset = () => {
    agentMachineService.reset();
    useGameStore.getState().resetForSessionSwitch();
    showStatus("Store reset.", "info");
  };

  const handleToggleDebug = () => {
    useGameStore.getState().setDebugMode(!debugMode);
  };

  return (
    <main className="flex h-screen flex-col bg-neutral-950 p-2 overflow-hidden relative">
      {/* Clear DB Modal */}
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
              onClick={handleClearDB}
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

      {/* Help Modal */}
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

      {/* Delete Session Confirmation Modal */}
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
              onClick={handleDeleteSession}
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
          This will permanently remove {sessionPendingDelete?.eventCount || 0}{" "}
          events. This action cannot be undone.
        </p>
      </Modal>

      {/* Header */}
      <header className="flex justify-between items-center mb-2 px-1 relative h-12">
        <div className="flex items-center gap-3">
          {/* Hamburger menu button - mobile only */}
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}
          <div className="flex flex-col">
            <h1
              className={`font-bold text-white tracking-tight flex items-center gap-2 ${isMobile ? "text-lg" : "text-2xl"}`}
            >
              <span className="text-orange-500">Claude</span>{" "}
              {!isMobile && "Office Visualizer"}
              {!isMobile && (
                <span className="text-xs font-mono font-normal px-2 py-0.5 bg-slate-800 rounded text-slate-400 border border-slate-700">
                  v0.5.0
                </span>
              )}
            </h1>
          </div>
        </div>

        {/* Status Toast */}
        <div className="absolute left-1/3 -translate-x-1/2 flex items-center pointer-events-none">
          {statusMessage && (
            <div
              className={`px-4 py-1.5 rounded-full border shadow-lg flex items-center gap-3 text-[11px] font-bold tracking-wide uppercase whitespace-nowrap animate-in slide-in-from-top-2 duration-300
                ${
                  statusMessage.type === "success"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : statusMessage.type === "error"
                      ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                      : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                }`}
            >
              <Activity
                size={12}
                className={statusMessage.type === "info" ? "animate-pulse" : ""}
              />
              {statusMessage.text}
            </div>
          )}
        </div>

        {/* Controls - Desktop only */}
        {!isMobile && (
          <div className="flex gap-4 items-center">
            <button
              onClick={handleSimulate}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 rounded text-xs font-bold transition-colors"
            >
              <Play size={14} fill="currentColor" />
              SIMULATE
            </button>

            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded text-xs font-bold transition-colors"
            >
              <RefreshCw size={14} />
              RESET
            </button>

            <button
              onClick={() => setIsClearModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded text-xs font-bold transition-colors"
            >
              <Trash2 size={14} />
              CLEAR DB
            </button>

            <button
              onClick={handleToggleDebug}
              className={`flex items-center gap-2 px-3 py-1.5 border rounded text-xs font-bold transition-colors ${
                debugMode
                  ? "bg-green-500/20 text-green-400 border-green-500/30"
                  : "bg-slate-500/10 text-slate-400 border-slate-500/30 hover:bg-slate-500/20"
              }`}
            >
              <Bug size={14} />
              DEBUG {debugMode ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => setIsHelpModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors"
            >
              <HelpCircle size={14} />
              HELP
            </button>

            <div className="flex flex-col items-end border-l border-slate-800 pl-4">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest leading-none mb-1">
                Status
              </span>
              <div className="flex items-center gap-3">
                <div
                  className={`flex items-center gap-1.5 font-mono text-xs ${
                    isConnected ? "text-emerald-400" : "text-rose-500"
                  }`}
                >
                  <Activity
                    size={12}
                    className={isConnected ? "animate-pulse" : ""}
                  />
                  {isConnected ? "CONNECTED" : "DISCONNECTED"}
                </div>
                <div
                  className={`flex items-center gap-1.5 font-mono text-xs ${
                    aiSummaryEnabled ? "text-violet-400" : "text-slate-500"
                  }`}
                >
                  <span className="text-[10px]">AI</span>
                  {aiSummaryEnabled ? "ON" : "OFF"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile status indicator */}
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

      {/* Mobile Slide-out Menu */}
      {isMobile && mobileMenuOpen && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute left-0 top-0 bottom-0 w-80 bg-slate-900 border-r border-slate-800 overflow-y-auto animate-in slide-in-from-left duration-300">
            <div className="p-4">
              {/* Drawer Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Menu</h2>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Mobile Controls */}
              <div className="flex flex-col gap-2 mb-6">
                <button
                  onClick={() => {
                    handleSimulate();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 rounded text-sm font-bold transition-colors"
                >
                  <Play size={16} fill="currentColor" />
                  SIMULATE
                </button>
                <button
                  onClick={() => {
                    handleReset();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded text-sm font-bold transition-colors"
                >
                  <RefreshCw size={16} />
                  RESET
                </button>
                <button
                  onClick={() => {
                    setIsClearModalOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded text-sm font-bold transition-colors"
                >
                  <Trash2 size={16} />
                  CLEAR DB
                </button>
              </div>

              {/* Sessions Panel */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <History size={14} className="text-purple-500" />
                  <span className="text-slate-300 font-bold uppercase tracking-wider text-xs">
                    Sessions
                  </span>
                  <span className="text-slate-600 text-xs">
                    ({sessions.length})
                  </span>
                </div>
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                  {sessionsLoading && sessions.length === 0 ? (
                    <div className="p-4 text-center text-slate-600 text-xs italic">
                      Loading sessions...
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="p-4 text-center text-slate-600 text-xs italic">
                      No sessions found
                    </div>
                  ) : (
                    sessions.map((session) => {
                      const isActive = session.id === sessionId;
                      const isLive = session.status === "active";
                      return (
                        <div
                          role="button"
                          tabIndex={0}
                          key={session.id}
                          className={`px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                            isActive
                              ? "bg-purple-500/20 border-l-2 border-purple-500"
                              : "hover:bg-slate-800/50"
                          }`}
                          onClick={() => {
                            handleSessionSelect(session.id);
                            setMobileMenuOpen(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleSessionSelect(session.id);
                              setMobileMenuOpen(false);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {isLive ? (
                              <Radio
                                size={10}
                                className="text-emerald-400 animate-pulse"
                              />
                            ) : (
                              <PlayCircle
                                size={10}
                                className="text-slate-500"
                              />
                            )}
                            <span
                              className={`text-xs font-bold truncate ${isActive ? "text-purple-300" : "text-slate-300"}`}
                            >
                              {session.projectName || "Unknown Project"}
                            </span>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span>{session.eventCount} events</span>
                            <span>
                              {formatDistanceToNow(
                                new Date(session.updatedAt),
                                { addSuffix: true },
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Git Status Panel */}
              <div className="mb-6">
                <GitStatusPanel />
              </div>

              {/* Event Log */}
              <div>
                <EventLog />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      {isMobile ? (
        /* Mobile Layout - Stacked */
        <div className="flex-grow flex flex-col gap-1.5 overflow-hidden min-h-0">
          {/* Office Canvas - ~60% height */}
          <div className="flex-[3] border border-slate-800 rounded-lg shadow-2xl bg-slate-900 overflow-hidden relative min-h-0">
            <OfficeGame />
          </div>

          {/* Agent Activity Panel - ~40% height */}
          <div className="flex-[2] bg-slate-950 border border-slate-800 rounded-lg overflow-hidden min-h-0">
            <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center gap-2">
              <Users size={14} className="text-blue-500" />
              <span className="text-slate-300 font-bold uppercase tracking-wider text-xs">
                Agent Activity
              </span>
              <span className="text-slate-600 text-xs">({agents.size})</span>
            </div>
            <div className="overflow-y-auto h-[calc(100%-36px)] p-2">
              {/* Boss Status */}
              <div className="mb-3 p-2 bg-slate-900/50 rounded-lg border border-amber-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-amber-400 font-bold text-xs">BOSS</span>
                  <span className="text-slate-500 text-[10px] font-mono ml-auto">
                    {boss.backendState}
                  </span>
                </div>
                {boss.currentTask && (
                  <p className="text-slate-400 text-[11px] truncate">
                    {boss.currentTask}
                  </p>
                )}
                {boss.bubble.content && (
                  <p className="text-blue-400 text-[11px] mt-1 truncate italic">
                    &quot;{boss.bubble.content.text}&quot;
                  </p>
                )}
              </div>

              {/* Agent List */}
              {agents.size === 0 ? (
                <div className="text-center text-slate-600 text-xs italic py-4">
                  No active agents
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {Array.from(agents.values()).map((agent) => (
                    <div
                      key={agent.id}
                      className="p-2 bg-slate-900/50 rounded-lg border border-slate-800"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor: agent.color,
                          }}
                        />
                        <span className="text-slate-300 font-bold text-xs">
                          {agent.name}
                        </span>
                        <span className="text-slate-600 text-[10px] font-mono ml-auto">
                          {agent.phase}
                        </span>
                      </div>
                      {agent.currentTask && (
                        <p className="text-slate-400 text-[11px] truncate">
                          {agent.currentTask}
                        </p>
                      )}
                      {agent.bubble.content && (
                        <p className="text-emerald-400 text-[11px] mt-1 truncate italic">
                          &quot;{agent.bubble.content.text}&quot;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Desktop Layout - 3 Panel */
        <div className="flex-grow flex gap-2 overflow-hidden min-h-0">
          {/* Left Sidebar - Sessions & Git Status */}
          <aside
            className={`flex flex-col gap-1.5 flex-shrink-0 overflow-hidden transition-all duration-300 ${
              leftSidebarCollapsed ? "w-10" : "w-72"
            }`}
          >
            {/* Collapse Toggle */}
            <button
              onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
              className="flex items-center justify-center p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              title={
                leftSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
            >
              {leftSidebarCollapsed ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </button>

            {!leftSidebarCollapsed && (
              <>
                {/* Session Browser */}
                <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex-shrink-0 max-h-[40%]">
                  <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center gap-2">
                    <History size={14} className="text-purple-500" />
                    <span className="text-slate-300 font-bold uppercase tracking-wider text-xs">
                      Sessions
                    </span>
                    <span className="text-slate-600 text-xs">
                      ({sessions.length})
                    </span>
                  </div>
                  <div className="overflow-y-auto max-h-72 p-2">
                    {sessionsLoading && sessions.length === 0 ? (
                      <div className="p-4 text-center text-slate-600 text-xs italic">
                        Loading sessions...
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="p-4 text-center text-slate-600 text-xs italic">
                        No sessions found
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {sessions.map((session) => {
                          const isActive = session.id === sessionId;
                          const isLive = session.status === "active";
                          return (
                            <div
                              role="button"
                              tabIndex={0}
                              key={session.id}
                              className={`group relative w-full px-3 py-2.5 text-left transition-colors cursor-pointer rounded-md ${
                                isActive
                                  ? "bg-purple-500/20 border-l-2 border-purple-500"
                                  : "hover:bg-slate-800/50"
                              }`}
                              onClick={() => handleSessionSelect(session.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleSessionSelect(session.id);
                                }
                              }}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                {isLive ? (
                                  <Radio
                                    size={10}
                                    className="text-emerald-400 animate-pulse flex-shrink-0"
                                  />
                                ) : (
                                  <PlayCircle
                                    size={10}
                                    className="text-slate-500 flex-shrink-0"
                                  />
                                )}
                                <span
                                  className={`text-xs font-bold truncate flex-1 ${isActive ? "text-purple-300" : "text-slate-300"}`}
                                >
                                  {session.projectName || "Unknown Project"}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSessionPendingDelete(session);
                                  }}
                                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors opacity-0 group-hover:opacity-100"
                                  aria-label={`Delete session ${session.id}`}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono truncate mb-1">
                                {session.id}
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-500">
                                <span>{session.eventCount} events</span>
                                <span>
                                  {formatDistanceToNow(
                                    new Date(session.updatedAt),
                                    {
                                      addSuffix: true,
                                    },
                                  )}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Git Status Panel */}
                <div className="flex-grow min-h-0">
                  <GitStatusPanel />
                </div>
              </>
            )}
          </aside>

          {/* Game Canvas */}
          <div className="flex-grow border border-slate-800 rounded-lg shadow-2xl bg-slate-900 overflow-hidden relative">
            <OfficeGame />
          </div>

          {/* Right Sidebar - Debug Panel */}
          <aside className="w-80 flex flex-col gap-2 flex-shrink-0 overflow-hidden">
            {/* Agent Status - 40% of available height */}
            <div className="min-h-0" style={{ flex: "2 1 0" }}>
              <AgentStatus />
            </div>

            {/* Event Log - 60% of available height */}
            <div className="min-h-0" style={{ flex: "3 1 0" }}>
              <EventLog />
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
