/**
 * MiniOffice - A self-contained, scalable mini-office for a single project.
 *
 * Renders a simplified office view with project info, agent indicators,
 * and room furniture hints. Used in the ProjectRoomGrid for overview mode.
 *
 * Future iterations will integrate full AgentSprite and furniture components.
 */

"use client";

import { useCallback, useMemo } from "react";
import { ROOM_WIDTH, ROOM_HEIGHT } from "@/constants/rooms";
import type { ProjectGroup } from "@/types/projects";

interface MiniOfficeProps {
  project: ProjectGroup;
  isActive?: boolean;
  onClick?: () => void;
}

/** Agent state to display color */
function getAgentStatusColor(state: string): string {
  switch (state) {
    case "working":
      return "#22C55E"; // green
    case "thinking":
      return "#EAB308"; // yellow
    case "waiting_permission":
      return "#EF4444"; // red
    case "arriving":
    case "walking_to_desk":
      return "#3B82F6"; // blue
    default:
      return "#64748B"; // gray
  }
}

export function MiniOffice({
  project,
  isActive = false,
  onClick,
}: MiniOfficeProps) {
  const handleClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  const activeAgents = useMemo(
    () => project.agents.filter((a) => a.state === "working" || a.state === "thinking"),
    [project.agents]
  );

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      className="relative cursor-pointer transition-all duration-200 hover:scale-[1.02]"
      style={{
        width: ROOM_WIDTH / 2,
        height: ROOM_HEIGHT / 2,
        border: `${isActive ? 3 : 2}px solid ${project.color}`,
        borderRadius: 8,
        backgroundColor: "#1e1e2e",
        opacity: isActive ? 1 : 0.85,
        boxShadow: isActive
          ? `0 0 20px ${project.color}40`
          : "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 rounded-t-md"
        style={{ backgroundColor: `${project.color}20` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <span
            className="text-sm font-bold truncate max-w-[180px]"
            style={{ color: project.color }}
          >
            {project.name}
          </span>
        </div>
        <span className="text-xs text-slate-400">
          {project.agents.length}a / {project.sessionCount}s
        </span>
      </div>

      {/* Office floor area */}
      <div className="relative flex-1 p-3">
        {/* Agent grid */}
        <div className="flex flex-wrap gap-2 mt-1">
          {project.agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-1 bg-slate-800 rounded px-2 py-1 text-xs"
              title={`${agent.name || agent.id} — ${agent.state}`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: getAgentStatusColor(agent.state) }}
              />
              <span className="text-slate-300 truncate max-w-[80px]">
                {agent.name || `Agent ${agent.number}`}
              </span>
            </div>
          ))}
        </div>

        {/* Boss indicator */}
        <div className="absolute bottom-2 left-3 flex items-center gap-1 text-xs text-slate-500">
          <span className="text-yellow-500">&#9733;</span>
          <span className="truncate max-w-[200px]">
            {project.boss.currentTask || "Boss idle"}
          </span>
        </div>

        {/* Activity indicator */}
        {activeAgents.length > 0 && (
          <div className="absolute top-2 right-3">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: project.color }}
              />
              <span
                className="relative inline-flex rounded-full h-2.5 w-2.5"
                style={{ backgroundColor: project.color }}
              />
            </span>
          </div>
        )}
      </div>

      {/* Stats footer */}
      <div className="flex items-center justify-between px-3 py-1 text-xs text-slate-500 border-t border-slate-700">
        <span>{project.todos.length} tasks</span>
        <span>{activeAgents.length} active</span>
      </div>
    </div>
  );
}
