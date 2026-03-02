"use client";

/**
 * CoffeeMode - Mode 9: Coffee cup consumption tracker.
 *
 * Displays the total number of coffee cups consumed with a visual grid of
 * coffee cup emoji icons (up to 15 shown, with an overflow indicator).
 */

import { type ReactNode } from "react";
import type { WhiteboardData } from "@/types";

export interface CoffeeModeProps {
  data: WhiteboardData;
}

const MAX_DISPLAY = 15;

export function CoffeeMode({ data }: CoffeeModeProps): ReactNode {
  const cups = data.coffeeCups ?? 0;
  const displayCups = Math.min(cups, MAX_DISPLAY);

  return (
    <pixiContainer>
      {/* Title */}
      <pixiText
        text="☕ COFFEE TRACKER"
        x={165}
        y={5}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fontWeight: "bold",
          fill: "#78350f",
        }}
        resolution={2}
      />

      {/* Big number */}
      <pixiText
        text={String(cups)}
        x={165}
        y={40}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 30,
          fontWeight: "bold",
          fill: "#92400e",
        }}
        resolution={2}
      />

      <pixiText
        text="cups consumed"
        x={165}
        y={60}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: "#a16207",
        }}
        resolution={2}
      />

      {/* Coffee cup grid */}
      <pixiContainer x={55} y={75}>
        {Array.from({ length: displayCups }).map((_, i) => (
          <pixiText
            key={i}
            text="☕"
            x={(i % 5) * 22}
            y={Math.floor(i / 5) * 18}
            style={{ fontSize: 14 }}
            resolution={2}
          />
        ))}
        {cups > MAX_DISPLAY && (
          <pixiText
            text={`+${cups - MAX_DISPLAY}`}
            x={110}
            y={Math.floor((displayCups - 1) / 5) * 18}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 10,
              fill: "#a16207",
            }}
            resolution={2}
          />
        )}
      </pixiContainer>
    </pixiContainer>
  );
}
