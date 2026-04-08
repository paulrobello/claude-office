/**
 * RoomBorder - Colored border with project label for PixiJS room rendering.
 * Used in future PixiJS-based room detail view.
 *
 * Uses PixiJS intrinsic elements (pixiGraphics/pixiText) which require
 * the @pixi/react extend() call to be active in the parent component.
 */

"use client";

import { TextStyle, type Graphics as PixiGraphicsType } from "pixi.js";
import { useMemo, useCallback } from "react";
import { ROOM_WIDTH, ROOM_HEIGHT } from "@/constants/rooms";

interface RoomBorderProps {
  color: string;
  name: string;
  isActive?: boolean;
}

export function RoomBorder({
  color,
  name,
  isActive = false,
}: RoomBorderProps) {
  const style = useMemo(
    () =>
      new TextStyle({
        fontFamily: "monospace",
        fontSize: 16,
        fill: color,
        fontWeight: "bold",
      }),
    [color]
  );

  const drawBorder = useCallback(
    (g: PixiGraphicsType) => {
      g.clear();
      const c = parseInt(color.slice(1), 16);
      g.lineStyle(isActive ? 4 : 2, c, isActive ? 1 : 0.7);
      g.drawRoundedRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT, 8);
    },
    [color, isActive]
  );

  return (
    <>
      <pixiGraphics draw={drawBorder} />
      <pixiText text={name} style={style} x={12} y={-20} />
    </>
  );
}
