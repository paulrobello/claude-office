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
      // Color bar background
      g.roundRect(0, 0, CANVAS_WIDTH, 40, 4);
      g.fill({ color: colorHex, alpha: 0.3 });
      // Color accent line at top
      g.rect(0, 0, CANVAS_WIDTH, 4);
      g.fill(colorHex);
    },
    [colorHex]
  );

  const nameStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 20,
        fontWeight: "bold",
        fill: color,
      }),
    [color]
  );

  const countStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 14,
        fill: "#94a3b8",
      }),
    []
  );

  return (
    <pixiContainer y={-48}>
      <pixiGraphics draw={drawBar} />
      <pixiText text={name} style={nameStyle} x={12} y={10} />
      <pixiText
        text={`${agentCount} agents · ${sessionCount} sessions`}
        style={countStyle}
        x={CANVAS_WIDTH - 12}
        y={14}
        anchor={{ x: 1, y: 0 }}
      />
    </pixiContainer>
  );
}
