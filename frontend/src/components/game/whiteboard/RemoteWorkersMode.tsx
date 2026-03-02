"use client";

/**
 * RemoteWorkersMode - Mode 1: Video-call grid of background tasks.
 *
 * Renders up to 6 background tasks in a 3x2 video-tile grid with status LEDs,
 * task IDs, summaries, and status emoji icons.
 */

import { Graphics } from "pixi.js";
import { useCallback, type ReactNode } from "react";
import type { WhiteboardData, BackgroundTask } from "@/types";

export interface RemoteWorkersModeProps {
  data: WhiteboardData;
}

function getStatusColor(status: string): number {
  switch (status) {
    case "completed":
      return 0x22c55e; // green
    case "failed":
      return 0xef4444; // red
    case "running":
      return 0x3b82f6; // blue
    default:
      return 0x6b7280; // gray
  }
}

export function RemoteWorkersMode({ data }: RemoteWorkersModeProps): ReactNode {
  const backgroundTasks = data.backgroundTasks ?? [];
  const tasks = backgroundTasks.slice(0, 6);

  const drawVideoGrid = useCallback((g: Graphics) => {
    g.clear();

    // Draw 3x2 grid of video call tiles
    const tileWidth = 98;
    const tileHeight = 48;
    const padding = 4;
    const startX = 12;
    const startY = 5;

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const x = startX + col * (tileWidth + padding);
        const y = startY + row * (tileHeight + padding);

        // Dark background for tile
        g.roundRect(x, y, tileWidth, tileHeight, 4);
        g.fill(0x1a1a2e);
        g.stroke({ width: 1, color: 0x3d3d5c });
      }
    }
  }, []);

  if (tasks.length === 0) {
    return (
      <pixiContainer>
        <pixiGraphics draw={drawVideoGrid} />
        {/* Position text below the grid (grid ends at ~109px) */}
        <pixiContainer x={165} y={115} scale={0.5}>
          <pixiText
            text="No remote workers"
            anchor={0.5}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 24,
              fill: "#6b7280",
            }}
            resolution={2}
          />
        </pixiContainer>
      </pixiContainer>
    );
  }

  return (
    <pixiContainer>
      <pixiGraphics draw={drawVideoGrid} />

      {/* Render task tiles */}
      {tasks.map((task: BackgroundTask, index: number) => {
        const row = Math.floor(index / 3);
        const col = index % 3;
        const x = 12 + col * 102 + 49; // Center of tile
        const y = 5 + row * 52 + 24; // Center of tile

        const taskIdShort =
          task.taskId.length > 8 ? task.taskId.slice(0, 6) + ".." : task.taskId;
        const summaryText = task.summary
          ? task.summary.length > 12
            ? task.summary.slice(0, 10) + ".."
            : task.summary
          : task.status;

        return (
          <pixiContainer key={task.taskId} x={x} y={y}>
            {/* Status LED indicator */}
            <pixiGraphics
              x={-40}
              y={-18}
              draw={(g: Graphics) => {
                g.clear();
                g.circle(0, 0, 4);
                g.fill(getStatusColor(task.status));
              }}
            />

            {/* Task ID */}
            <pixiText
              text={taskIdShort}
              x={-30}
              y={-20}
              style={{
                fontFamily: '"Courier New", monospace',
                fontSize: 8,
                fill: "#9ca3af",
              }}
              resolution={2}
            />

            {/* Summary text */}
            <pixiText
              text={summaryText}
              anchor={0.5}
              y={0}
              style={{
                fontFamily: '"Courier New", monospace',
                fontSize: 9,
                fill: "#e5e7eb",
              }}
              resolution={2}
            />

            {/* Status emoji */}
            <pixiText
              text={
                task.status === "completed"
                  ? "✅"
                  : task.status === "failed"
                    ? "❌"
                    : "⏳"
              }
              anchor={0.5}
              y={14}
              style={{ fontSize: 10 }}
              resolution={2}
            />
          </pixiContainer>
        );
      })}

      {/* Overflow indicator */}
      {backgroundTasks.length > 6 && (
        <pixiText
          text={`+${backgroundTasks.length - 6} more`}
          x={165}
          y={115}
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 9,
            fill: "#6b7280",
          }}
          resolution={2}
        />
      )}
    </pixiContainer>
  );
}
