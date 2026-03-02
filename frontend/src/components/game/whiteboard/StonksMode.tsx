"use client";

/**
 * StonksMode - Mode 4: Fake productivity stock tickers with sparklines.
 *
 * Displays four pseudo-stock symbols based on session metrics, with animated
 * price fluctuation and mini sparkline charts that update every 2 seconds.
 */

import { Graphics } from "pixi.js";
import { useState, useEffect, type ReactNode } from "react";
import type { WhiteboardData } from "@/types";

export interface StonksModeProps {
  data: WhiteboardData;
}

export function StonksMode({ data }: StonksModeProps): ReactNode {
  const [tick, setTick] = useState(0);

  // Update ticker prices every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Generate pseudo-random price fluctuation
  const fluctuate = (base: number, seed: number) => {
    const noise =
      Math.sin(tick * 0.5 + seed) * 5 + Math.cos(tick * 0.3 + seed * 2) * 3;
    return Math.max(1, base * 10 + noise).toFixed(2);
  };

  const stocks = [
    {
      symbol: "$TASK",
      value: data.taskCompletedCount,
      price: fluctuate(data.taskCompletedCount || 1, 1),
      up: data.taskCompletedCount > 0,
    },
    {
      symbol: "$BUG",
      value: data.bugFixedCount,
      price: fluctuate(data.bugFixedCount || 1, 2),
      up: data.bugFixedCount > 0,
    },
    {
      symbol: "$CAFE",
      value: data.coffeeBreakCount,
      price: fluctuate(data.coffeeBreakCount || 1, 3),
      up: data.coffeeBreakCount > 0,
    },
    {
      symbol: "$CODE",
      value: data.codeWrittenCount,
      price: fluctuate(data.codeWrittenCount || 1, 4),
      up: data.codeWrittenCount > 0,
    },
  ];

  return (
    <pixiContainer>
      {stocks.map((stock, i) => (
        <pixiContainer key={stock.symbol} y={i * 27}>
          <pixiText
            text={stock.symbol}
            x={16}
            y={3}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 12,
              fontWeight: "bold",
              fill: "#1f2937",
            }}
            resolution={2}
          />
          <pixiText
            text={stock.up ? "▲" : "▼"}
            x={85}
            y={3}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 12,
              fill: stock.up ? "#22c55e" : "#ef4444",
            }}
            resolution={2}
          />
          <pixiText
            text={stock.price}
            x={100}
            y={3}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 12,
              fill: stock.up ? "#22c55e" : "#ef4444",
            }}
            resolution={2}
          />
          {/* Mini sparkline */}
          <pixiGraphics
            x={170}
            y={8}
            draw={(g: Graphics) => {
              g.clear();
              g.moveTo(0, 5);
              for (let j = 0; j < 8; j++) {
                const y =
                  5 +
                  Math.sin((tick + j) * 0.5 + i) * 4 +
                  (stock.up ? -j * 0.3 : j * 0.3);
                g.lineTo(j * 10, y);
              }
              g.stroke({ width: 1, color: stock.up ? 0x22c55e : 0xef4444 });
            }}
          />
        </pixiContainer>
      ))}
    </pixiContainer>
  );
}
