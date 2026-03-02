"use client";

/**
 * ToolPizzaMode - Mode 2: Pie chart of tool usage.
 *
 * Renders a pizza-style pie chart showing the distribution of tool calls
 * by category, with a legend showing top 6 categories by count.
 */

import { Graphics } from "pixi.js";
import { useCallback, type ReactNode } from "react";

export interface ToolPizzaModeProps {
  toolUsage: Record<string, number>;
}

export const PIZZA_COLORS: Record<string, number> = {
  read: 0x3b82f6, // blue
  write: 0x22c55e, // green
  edit: 0xf59e0b, // amber
  bash: 0x8b5cf6, // purple
  task: 0xec4899, // pink
  todo: 0x06b6d4, // cyan
  web: 0xef4444, // red
  other: 0x6b7280, // gray
};

export function ToolPizzaMode({ toolUsage }: ToolPizzaModeProps): ReactNode {
  const total = Object.values(toolUsage).reduce((a, b) => a + b, 0);

  const drawPizza = useCallback(
    (g: Graphics) => {
      g.clear();
      const cx = 80;
      const cy = 55;
      const radius = 45;

      if (total === 0) {
        // Empty pizza base
        g.circle(cx, cy, radius);
        g.fill(0xfcd34d);
        g.stroke({ width: 3, color: 0xb45309 });
        return;
      }

      // Draw pizza slices
      let startAngle = -Math.PI / 2;
      const entries = Object.entries(toolUsage).filter(
        ([, count]) => count > 0,
      );

      entries.forEach(([category, count]) => {
        const sliceAngle = (count / total) * Math.PI * 2;
        const endAngle = startAngle + sliceAngle;

        // Draw slice
        g.moveTo(cx, cy);
        g.arc(cx, cy, radius, startAngle, endAngle);
        g.lineTo(cx, cy);
        g.fill(PIZZA_COLORS[category] ?? 0x6b7280);

        startAngle = endAngle;
      });

      // Pizza crust edge
      g.circle(cx, cy, radius);
      g.stroke({ width: 3, color: 0xb45309 });
    },
    [toolUsage, total],
  );

  // Build legend entries
  const legendEntries = Object.entries(toolUsage)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <pixiContainer>
      <pixiGraphics draw={drawPizza} />

      {/* Legend */}
      <pixiContainer x={170} y={5}>
        {legendEntries.map(([category, count], i) => (
          <pixiContainer key={category} y={i * 16}>
            <pixiGraphics
              draw={(g: Graphics) => {
                g.clear();
                g.rect(0, 0, 10, 10);
                g.fill(PIZZA_COLORS[category] ?? 0x6b7280);
              }}
            />
            <pixiText
              text={`${category}: ${count}`}
              x={14}
              y={-1}
              style={{
                fontFamily: '"Courier New", monospace',
                fontSize: 10,
                fill: "#374151",
              }}
              resolution={2}
            />
          </pixiContainer>
        ))}
        {total === 0 && (
          <pixiText
            text="No tools used"
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 10,
              fill: "#9ca3af",
            }}
            resolution={2}
          />
        )}
      </pixiContainer>
    </pixiContainer>
  );
}
