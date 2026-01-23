"use client";

import { Graphics } from "pixi.js";
import { useState, useCallback, useEffect, type ReactNode } from "react";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { DigitalClock } from "./DigitalClock";

/**
 * WallClock - Animated clock for the office wall
 *
 * Displays current time in analog or digital format based on user preferences.
 * Click to cycle through: analog → digital 12h → digital 24h → analog
 */
export function WallClock(): ReactNode {
  const [time, setTime] = useState(new Date());
  const clockType = usePreferencesStore((s) => s.clockType);
  const clockFormat = usePreferencesStore((s) => s.clockFormat);
  const cycleClockMode = usePreferencesStore((s) => s.cycleClockMode);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = useCallback(() => {
    cycleClockMode();
  }, [cycleClockMode]);

  const drawAnalogClock = useCallback(
    (g: Graphics) => {
      g.clear();
      // Outer black ring
      g.circle(0, 0, 44);
      g.fill(0x000000);
      // Face
      g.circle(0, 0, 40);
      g.fill(0xffffff);
      g.stroke({ width: 4, color: 0x2d3748 });

      // Numbers (simple dots)
      for (let i = 0; i < 12; i++) {
        const angle = i * 30 * (Math.PI / 180);
        g.circle(Math.sin(angle) * 32, -Math.cos(angle) * 32, 2);
        g.fill(0x2d3748);
      }

      // Hands
      const hours = time.getHours() % 12;
      const mins = time.getMinutes();
      const secs = time.getSeconds();

      // Hour hand
      const hAngle = (hours * 30 + mins * 0.5) * (Math.PI / 180);
      g.moveTo(0, 0);
      g.lineTo(Math.sin(hAngle) * 20, -Math.cos(hAngle) * 20);
      g.stroke({ width: 4, color: 0x2d3748 });

      // Minute hand
      const mAngle = mins * 6 * (Math.PI / 180);
      g.moveTo(0, 0);
      g.lineTo(Math.sin(mAngle) * 30, -Math.cos(mAngle) * 30);
      g.stroke({ width: 3, color: 0x2d3748 });

      // Second hand
      const sAngle = secs * 6 * (Math.PI / 180);
      g.moveTo(0, 0);
      g.lineTo(Math.sin(sAngle) * 35, -Math.cos(sAngle) * 35);
      g.stroke({ width: 1, color: 0xef4444 });
    },
    [time],
  );

  // Draw a clickable hit area (sized for the larger of analog/digital)
  const drawHitArea = useCallback(
    (g: Graphics) => {
      g.clear();
      if (clockType === "analog") {
        g.circle(0, 0, 44);
      } else {
        // Rectangular hit area for digital clock
        g.roundRect(-44, -28, 88, 56, 6);
      }
      g.fill({ color: 0x000000, alpha: 0 }); // Invisible but clickable
    },
    [clockType],
  );

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerDown={handleClick}
    >
      {clockType === "analog" ? (
        <pixiGraphics draw={drawAnalogClock} />
      ) : (
        <DigitalClock format={clockFormat} />
      )}
      {/* Invisible hit area to ensure clicks register */}
      <pixiGraphics draw={drawHitArea} />
    </pixiContainer>
  );
}
