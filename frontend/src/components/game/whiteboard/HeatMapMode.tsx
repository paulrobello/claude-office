"use client";

/**
 * HeatMapMode - Mode 10: File edit frequency heat map.
 *
 * Shows up to 5 most-edited files as horizontal heat bars, color-coded from
 * blue (cold) to red (hot) based on relative edit counts.
 */

import { Graphics } from "pixi.js";
import { type ReactNode } from "react";
import type { WhiteboardData } from "@/types";

export interface HeatMapModeProps {
  data: WhiteboardData;
}

function getHeatColor(count: number, maxEdits: number): number {
  const ratio = count / maxEdits;
  if (ratio > 0.8) return 0xef4444; // red
  if (ratio > 0.6) return 0xf97316; // orange
  if (ratio > 0.4) return 0xf59e0b; // amber
  if (ratio > 0.2) return 0xfbbf24; // yellow
  return 0x60a5fa; // blue
}

export function HeatMapMode({ data }: HeatMapModeProps): ReactNode {
  const entries = Object.entries(data.fileEdits ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxEdits = entries.length > 0 ? entries[0][1] : 1;

  if (entries.length === 0) {
    return (
      <pixiContainer x={165} y={50} scale={0.5}>
        <pixiText
          text="No file edits yet"
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 24,
            fill: "#9ca3af",
          }}
          resolution={2}
        />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer>
      {entries.map(([fileName, count], i) => (
        <pixiContainer key={fileName} y={i * 22}>
          {/* File name */}
          <pixiText
            text={fileName.slice(0, 18)}
            x={16}
            y={3}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 10,
              fill: "#374151",
            }}
            resolution={2}
          />

          {/* Heat bar */}
          <pixiGraphics
            x={140}
            y={2}
            draw={(g: Graphics) => {
              g.clear();
              const width = (count / maxEdits) * 120;
              g.roundRect(0, 0, width, 14, 2);
              g.fill(getHeatColor(count, maxEdits));
            }}
          />

          {/* Count */}
          <pixiText
            text={String(count)}
            x={270}
            y={3}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 10,
              fill: "#6b7280",
            }}
            resolution={2}
          />
        </pixiContainer>
      ))}
    </pixiContainer>
  );
}
