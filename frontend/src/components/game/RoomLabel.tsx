"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { Graphics as PixiGraphics, TextStyle } from "pixi.js";
import { CANVAS_WIDTH } from "@/constants/canvas";

interface RoomLabelProps {
  name: string;
  color: string;
  agentCount: number;
  sessionCount: number;
}

/**
 * RoomLabel renders inside the scaled pixiContainer (at full-scale coordinates).
 * At ROOM_SCALE=0.5, a 40px bar becomes 20px on screen.
 */
export function RoomLabel({
  name,
  color,
  agentCount,
  sessionCount,
}: RoomLabelProps): ReactNode {
  const colorHex = parseInt(color.slice(1), 16);

  const drawBar = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.rect(0, 0, CANVAS_WIDTH, 40);
      g.fill({ color: colorHex, alpha: 0.25 });
      g.rect(0, 0, CANVAS_WIDTH, 5);
      g.fill(colorHex);
    },
    [colorHex]
  );

  const nameStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 24,
        fontWeight: "bold",
        fill: color,
      }),
    [color]
  );

  const countStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 18,
        fill: "#94a3b8",
      }),
    []
  );

  return (
    <pixiContainer>
      <pixiGraphics draw={drawBar} />
      <pixiText text={name} style={nameStyle} x={16} y={8} />
      <pixiText
        text={`${agentCount}a · ${sessionCount}s`}
        style={countStyle}
        x={CANVAS_WIDTH - 16}
        y={12}
        anchor={{ x: 1, y: 0 }}
      />
    </pixiContainer>
  );
}
