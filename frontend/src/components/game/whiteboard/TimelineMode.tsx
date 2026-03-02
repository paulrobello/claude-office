"use client";

/**
 * TimelineMode - Mode 7: Agent lifespan timeline with coffee break markers.
 *
 * Shows horizontal bars for up to 5 recent agent sessions, with color-coded
 * bars matching agent colors, active pulse indicators, and vertical coffee
 * break markers overlaid on the timeline.
 */

import { Graphics } from "pixi.js";
import { useCallback, useMemo, type ReactNode } from "react";
import type { WhiteboardData } from "@/types";

export interface TimelineModeProps {
  data: WhiteboardData;
}

export function TimelineMode({ data }: TimelineModeProps): ReactNode {
  const lifespans = (data.agentLifespans ?? []).slice(-5); // Show last 5

  // Get coffee break timestamps from news items
  const coffeeBreaks = (data.newsItems ?? [])
    .filter((n) => n.category === "coffee")
    .map((n) => new Date(n.timestamp).getTime());

  const drawTimeline = useCallback(
    (g: Graphics) => {
      g.clear();

      if (lifespans.length === 0) return;

      // Find time range
      const now = new Date();
      const times = lifespans.map((l) => new Date(l.startTime).getTime());
      const minTime = Math.min(...times);

      // Use current time only if any agent is still active
      // Otherwise use the latest end time to prevent shrinking after session ends
      const hasActiveAgent = lifespans.some((l) => !l.endTime);
      const endTimes = lifespans
        .filter((l) => l.endTime)
        .map((l) => new Date(l.endTime!).getTime());
      const latestEndTime =
        endTimes.length > 0 ? Math.max(...endTimes) : now.getTime();
      const maxTime = hasActiveAgent ? now.getTime() : latestEndTime;
      const range = maxTime - minTime || 1;

      // Draw bars (leave 70px for labels on left)
      const barLeft = 70;
      const barWidth = 210;
      const barAreaHeight = lifespans.length * 22;

      lifespans.forEach((lifespan, i) => {
        const y = 10 + i * 22;
        const startX =
          barLeft +
          ((new Date(lifespan.startTime).getTime() - minTime) / range) *
            barWidth;
        const endTime = lifespan.endTime
          ? new Date(lifespan.endTime).getTime()
          : now.getTime();
        const endX = barLeft + ((endTime - minTime) / range) * barWidth;
        const width = Math.max(5, endX - startX);

        // Bar
        g.roundRect(startX, y, width, 14, 2);
        g.fill(parseInt(lifespan.color.replace("#", "0x")));

        // Active indicator (no end cap)
        if (!lifespan.endTime) {
          g.circle(endX, y + 7, 3);
          g.fill(0x22c55e);
        }
      });

      // Draw coffee break markers as vertical lines
      coffeeBreaks.forEach((timestamp) => {
        if (timestamp >= minTime && timestamp <= maxTime) {
          const x = barLeft + ((timestamp - minTime) / range) * barWidth;
          // Dashed vertical line
          for (let y = 5; y < barAreaHeight + 10; y += 6) {
            g.moveTo(x, y);
            g.lineTo(x, y + 3);
            g.stroke({ width: 2, color: 0x92400e });
          }
        }
      });
    },
    [lifespans, coffeeBreaks],
  );

  // Compute coffee marker positions for rendering icons
  // Must be before early return to satisfy React hooks rules
  const coffeeMarkerPositions = useMemo(() => {
    if (lifespans.length === 0) return [];

    const now = new Date();
    const times = lifespans.map((l) => new Date(l.startTime).getTime());
    const minTime = Math.min(...times);
    const hasActiveAgent = lifespans.some((l) => !l.endTime);
    const endTimes = lifespans
      .filter((l) => l.endTime)
      .map((l) => new Date(l.endTime!).getTime());
    const latestEndTime =
      endTimes.length > 0 ? Math.max(...endTimes) : now.getTime();
    const maxTime = hasActiveAgent ? now.getTime() : latestEndTime;
    const range = maxTime - minTime || 1;
    const barLeft = 70;
    const barWidth = 210;

    return coffeeBreaks
      .filter((t) => t >= minTime && t <= maxTime)
      .map((t) => barLeft + ((t - minTime) / range) * barWidth);
  }, [lifespans, coffeeBreaks]);

  if (lifespans.length === 0) {
    return (
      <pixiContainer x={165} y={50} scale={0.5}>
        <pixiText
          text="No agent activity yet"
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
      <pixiGraphics draw={drawTimeline} />

      {/* Labels */}
      {lifespans.map((lifespan, i) => (
        <pixiText
          key={lifespan.agentId}
          text={lifespan.agentName.slice(0, 8)}
          x={10}
          y={12 + i * 22}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 8,
            fill: lifespan.color,
          }}
          resolution={2}
        />
      ))}

      {/* Coffee break icons */}
      {coffeeMarkerPositions.map((x, i) => (
        <pixiText
          key={`coffee-${i}`}
          text="☕"
          x={x}
          y={2}
          anchor={0.5}
          style={{ fontSize: 10 }}
          resolution={2}
        />
      ))}
    </pixiContainer>
  );
}
