"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { Graphics as PixiGraphics, TextStyle } from "pixi.js";
import { CANVAS_WIDTH } from "@/constants/canvas";

interface RoomLabelProps {
  name: string;
  color: string;
  agentCount: number;
  sessionCount: number;
  /** Width of the label bar. Defaults to CANVAS_WIDTH (for scaled container use). */
  width?: number;
}

export function RoomLabel({
  name,
  color,
  agentCount,
  sessionCount,
  width,
}: RoomLabelProps): ReactNode {
  const barWidth = width ?? CANVAS_WIDTH;
  const colorHex = parseInt(color.slice(1), 16);

  const drawBar = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      // Color bar background
      g.roundRect(0, 0, barWidth, 22, 4);
      g.fill({ color: colorHex, alpha: 0.3 });
      // Color accent line at top
      g.rect(0, 0, barWidth, 3);
      g.fill(colorHex);
    },
    [colorHex, barWidth]
  );

  const nameStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 14,
        fontWeight: "bold",
        fill: color,
      }),
    [color]
  );

  const countStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 11,
        fill: "#94a3b8",
      }),
    []
  );

  return (
    <pixiContainer>
      <pixiGraphics draw={drawBar} />
      <pixiText text={name} style={nameStyle} x={8} y={3} />
      <pixiText
        text={`${agentCount}a · ${sessionCount}s`}
        style={countStyle}
        x={barWidth - 8}
        y={5}
        anchor={{ x: 1, y: 0 }}
      />
    </pixiContainer>
  );
}
