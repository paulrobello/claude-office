"use client";

import { useState, useCallback } from "react";
import { Layers } from "lucide-react";
import {
  useProjectStore,
  selectProjects,
  selectViewMode,
  selectActiveRoomKey,
} from "@/stores/projectStore";
import { useTranslation } from "@/hooks/useTranslation";
import type { ProjectGroup } from "@/types/projects";

export function ProjectSidebar() {
  const { t } = useTranslation();
  const projects = useProjectStore(selectProjects);
  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const zoomToProjects = useProjectStore((s) => s.zoomToProjects);
  const zoomToProject = useProjectStore((s) => s.zoomToProject);

  /** Click a project → switch to its session and zoom in */
  const handleProjectClick = useCallback((project: ProjectGroup) => {
    // Find the first agent's sessionId to switch session data
    if (project.agents.length > 0) {
      const sid = (project.agents[0] as Record<string, unknown>).sessionId as string | undefined;
      if (sid) {
        window.dispatchEvent(new CustomEvent("office:select-session", { detail: { sessionId: sid } }));
      }
    }
    zoomToProject(project.key);
  }, [zoomToProject]);

  if (projects.length === 0) return null;

  const isAllProjectsActive = viewMode === "projects";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold text-slate-400">
          PROJECTS ({projects.length})
        </span>
      </div>
      {/* All Projects item */}
      <div
        role="button"
        tabIndex={0}
        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer transition-colors ${
          isAllProjectsActive
            ? "bg-purple-500/20 border-l-2 border-purple-500"
            : "hover:bg-slate-700"
        }`}
        onClick={zoomToProjects}
        onKeyDown={(e) => e.key === "Enter" && zoomToProjects()}
      >
        <Layers size={12} className={isAllProjectsActive ? "text-purple-400" : "text-slate-500"} />
        <span className={`truncate ${isAllProjectsActive ? "text-purple-300 font-bold" : "text-slate-300"}`}>
          {t("sidebar.allProjects")}
        </span>
      </div>
      {projects.map((project) => (
        <ProjectEntry
          key={project.key}
          project={project}
          isActive={viewMode === "project" && activeRoomKey === project.key}
          onClickProject={() => handleProjectClick(project)}
        />
      ))}
    </div>
  );
}

function ProjectEntry({
  project,
  isActive,
  onClickProject,
}: {
  project: ProjectGroup;
  isActive: boolean;
  onClickProject: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        className={`w-full flex items-center gap-2 px-2 py-1 text-sm rounded cursor-pointer transition-colors ${
          isActive
            ? "bg-purple-500/20 border-l-2 border-purple-500"
            : "hover:bg-slate-700"
        }`}
        role="button"
        tabIndex={0}
        onClick={onClickProject}
        onKeyDown={(e) => e.key === "Enter" && onClickProject()}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: project.color }}
        />
        <span
          className="text-slate-400 text-xs flex-shrink-0 cursor-pointer select-none"
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span className="truncate text-slate-200">{project.name}</span>
        <span className="text-slate-500 text-xs ml-auto whitespace-nowrap">
          {project.sessionCount}s {project.agents.length}a
        </span>
      </div>

      {expanded && (
        <div className="ml-6 text-xs text-slate-500">
          {project.agents.length === 0 ? (
            <div className="py-0.5 italic">No agents</div>
          ) : (
            project.agents.map((agent) => (
              <div key={agent.id} className="py-0.5 truncate flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      agent.state === "working"
                        ? "#22C55E"
                        : agent.state === "waiting_permission"
                          ? "#EF4444"
                          : "#64748B",
                  }}
                />
                {agent.name || agent.id}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
