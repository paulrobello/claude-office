"use client";

/**
 * NewsTickerMode - Mode 8: Scrolling news headlines from session events.
 *
 * Cycles through up to 10 recent news items every 4 seconds, showing a
 * "BREAKING" banner, the headline text, timestamp, and item counter.
 */

import { Graphics } from "pixi.js";
import { useState, useEffect, type ReactNode } from "react";
import type { WhiteboardData } from "@/types";

export interface NewsTickerModeProps {
  data: WhiteboardData;
}

const CATEGORY_COLORS: Record<string, string> = {
  tool: "#3b82f6",
  agent: "#22c55e",
  session: "#8b5cf6",
  error: "#ef4444",
  coffee: "#f59e0b",
};

export function NewsTickerMode({ data }: NewsTickerModeProps): ReactNode {
  const [currentIndex, setCurrentIndex] = useState(0);

  const newsItems = data.newsItems.slice(0, 10);

  // Cycle through news items
  useEffect(() => {
    if (newsItems.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % newsItems.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [newsItems.length]);

  if (newsItems.length === 0) {
    return (
      <pixiContainer x={165} y={50} scale={0.5}>
        <pixiText
          text="No news yet - stay tuned!"
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

  const currentNews = newsItems[currentIndex];

  return (
    <pixiContainer>
      {/* Breaking banner */}
      <pixiGraphics
        draw={(g: Graphics) => {
          g.clear();
          g.rect(16, 5, 90, 18);
          g.fill(0xef4444);
        }}
      />
      <pixiText
        text="📰 BREAKING"
        x={61}
        y={14}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          fontWeight: "bold",
          fill: "#ffffff",
        }}
        resolution={2}
      />

      {/* Current headline */}
      <pixiText
        text={currentNews.headline.slice(0, 45)}
        x={165}
        y={45}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: CATEGORY_COLORS[currentNews.category] ?? "#374151",
        }}
        resolution={2}
      />

      {/* Timestamp */}
      <pixiText
        text={new Date(currentNews.timestamp).toLocaleTimeString()}
        x={165}
        y={65}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: "#9ca3af",
        }}
        resolution={2}
      />

      {/* News index indicator */}
      <pixiText
        text={`${currentIndex + 1}/${newsItems.length}`}
        x={165}
        y={100}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: "#9ca3af",
        }}
        resolution={2}
      />
    </pixiContainer>
  );
}
