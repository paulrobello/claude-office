"use client";

import { useState, useRef } from "react";
import {
  History,
  Radio,
  PlayCircle,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { GitStatusPanel } from "@/components/game/GitStatusPanel";
import type { Session } from "@/hooks/useSessions";
import { useDragResize } from "@/hooks/useDragResize";

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
  onRenameSession: (sessionId: string, displayName: string) => Promise<void>;
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
  onRenameSession,
}: SessionSidebarProps): React.ReactNode {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
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
      style={{
        width: isCollapsed ? 40 : sidebarWidth,
        maxHeight: "calc(100vh - 60px)",
      }}
    >
      {/* Collapse Toggle */}
      <button
        onClick={onToggleCollapsed}
        className="flex items-center justify-center p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
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
                Sessions
              </span>
              <span className="text-slate-600 text-xs">
                ({sessions.length})
              </span>
            </div>

            <div className="overflow-y-auto flex-grow p-2">
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
                        onClick={() => onSessionSelect(session.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSessionSelect(session.id);
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
                          {editingId === session.id ? (
                            <input
                              ref={editRef}
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onBlur={() => {
                                if (
                                  editName.trim() &&
                                  editName !==
                                    (session.displayName || session.projectName)
                                ) {
                                  onRenameSession(session.id, editName.trim());
                                }
                                setEditingId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                } else if (e.key === "Escape") {
                                  setEditingId(null);
                                }
                              }}
                              className="text-xs font-bold bg-transparent border-b border-purple-500 text-white focus:outline-none w-full"
                              autoFocus
                            />
                          ) : (
                            <span
                              className={`text-xs font-bold truncate flex-1 ${
                                isActive ? "text-purple-300" : "text-slate-300"
                              }`}
                              onDoubleClick={() => {
                                setEditingId(session.id);
                                setEditName(
                                  session.displayName ||
                                    session.projectName ||
                                    "",
                                );
                                setTimeout(() => editRef.current?.select(), 50);
                              }}
                              title="Double-click to rename"
                            >
                              {session.displayName ||
                                session.projectName ||
                                "Unknown Project"}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSession(session);
                            }}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors opacity-0 group-hover:opacity-100"
                            aria-label={`Delete session ${session.id}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate mb-1">
                          {session.id.slice(0, 8)}
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span>{session.eventCount} events</span>
                          <span>
                            {formatDistanceToNow(new Date(session.updatedAt), {
                              addSuffix: true,
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

          {/* Vertical Resize Handle (sessions ↕ git status) */}
          <div
            className="flex-shrink-0 h-3 cursor-ns-resize flex items-center justify-center group -my-1"
            onMouseDown={handleHeightDragStart}
            title="Drag to resize"
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
          title="Drag to resize"
        />
      )}
    </aside>
  );
}
