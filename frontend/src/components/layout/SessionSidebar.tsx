"use client";

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
 * status panel. The collapse toggle always renders so the sidebar remains
 * accessible at its minimum width when collapsed.
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
  return (
    <aside
      className={`flex flex-col gap-1.5 flex-shrink-0 overflow-hidden transition-all duration-300 ${
        isCollapsed ? "w-10" : "w-72"
      }`}
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
                          <span
                            className={`text-xs font-bold truncate flex-1 ${
                              isActive ? "text-purple-300" : "text-slate-300"
                            }`}
                          >
                            {session.projectName || "Unknown Project"}
                          </span>
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
                          {session.id}
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

          {/* Git Status Panel */}
          <div className="flex-grow min-h-0">
            <GitStatusPanel />
          </div>
        </>
      )}
    </aside>
  );
}
