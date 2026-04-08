/**
 * ProjectRoomGrid - Renders multiple MiniOffice instances in a responsive grid.
 */

"use client";

import { useShallow } from "zustand/react/shallow";
import {
  useProjectStore,
  selectProjects,
  selectActiveRoomKey,
} from "@/stores/projectStore";
import { MiniOffice } from "./MiniOffice";
import { ROOM_GAP } from "@/constants/rooms";

export function ProjectRoomGrid() {
  const projects = useProjectStore(useShallow(selectProjects));
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const zoomToRoom = useProjectStore((s) => s.zoomToRoom);

  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <div className="text-center">
          <p className="text-lg mb-2">No active projects</p>
          <p className="text-sm">
            Start a Claude Code session to see project rooms
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap justify-center items-start p-4 gap-4 h-full overflow-auto"
      style={{ gap: ROOM_GAP }}
    >
      {projects.map((project) => (
        <MiniOffice
          key={project.key}
          project={project}
          isActive={project.key === activeRoomKey}
          onClick={() => zoomToRoom(project.key)}
        />
      ))}
    </div>
  );
}
