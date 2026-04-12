"use client";

import { useState, useCallback } from "react";
import {
  History,
  Radio,
  PlayCircle,
  Play,
  RefreshCw,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR as dateFnsPtBR, es as dateFnsEs } from "date-fns/locale";
import { GitStatusPanel } from "@/components/game/GitStatusPanel";
import { EventLog } from "@/components/game/EventLog";
import { useTranslation } from "@/hooks/useTranslation";
import type { Session } from "@/hooks/useSessions";

// ============================================================================
// GROUPING HELPERS
// ============================================================================

function getProjectKey(session: Session): string {
  if (session.projectName) return session.projectName;
  if (session.projectRoot)
    return session.projectRoot.split("/").pop() ?? "unknown";
  return "unknown";
}

function groupSessionsByProject(sessions: Session[]): Map<string, Session[]> {
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = getProjectKey(s);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }
  const sorted = [...groups.entries()].sort(([, a], [, b]) => {
    const aActive = a.some((s) => s.status === "active");
    const bActive = b.some((s) => s.status === "active");
    if (aActive && !bActive) return -1;
    if (bActive && !aActive) return 1;
    const aNewest = Math.max(...a.map((s) => new Date(s.updatedAt).getTime()));
    const bNewest = Math.max(...b.map((s) => new Date(s.updatedAt).getTime()));
    return bNewest - aNewest;
  });
  return new Map(sorted);
}

// ============================================================================
// TYPES
// ============================================================================

interface MobileDrawerProps {
  isOpen: boolean;
  sessions: Session[];
  sessionsLoading: boolean;
  sessionId: string;
  onClose: () => void;
  onSessionSelect: (id: string) => Promise<void>;
  onSimulate: () => Promise<void>;
  onReset: () => void;
  onClearDB: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Mobile full-screen slide-out drawer that contains session controls, the
 * session list, git status, and event log. Rendered only on mobile viewports.
 * The backdrop click closes the drawer.
 */
export function MobileDrawer({
  isOpen,
  sessions,
  sessionsLoading,
  sessionId,
  onClose,
  onSessionSelect,
  onSimulate,
  onReset,
  onClearDB,
}: MobileDrawerProps): React.ReactNode {
  const { t, language } = useTranslation();
  const dateFnsLocale =
    language === "pt-BR"
      ? dateFnsPtBR
      : language === "es"
        ? dateFnsEs
        : undefined;

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (!isOpen) return null;

  const handleSimulate = async (): Promise<void> => {
    await onSimulate();
    onClose();
  };

  const handleReset = (): void => {
    onReset();
    onClose();
  };

  const handleClearDB = (): void => {
    onClearDB();
    onClose();
  };

  const groups = groupSessionsByProject(sessions);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="absolute left-0 top-0 bottom-0 w-80 bg-slate-900 border-r border-slate-800 overflow-y-auto animate-in slide-in-from-left duration-300">
        <div className="p-4">
          {/* Drawer Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">{t("mobile.menu")}</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"
            >
              <X size={20} />
            </button>
          </div>

          {/* Mobile Controls */}
          <div className="flex flex-col gap-2 mb-6">
            <button
              onClick={handleSimulate}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 rounded text-sm font-bold transition-colors"
            >
              <Play size={16} fill="currentColor" />
              {t("header.simulate")}
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded text-sm font-bold transition-colors"
            >
              <RefreshCw size={16} />
              {t("header.reset")}
            </button>
            <button
              onClick={handleClearDB}
              className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded text-sm font-bold transition-colors"
            >
              <Trash2 size={16} />
              {t("header.clearDb")}
            </button>
          </div>

          {/* Sessions Panel */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <History size={14} className="text-purple-500" />
              <span className="text-slate-300 font-bold uppercase tracking-wider text-xs">
                {t("sessions.title")}
              </span>
              <span className="text-slate-600 text-xs">
                ({sessions.length})
              </span>
            </div>
            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {sessionsLoading && sessions.length === 0 ? (
                <div className="p-4 text-center text-slate-600 text-xs italic">
                  {t("sessions.loading")}
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-4 text-center text-slate-600 text-xs italic">
                  {t("sessions.noSessions")}
                </div>
              ) : (
                [...groups.entries()].map(([projectKey, groupSessions]) => {
                  const hasActive = groupSessions.some(
                    (s) => s.status === "active",
                  );
                  const isActiveSelected = groupSessions.some(
                    (s) => s.id === sessionId,
                  );
                  const isExpanded =
                    expandedGroups.has(projectKey) || isActiveSelected;
                  const primary = groupSessions[0];
                  const rest = groupSessions.slice(1);

                  return (
                    <div key={projectKey} className="flex flex-col">
                      <div
                        role="button"
                        tabIndex={0}
                        className={`px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                          primary.id === sessionId
                            ? "bg-purple-500/20 border-l-2 border-purple-500"
                            : "hover:bg-slate-800/50"
                        }`}
                        onClick={() => {
                          onSessionSelect(primary.id);
                          onClose();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSessionSelect(primary.id);
                            onClose();
                          }
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {hasActive ? (
                            <Radio
                              size={10}
                              className="text-emerald-400 animate-pulse"
                            />
                          ) : (
                            <PlayCircle size={10} className="text-slate-500" />
                          )}
                          <span
                            className={`text-xs font-bold truncate ${
                              primary.id === sessionId
                                ? "text-purple-300"
                                : "text-slate-300"
                            }`}
                          >
                            {projectKey}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span>
                            {t("sessions.events", {
                              count: primary.eventCount,
                            })}
                          </span>
                          <span>
                            {formatDistanceToNow(new Date(primary.updatedAt), {
                              addSuffix: true,
                              locale: dateFnsLocale,
                            })}
                          </span>
                        </div>
                      </div>

                      {rest.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleGroup(projectKey)}
                            className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-slate-600 hover:text-slate-400 font-mono transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown size={10} />
                            ) : (
                              <ChevronRight size={10} />
                            )}
                            {rest.length} older session
                            {rest.length !== 1 ? "s" : ""}
                          </button>

                          {isExpanded &&
                            rest.map((session) => (
                              <div
                                role="button"
                                tabIndex={0}
                                key={session.id}
                                className={`px-3 py-1.5 pl-7 rounded-md cursor-pointer transition-colors ${
                                  session.id === sessionId
                                    ? "bg-purple-500/20 border-l-2 border-purple-500"
                                    : "hover:bg-slate-800/50"
                                }`}
                                onClick={() => {
                                  onSessionSelect(session.id);
                                  onClose();
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onSessionSelect(session.id);
                                    onClose();
                                  }
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <PlayCircle
                                    size={8}
                                    className="text-slate-600"
                                  />
                                  <span className="text-[10px] text-slate-500 font-mono truncate flex-1">
                                    {session.id.slice(0, 12)}
                                  </span>
                                  <span className="text-[10px] text-slate-600">
                                    {formatDistanceToNow(
                                      new Date(session.updatedAt),
                                      {
                                        addSuffix: true,
                                        locale: dateFnsLocale,
                                      },
                                    )}
                                  </span>
                                </div>
                              </div>
                            ))}
                        </>
                      )}
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
  );
}
