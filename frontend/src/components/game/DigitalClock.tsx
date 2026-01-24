"use client";

import { Graphics, TextStyle } from "pixi.js";
import { useState, useCallback, useEffect, type ReactNode } from "react";
import type { ClockFormat } from "@/stores/preferencesStore";

/**
 * DigitalClock - LED-style digital clock display for the office wall
 *
 * Displays current time in a rectangular digital display format.
 * Supports 12h and 24h time formats.
 */
interface DigitalClockProps {
  format: ClockFormat;
}

export function DigitalClock({ format }: DigitalClockProps): ReactNode {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = useCallback(
    (date: Date): string => {
      let hours = date.getHours();
      const mins = date.getMinutes();
      const secs = date.getSeconds();

      if (format === "12h") {
        hours = hours % 12 || 12;
        return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      }

      return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    },
    [format],
  );

  const getAmPm = useCallback((date: Date): string => {
    return date.getHours() >= 12 ? "PM" : "AM";
  }, []);

  const drawClockBody = useCallback((g: Graphics) => {
    g.clear();

    // Outer black casing
    g.roundRect(-54, -28, 108, 56, 6);
    g.fill(0x1a1a1a);
    g.stroke({ width: 2, color: 0x333333 });

    // Inner display bezel
    g.roundRect(-50, -24, 100, 48, 4);
    g.fill(0x0a1a0a);
    g.stroke({ width: 1, color: 0x2d3748 });

    // LCD screen background (dark green-black)
    g.roundRect(-48, -22, 96, 44, 3);
    g.fill(0x0d1f0d);

    // Subtle screen reflection highlight
    g.roundRect(-46, -20, 92, 2, 1);
    g.fill({ color: 0x1a3a1a, alpha: 0.5 });
  }, []);

  const timeString = formatTime(time);

  return (
    <pixiContainer>
      <pixiGraphics draw={drawClockBody} />
      {/* Main time display */}
      <pixiText
        text={timeString}
        x={format === "12h" ? -8 : 0}
        y={-2}
        anchor={0.5}
        style={
          new TextStyle({
            fontFamily: "monospace",
            fontSize: 16,
            fontWeight: "bold",
            fill: 0x33ff33,
            dropShadow: {
              color: 0x33ff33,
              blur: 4,
              alpha: 0.6,
              distance: 0,
            },
          })
        }
      />
      {/* AM/PM indicator for 12h format */}
      {format === "12h" && (
        <pixiText
          text={getAmPm(time)}
          x={36}
          y={-2}
          anchor={0.5}
          style={
            new TextStyle({
              fontFamily: "monospace",
              fontSize: 8,
              fontWeight: "bold",
              fill: 0x33ff33,
              dropShadow: {
                color: 0x33ff33,
                blur: 2,
                alpha: 0.4,
                distance: 0,
              },
            })
          }
        />
      )}
    </pixiContainer>
  );
}
