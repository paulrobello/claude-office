/**
 * MultiRoomCanvas - Renders multiple OfficeRoom instances in a 2-column grid.
 *
 * Each room is wrapped in a RoomProvider and rendered at ROOM_SCALE
 * with a RoomLabel above it. Rooms are separated by visible corridors.
 */

"use client";

import { type ReactNode } from "react";
import type { ProjectGroup } from "@/types/projects";
import { RoomProvider } from "@/contexts/RoomContext";
import { OfficeRoom } from "./OfficeRoom";
import { RoomLabel } from "./RoomLabel";
import {
  ROOM_SCALE,
  ROOM_GAP,
  ROOM_GRID_COLS,
} from "@/constants/rooms";
import { CANVAS_WIDTH, getCanvasHeight } from "@/constants/canvas";
import type { OfficeTextures } from "@/hooks/useOfficeTextures";

/** Room height at full scale. Extra padding for boss area overflow. */
const FULL_ROOM_H = getCanvasHeight(8) + 60;

/** Label height at full scale (inside the scaled container). Tight to room. */
const LABEL_H = 42;

/** Edge padding (smaller than inter-room gap). */
const EDGE_PAD = 8;

/** Calculate the x,y position for a room cell (including label) at the given index. */
export function getRoomPosition(index: number) {
  const col = index % ROOM_GRID_COLS;
  const row = Math.floor(index / ROOM_GRID_COLS);
  const cellW = CANVAS_WIDTH * ROOM_SCALE;
  const cellH = (FULL_ROOM_H + LABEL_H) * ROOM_SCALE;
  return {
    x: EDGE_PAD + col * (cellW + ROOM_GAP),
    y: EDGE_PAD + row * (cellH + ROOM_GAP),
  };
}

interface MultiRoomCanvasProps {
  textures: OfficeTextures;
  rooms: ProjectGroup[];
  onRoomClick?: (roomKey: string) => void;
}

export function MultiRoomCanvas({
  textures,
  rooms,
  onRoomClick,
}: MultiRoomCanvasProps): ReactNode {
  if (rooms.length === 0) {
    return null;
  }

  return (
    <>
      {rooms.map((room, index) => {
        const pos = getRoomPosition(index);
        return (
          <pixiContainer
            key={room.key}
            x={pos.x}
            y={pos.y}
            scale={ROOM_SCALE}
            eventMode={onRoomClick ? "static" : "auto"}
            cursor={onRoomClick ? "pointer" : "default"}
            onPointerTap={() => onRoomClick?.(room.key)}
          >
            {/* Label at top (nudged down 4px full-scale = 2px rendered) */}
            <pixiContainer y={4}>
              <RoomLabel
                name={room.name}
                color={room.color}
                agentCount={room.agents.length}
                sessionCount={room.sessionCount}
              />
            </pixiContainer>
            {/* Room content below label */}
            <pixiContainer y={LABEL_H}>
              <RoomProvider project={room}>
                <OfficeRoom textures={textures} />
              </RoomProvider>
            </pixiContainer>
          </pixiContainer>
        );
      })}
    </>
  );
}
