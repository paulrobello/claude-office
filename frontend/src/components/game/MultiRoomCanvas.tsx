/**
 * MultiRoomCanvas - Renders multiple OfficeRoom instances in a 2-column grid.
 *
 * Each room is wrapped in a RoomProvider and rendered at ROOM_SCALE
 * with a RoomLabel above it.
 */

"use client";

import { type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore, selectProjects } from "@/stores/projectStore";
import { RoomProvider } from "@/contexts/RoomContext";
import { OfficeRoom } from "./OfficeRoom";
import { RoomLabel } from "./RoomLabel";
import {
  ROOM_SCALE,
  ROOM_GAP,
  ROOM_GRID_COLS,
  ROOM_LABEL_HEIGHT,
} from "@/constants/rooms";
import { CANVAS_WIDTH, getCanvasHeight } from "@/constants/canvas";
import type { OfficeTextures } from "@/hooks/useOfficeTextures";

/** Default room height — 8 desks (the minimum desk count). */
const DEFAULT_ROOM_HEIGHT = getCanvasHeight(8);

/** Calculate the x,y position for a room at the given index. */
export function getRoomPosition(index: number, roomHeight: number = DEFAULT_ROOM_HEIGHT) {
  const col = index % ROOM_GRID_COLS;
  const row = Math.floor(index / ROOM_GRID_COLS);
  const scaledW = CANVAS_WIDTH * ROOM_SCALE;
  const scaledH = roomHeight * ROOM_SCALE;
  return {
    x: ROOM_GAP + col * (scaledW + ROOM_GAP),
    y: ROOM_GAP + ROOM_LABEL_HEIGHT + row * (scaledH + ROOM_LABEL_HEIGHT + ROOM_GAP),
  };
}

interface MultiRoomCanvasProps {
  textures: OfficeTextures;
}

export function MultiRoomCanvas({
  textures,
}: MultiRoomCanvasProps): ReactNode {
  const projects = useProjectStore(useShallow(selectProjects));

  if (projects.length === 0) {
    return null;
  }

  return (
    <>
      {projects.map((project, index) => {
        const pos = getRoomPosition(index);
        const scaledW = CANVAS_WIDTH * ROOM_SCALE;
        return (
          <pixiContainer key={project.key}>
            {/* Room label at full scale, above the scaled room */}
            <pixiContainer x={pos.x} y={pos.y - ROOM_LABEL_HEIGHT}>
              <RoomLabel
                name={project.name}
                color={project.color}
                agentCount={project.agents.length}
                sessionCount={project.sessionCount}
                width={scaledW}
              />
            </pixiContainer>
            {/* Room content at ROOM_SCALE */}
            <pixiContainer x={pos.x} y={pos.y} scale={ROOM_SCALE}>
              <RoomProvider project={project}>
                <OfficeRoom textures={textures} />
              </RoomProvider>
            </pixiContainer>
          </pixiContainer>
        );
      })}
    </>
  );
}
