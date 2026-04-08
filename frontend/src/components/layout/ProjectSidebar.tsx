"use client";

import { useState } from "react";
import {
  useProjectStore,
  selectProjects,
} from "@/stores/projectStore";
import type { ProjectGroup } from "@/types/projects";

export function ProjectSidebar() {
  const projects = useProjectStore(selectProjects);
  const zoomToRoom = useProjectStore((s) => s.zoomToRoom);
  const zoomToOverview = useProjectStore((s) => s.zoomToOverview);

  if (projects.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold text-slate-400">
          PROJECTS ({projects.length})
        </span>
        <button
          className="text-xs text-slate-500 hover:text-slate-300"
          onClick={zoomToOverview}
        >
          Overview
        </button>
      </div>
      {projects.map((project) => (
        <ProjectEntry
          key={project.key}
          project={project}
          onClickProject={() => zoomToRoom(project.key)}
        />
      ))}
      <div className="border-t border-slate-700 my-2" />
    </div>
  );
}

function ProjectEntry({
  project,
  onClickProject,
}: {
  project: ProjectGroup;
  onClickProject: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        className="w-full flex items-center gap-2 px-2 py-1 text-sm hover:bg-slate-700 rounded cursor-pointer"
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
