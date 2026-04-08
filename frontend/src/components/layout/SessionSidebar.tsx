"use client";

import { useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  History,
  Radio,
  PlayCircle,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR as dateFnsPtBR, es as dateFnsEs } from "date-fns/locale";
import { GitStatusPanel } from "@/components/game/GitStatusPanel";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import type { Session } from "@/hooks/useSessions";
import { useDragResize } from "@/hooks/useDragResize";
import { useTranslation } from "@/hooks/useTranslation";
import { useProjectStore, selectViewMode, selectActiveRoomKey } from "@/stores/projectStore";
import { useGameStore, selectGitStatus } from "@/stores/gameStore";

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

  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const setViewMode = useProjectStore((s) => s.setViewMode);
  const zoomToSession = useProjectStore((s) => s.zoomToSession);
  const gitStatus = useGameStore(selectGitStatus);
  const [gitExpanded, setGitExpanded] = useState(false);

  // Derive which tab is active from viewMode
  type SidebarTab = "office" | "projects" | "sessions";
  const activeTab: SidebarTab =
    viewMode === "office"
      ? "office"
      : viewMode === "projects" || viewMode === "project"
        ? "projects"
        : "sessions";

  const segments: { key: SidebarTab; icon: typeof Building2; mode: "office" | "projects" | "sessions" }[] = [
    { key: "office", icon: Building2, mode: "office" },
    { key: "projects", icon: FolderKanban, mode: "projects" },
    { key: "sessions", icon: History, mode: "sessions" },
  ];

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

  return (
    <aside
      className={`relative flex flex-col gap-1.5 flex-shrink-0 overflow-hidden ${
        isDragging ? "select-none" : "transition-all duration-300"
      }`}
      style={{ width: isCollapsed ? 40 : sidebarWidth }}
    >
      {/* Top bar: Segment Control + Collapse Toggle */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isCollapsed ? (
          <button
            onClick={onToggleCollapsed}
            className="flex items-center justify-center p-2 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            title={t("sessions.expandSidebar")}
          >
            <PanelLeftOpen size={16} />
          </button>
        ) : (
          <>
            {/* Segment Control */}
            <div className="flex flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5">
              {segments.map(({ key, icon: Icon, mode }) => (
                <button
                  key={key}
                  onClick={() => setViewMode(mode)}
                  className={`flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${
                    activeTab === key
                      ? "bg-purple-600 text-white shadow-sm"
                      : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                  title={t(`sidebar.tab.${key}`)}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
            {/* Collapse Toggle */}
            <button
              onClick={onToggleCollapsed}
              className="flex items-center justify-center p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              title={t("sessions.collapseSidebar")}
            >
              <PanelLeftClose size={14} />
            </button>
          </>
        )}
      </div>

      {!isCollapsed && (
        <>
          {/* Tab Content */}
          {activeTab === "projects" && (
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex-grow min-h-0">
              <ProjectSidebar />
            </div>
          )}

          {activeTab === "sessions" && (
            <div
              className={`bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col ${
                gitStatus ? "flex-shrink-0" : "flex-grow"
              }`}
              style={gitStatus ? { height: sessionsHeight } : undefined}
            >
              <div className="overflow-y-auto flex-grow p-2">
                {sessionsLoading && sessions.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 dark:text-slate-600 text-xs italic">
                    {t("sessions.loading")}
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 dark:text-slate-600 text-xs italic">
                    {t("sessions.noSessions")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {sessions.filter((s) => s.id !== "__all__").map((session) => {
                      const isActive = viewMode === "session" && activeRoomKey === session.id;
                      const isLive = session.status === "active";
                      return (
                        <div
                          role="button"
                          tabIndex={0}
                          key={session.id}
                          className={`group relative w-full px-3 py-2.5 text-left transition-colors cursor-pointer rounded-md ${
                            isActive
                              ? "bg-purple-500/20 border-l-2 border-purple-500"
                              : "hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                          }`}
                          onClick={() => {
                            onSessionSelect(session.id);
                            zoomToSession(session.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSessionSelect(session.id);
                              zoomToSession(session.id);
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
                                className="text-slate-400 dark:text-slate-500 flex-shrink-0"
                              />
                            )}
                            <span
                              className={`text-xs font-bold truncate flex-1 ${
                                isActive
                                  ? "text-purple-300"
                                  : "text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {session.projectName ||
                                t("sessions.unknownProject")}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession(session);
                              }}
                              className="p-1 text-slate-400 dark:text-slate-500 hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors opacity-0 group-hover:opacity-100"
                              aria-label={`${t("sessions.deleteSession")} ${session.id}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate mb-1">
                            {session.id}
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
                            <span>
                              {t("sessions.events", { count: session.eventCount })}
                            </span>
                            <span>
                              {formatDistanceToNow(new Date(session.updatedAt), {
                                addSuffix: true,
                                locale: dateFnsLocale,
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Git Status Panel (only when git data exists, default collapsed) */}
          {gitStatus && (
            <>
              <button
                onClick={() => setGitExpanded(!gitExpanded)}
                className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {gitExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="text-xs font-bold uppercase tracking-wider">{t("git.title")}</span>
                <span className="text-emerald-400 text-xs font-mono ml-auto">{gitStatus.branch}</span>
              </button>
              {gitExpanded && (
                <>
                  <div
                    className="flex-shrink-0 h-3 cursor-ns-resize flex items-center justify-center group -my-1"
                    onMouseDown={handleHeightDragStart}
                    title={t("sessions.dragToResize")}
                  >
                    <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700 group-hover:bg-purple-500 group-active:bg-purple-400 transition-colors" />
                  </div>
                  <div className="flex-grow min-h-0">
                    <GitStatusPanel />
                  </div>
                </>
              )}
            </>
          )}
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
