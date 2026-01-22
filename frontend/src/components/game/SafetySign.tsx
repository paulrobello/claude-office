"use client";

import { Graphics } from "pixi.js";
import { useCallback, type ReactNode } from "react";
import {
  useGameStore,
  selectToolUsesSinceCompaction,
} from "@/stores/gameStore";

/**
 * SafetySign - Office safety sign showing tool uses since compaction
 *
 * Displays a green safety sign with a counter showing the number of
 * tool uses since the last context compaction.
 */
export function SafetySign(): ReactNode {
  const toolUsesSinceCompaction = useGameStore(selectToolUsesSinceCompaction);

  const drawSign = useCallback((g: Graphics) => {
    g.clear();

    // Shadow
    g.roundRect(4, 4, 140, 100, 6);
    g.fill({ color: 0x000000, alpha: 0.3 });

    // Main sign background - safety green
    g.roundRect(0, 0, 140, 100, 6);
    g.fill(0x1a5f1a);
    g.stroke({ width: 3, color: 0x0d3d0d });

    // White inner border
    g.roundRect(6, 6, 128, 88, 4);
    g.stroke({ width: 2, color: 0xffffff });

    // Red accent bar at top
    g.rect(10, 10, 120, 20);
    g.fill(0xcc2222);
  }, []);

  return (
    <pixiContainer>
      <pixiGraphics draw={drawSign} />
      {/* All text rendered at 2x and scaled down for sharpness */}
      {/* Header text */}
      <pixiContainer x={70} y={20} scale={0.5}>
        <pixiText
          text="⚠️ SAFETY"
          anchor={0.5}
          style={{
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: 22,
            fontWeight: "bold",
            fill: "#ffffff",
          }}
          resolution={2}
        />
      </pixiContainer>
      {/* Big number - dynamic counter */}
      <pixiContainer x={70} y={52} scale={0.5}>
        <pixiText
          text={String(toolUsesSinceCompaction)}
          anchor={0.5}
          style={{
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: 56,
            fontWeight: "bold",
            fill: "#ffffff",
          }}
          resolution={2}
        />
      </pixiContainer>
      {/* Label text */}
      <pixiContainer x={70} y={72} scale={0.5}>
        <pixiText
          text="TOOL USES"
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 18,
            fontWeight: "bold",
            fill: "#ffcc00",
          }}
          resolution={2}
        />
      </pixiContainer>
      <pixiContainer x={70} y={84} scale={0.5}>
        <pixiText
          text="SINCE COMPACTION"
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 18,
            fontWeight: "bold",
            fill: "#ffcc00",
          }}
          resolution={2}
        />
      </pixiContainer>
    </pixiContainer>
  );
}
