"use client";

/**
 * WeatherMode - Mode 5: Session health as a weather forecast.
 *
 * Maps the current success rate and error count to a weather condition
 * (Sunny / Cloudy / Rainy / Stormy) with stats displayed alongside.
 */

import { type ReactNode } from "react";
import type { WhiteboardData } from "@/types";

export interface WeatherModeProps {
  data: WhiteboardData;
}

interface WeatherCondition {
  icon: string;
  label: string;
  color: string;
}

function getWeatherCondition(data: WhiteboardData): WeatherCondition {
  const totalOps = data.recentSuccessCount + data.recentErrorCount;
  const successRate = totalOps > 0 ? data.recentSuccessCount / totalOps : 1;

  if (data.recentErrorCount > 5) {
    return { icon: "⛈️", label: "STORMY", color: "#7c3aed" };
  }
  if (successRate < 0.7) {
    return { icon: "🌧️", label: "RAINY", color: "#3b82f6" };
  }
  if (data.activityLevel < 0.3) {
    return { icon: "⛅", label: "CLOUDY", color: "#6b7280" };
  }
  return { icon: "☀️", label: "SUNNY", color: "#f59e0b" };
}

export function WeatherMode({ data }: WeatherModeProps): ReactNode {
  const totalOps = data.recentSuccessCount + data.recentErrorCount;
  const successRate = totalOps > 0 ? data.recentSuccessCount / totalOps : 1;
  const weather = getWeatherCondition(data);

  return (
    <pixiContainer>
      {/* Large weather icon */}
      <pixiText
        text={weather.icon}
        x={80}
        y={50}
        anchor={0.5}
        style={{ fontSize: 50 }}
        resolution={2}
      />

      {/* Weather label */}
      <pixiText
        text={weather.label}
        x={80}
        y={95}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 14,
          fontWeight: "bold",
          fill: weather.color,
        }}
        resolution={2}
      />

      {/* Stats */}
      <pixiContainer x={170} y={10}>
        <pixiText
          text={`Success: ${(successRate * 100).toFixed(0)}%`}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 10,
            fill: "#22c55e",
          }}
          resolution={2}
        />
        <pixiText
          text={`Errors: ${data.recentErrorCount}`}
          y={16}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 10,
            fill: "#ef4444",
          }}
          resolution={2}
        />
        <pixiText
          text={`Activity: ${(data.activityLevel * 100).toFixed(0)}%`}
          y={32}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 10,
            fill: "#3b82f6",
          }}
          resolution={2}
        />
        <pixiText
          text={`Total ops: ${totalOps}`}
          y={48}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 10,
            fill: "#6b7280",
          }}
          resolution={2}
        />
      </pixiContainer>
    </pixiContainer>
  );
}
