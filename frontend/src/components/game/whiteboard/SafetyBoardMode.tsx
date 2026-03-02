"use client";

/**
 * SafetyBoardMode - Mode 6: Safety board showing consecutive successes.
 *
 * Displays a large count of consecutive successful tool uses and the
 * elapsed time since the last incident (error), like a workplace safety sign.
 */

import { type ReactNode } from "react";
import type { WhiteboardData } from "@/types";

export interface SafetyBoardModeProps {
  data: WhiteboardData;
}

function formatTimeSinceIncident(lastIncidentTime: string | null): string {
  if (!lastIncidentTime) return "∞";

  const incidentDate = new Date(lastIncidentTime);
  const now = new Date();
  const diffMs = now.getTime() - incidentDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 60) return `${diffMins}m`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
  return `${Math.floor(diffMins / 1440)}d`;
}

export function SafetyBoardMode({ data }: SafetyBoardModeProps): ReactNode {
  const daysSinceIncident = formatTimeSinceIncident(
    data.lastIncidentTime ?? null,
  );

  return (
    <pixiContainer>
      {/* Big number */}
      <pixiText
        text={String(data.consecutiveSuccesses ?? 0)}
        x={165}
        y={40}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 40,
          fontWeight: "bold",
          fill: "#22c55e",
        }}
        resolution={2}
      />

      {/* Label */}
      <pixiText
        text="SUCCESSFUL TOOL USES"
        x={165}
        y={70}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          fill: "#374151",
        }}
        resolution={2}
      />

      {/* Time since incident */}
      <pixiText
        text={`${daysSinceIncident} since last incident`}
        x={165}
        y={90}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: "#6b7280",
        }}
        resolution={2}
      />
    </pixiContainer>
  );
}
