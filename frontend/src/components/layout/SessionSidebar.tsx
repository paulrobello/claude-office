"use client";

import { useState, useCallback } from "react";
import {
  History,
  Radio,
  PlayCircle,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR as dateFnsPtBR, es as dateFnsEs } from "date-fns/locale";
import { GitStatusPanel } from "@/components/game/GitStatusPanel";
import type { Session } from "@/hooks/useSessions";
import { useDragResize } from "@/hooks/useDragResize";
import { useTranslation } from "@/hooks/useTranslation";

// ============================================================================
// CONSTANTS
// ============================================================================

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_DEFAULT_WIDTH = 288; // equivalent to w-72
const SESSIONS_MIN_HEIGHT = 80;
const SESSIONS_DEFAULT_HEIGHT = 280;

/** Max height is 70% of viewport to prevent overflow on smaller screens */
const getMaxPanelHeight = () => Math.floor(window.innerHeight * 0.7);

// ============================================================================
// GROUPING HELPERS
// ============================================================================

/** Derive a display name for grouping from a session. */
function getProjectKey(session: Session): string {
  if (session.projectName) return session.projectName;
  if (session.projectRoot)
    return session.projectRoot.split("/").pop() ?? "unknown";
  return "unknown";
}

/** Group sessions by project, sorted: groups with active sessions first, then by most recent update. */
function groupSessionsByProject(sessions: Session[]): Map<string, Session[]> {
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = getProjectKey(s);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  // Sort within each group: active first, then by updatedAt desc
  for (const list of groups.values()) {
    list.sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }
  // Sort groups: those with active sessions first, then by most recent update
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

interface SessionSidebarProps {
  sessions: Session[];
  sessionsLoading: boolean;
  sessionId: string;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onSessionSelect: (id: string) => Promise<void>;
  onDeleteSession: (session: Session) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Desktop left sidebar containing the collapsible session browser and git
 * status panel. Supports drag-to-resize both the sidebar width (right edge)
 * and the sessions panel height (divider between sessions and git status).
 */
export function SessionSidebar({
  sessions,
  sessionsLoading,
  sessionId,
  isCollapsed,
  onToggleCollapsed,
  onSessionSelect,
  onDeleteSession,
}: SessionSidebarProps): React.ReactNode {
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

  const {
    size: sidebarWidth,
    isDragging: isWidthDragging,
    handleDragStart: handleWidthDragStart,
  } = useDragResize({
    initialSize: SIDEBAR_DEFAULT_WIDTH,
    minSize: SIDEBAR_MIN_WIDTH,
    maxSize: SIDEBAR_MAX_WIDTH,
    direction: "horizontal",
    edge: "right",
  });

  const {
    size: sessionsHeight,
    isDragging: isHeightDragging,
    handleDragStart: handleHeightDragStart,
  } = useDragResize({
    initialSize: SESSIONS_DEFAULT_HEIGHT,
    minSize: SESSIONS_MIN_HEIGHT,
    maxSize: getMaxPanelHeight,
    direction: "vertical",
    edge: "down",
  });

  const isDragging = isWidthDragging || isHeightDragging;

  const groups = groupSessionsByProject(sessions);

  return (
    <aside
      className={`relative flex flex-col gap-1.5 flex-shrink-0 overflow-hidden ${
        isDragging ? "select-none" : "transition-all duration-300"
      }`}
      style={{ width: isCollapsed ? 40 : sidebarWidth }}
    >
      {/* Collapse Toggle */}
      <button
        onClick={onToggleCollapsed}
        className="flex items-center justify-center p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
        title={
          isCollapsed
            ? t("sessions.expandSidebar")
            : t("sessions.collapseSidebar")
        }
      >
        {isCollapsed ? (
          <PanelLeftOpen size={16} />
        ) : (
          <PanelLeftClose size={16} />
        )}
      </button>

      {!isCollapsed && (
        <>
          {/* Session Browser */}
          <div
            className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex-shrink-0 flex flex-col"
            style={{ height: sessionsHeight }}
          >
            <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center gap-2 flex-shrink-0">
              <History size={14} className="text-purple-500" />
              <span className="text-slate-300 font-bold uppercase tracking-wider text-xs">
                {t("sessions.title")}
              </span>
              <span className="text-slate-600 text-xs">
                ({sessions.length})
              </span>
            </div>

            <div className="overflow-y-auto flex-grow p-2">
              {sessionsLoading && sessions.length === 0 ? (
                <div className="p-4 text-center text-slate-600 text-xs italic">
                  {t("sessions.loading")}
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-4 text-center text-slate-600 text-xs italic">
                  {t("sessions.noSessions")}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {[...groups.entries()].map(([projectKey, groupSessions]) => {
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
                        {/* Primary session card (always visible) */}
                        <div
                          role="button"
                          tabIndex={0}
                          className={`group relative w-full px-3 py-2 text-left transition-colors cursor-pointer rounded-md ${
                            primary.id === sessionId
                              ? "bg-purple-500/20 border-l-2 border-purple-500"
                              : "hover:bg-slate-800/50"
                          }`}
                          onClick={() => onSessionSelect(primary.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSessionSelect(primary.id);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {hasActive ? (
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
                              className={`text-xs font-bold truncate flex-1 ${
                                primary.id === sessionId
                                  ? "text-purple-300"
                                  : "text-slate-300"
                              }`}
                            >
                              {projectKey}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession(primary);
                              }}
                              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors opacity-0 group-hover:opacity-100"
                              aria-label={`${t("sessions.deleteSession")} ${primary.id}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate mb-1">
                            {primary.id}
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span>
                              {t("sessions.events", {
                                count: primary.eventCount,
                              })}
                            </span>
                            <span>
                              {formatDistanceToNow(
                                new Date(primary.updatedAt),
                                {
                                  addSuffix: true,
                                  locale: dateFnsLocale,
                                },
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Expand/collapse for older sessions */}
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
                                  className={`group relative w-full px-3 py-1.5 pl-7 text-left transition-colors cursor-pointer rounded-md ${
                                    session.id === sessionId
                                      ? "bg-purple-500/20 border-l-2 border-purple-500"
                                      : "hover:bg-slate-800/50"
                                  }`}
                                  onClick={() => onSessionSelect(session.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      onSessionSelect(session.id);
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <PlayCircle
                                      size={8}
                                      className="text-slate-600 flex-shrink-0"
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
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteSession(session);
                                      }}
                                      className="p-0.5 text-slate-600 hover:text-rose-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                                      aria-label={`${t("sessions.deleteSession")} ${session.id}`}
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Vertical Resize Handle (sessions ↕ git status) */}
          <div
            className="flex-shrink-0 h-3 cursor-ns-resize flex items-center justify-center group -my-1"
            onMouseDown={handleHeightDragStart}
            title={t("sessions.dragToResize")}
          >
            <div className="w-10 h-1 rounded-full bg-slate-700 group-hover:bg-purple-500 group-active:bg-purple-400 transition-colors" />
          </div>

          {/* Git Status Panel */}
          <div className="flex-grow min-h-0">
            <GitStatusPanel />
          </div>
        </>
      )}

      {/* Horizontal Resize Handle (right edge) */}
      {!isCollapsed && (
        <div
          className="absolute right-0 top-0 w-1.5 h-full cursor-ew-resize z-10 hover:bg-purple-500/40 active:bg-purple-500/60 transition-colors"
          onMouseDown={handleWidthDragStart}
          title={t("sessions.dragToResize")}
        />
      )}
    </aside>
  );
}
