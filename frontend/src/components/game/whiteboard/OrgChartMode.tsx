"use client";

/**
 * OrgChartMode - Mode 3: Organizational hierarchy chart.
 *
 * Shows the boss at the top with lines down to up to 4 agents.
 * Each agent card displays their name, color-coded border, and a silly job title.
 */

import { Graphics } from "pixi.js";
import { useCallback, type ReactNode } from "react";
import type { Agent } from "@/types";

export interface OrgChartModeProps {
  agents: Agent[];
  bossTask: string | null;
}

const SILLY_TITLES = [
  "VP of Grepping",
  "Chief Byte Wrangler",
  "Senior Code Whisperer",
  "Director of Semicolons",
  "Head of Tab Spaces",
  "Minister of Merge Conflicts",
  "Baron of Bug Fixes",
  "Duke of Documentation",
];

export function OrgChartMode({
  agents,
  bossTask,
}: OrgChartModeProps): ReactNode {
  const drawOrgChart = useCallback(
    (g: Graphics) => {
      g.clear();

      // Boss box
      g.roundRect(125, 5, 80, 35, 4);
      g.fill(0xfef3c7);
      g.stroke({ width: 2, color: 0xf59e0b });

      // Lines to agents
      if (agents.length > 0) {
        const agentCount = Math.min(agents.length, 4);
        const boxWidth = 75;
        const totalWidth = boxWidth * agentCount;
        const startX = (330 - totalWidth) / 2;

        for (let i = 0; i < agentCount; i++) {
          const x = startX + boxWidth * i + boxWidth / 2;
          // Vertical line from boss
          g.moveTo(165, 40);
          g.lineTo(165, 55);
          // Horizontal line
          g.lineTo(x, 55);
          // Down to agent
          g.lineTo(x, 61);
          g.stroke({ width: 1, color: 0x9ca3af });
        }
      }
    },
    [agents.length],
  );

  const displayAgents = agents.slice(0, 4);

  return (
    <pixiContainer>
      <pixiGraphics draw={drawOrgChart} />

      {/* Boss */}
      <pixiText
        text="👔 BOSS"
        x={165}
        y={15}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          fontWeight: "bold",
          fill: "#92400e",
        }}
        resolution={2}
      />
      <pixiText
        text={bossTask ? bossTask.slice(0, 12) : "Supervising"}
        x={165}
        y={28}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 8,
          fill: "#b45309",
        }}
        resolution={2}
      />

      {/* Agents */}
      {displayAgents.length > 0 ? (
        displayAgents.map((agent, i) => {
          // Calculate box width and position to fill available space
          const boxWidth = 75;
          const totalBoxes = displayAgents.length;
          const totalWidth = boxWidth * totalBoxes;
          const startX = (330 - totalWidth) / 2; // Center the group
          const x = startX + boxWidth * i + boxWidth / 2; // Center of each box
          return (
            <pixiContainer key={agent.id} x={x} y={66}>
              <pixiGraphics
                draw={(g: Graphics) => {
                  g.clear();
                  g.roundRect(-boxWidth / 2, 0, boxWidth, 40, 3);
                  g.fill(0xffffff);
                  g.stroke({
                    width: 2,
                    color: parseInt(agent.color.replace("#", "0x")),
                  });
                }}
              />
              <pixiText
                text={agent.name?.slice(0, 8) || `Agent ${agent.number}`}
                y={8}
                anchor={0.5}
                style={{
                  fontFamily: '"Courier New", monospace',
                  fontSize: 9,
                  fontWeight: "bold",
                  fill: agent.color,
                }}
                resolution={2}
              />
              <pixiText
                text={SILLY_TITLES[i % SILLY_TITLES.length].slice(0, 15)}
                y={22}
                anchor={0.5}
                style={{
                  fontFamily: '"Courier New", monospace',
                  fontSize: 7,
                  fill: "#6b7280",
                }}
                resolution={2}
              />
            </pixiContainer>
          );
        })
      ) : (
        <pixiText
          text="No employees yet"
          x={165}
          y={85}
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 11,
            fill: "#9ca3af",
          }}
          resolution={2}
        />
      )}
    </pixiContainer>
  );
}
