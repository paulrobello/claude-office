/**
 * DebugOverlays Component
 *
 * Renders debug visualization overlays for the office game:
 * - Queue slot markers (arrival/departure positions)
 * - Agent pathfinding paths
 * - Agent phase labels
 * - Navigation obstacle tiles
 */

import { type ReactNode, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore, selectAgents } from "@/stores/gameStore";
import {
  ARRIVAL_QUEUE_POSITIONS,
  DEPARTURE_QUEUE_POSITIONS,
} from "@/systems/queuePositions";
import { getObstacleTiles, TileType } from "@/systems/navigationGrid";

export interface DebugOverlaysProps {
  showPaths: boolean;
  showQueueSlots: boolean;
  showPhaseLabels: boolean;
  showObstacles: boolean;
}

export function DebugOverlays({
  showPaths,
  showQueueSlots,
  showPhaseLabels,
  showObstacles,
}: DebugOverlaysProps): ReactNode {
  const agents = useGameStore(useShallow(selectAgents));

  // Get obstacle tiles for visualization
  const obstacleTiles = useMemo(() => {
    if (!showObstacles) return [];
    return getObstacleTiles();
  }, [showObstacles]);

  if (!showPaths && !showQueueSlots && !showPhaseLabels && !showObstacles)
    return null;

  return (
    <>
      {/* Queue slot markers */}
      {showQueueSlots && (
        <>
          {ARRIVAL_QUEUE_POSITIONS.map((pos, i) => (
            <pixiContainer key={`arrival-${i}`} x={pos.x} y={pos.y}>
              <pixiGraphics
                draw={(g) => {
                  g.clear();
                  g.circle(0, 0, 15);
                  g.stroke({ width: 2, color: 0x00ff00, alpha: 0.5 });
                }}
              />
              <pixiText
                text={`A${i}`}
                anchor={0.5}
                style={{ fontSize: 10, fill: 0x00ff00 }}
              />
            </pixiContainer>
          ))}
          {DEPARTURE_QUEUE_POSITIONS.map((pos, i) => (
            <pixiContainer key={`departure-${i}`} x={pos.x} y={pos.y}>
              <pixiGraphics
                draw={(g) => {
                  g.clear();
                  g.circle(0, 0, 15);
                  g.stroke({ width: 2, color: 0xff6600, alpha: 0.5 });
                }}
              />
              <pixiText
                text={`D${i}`}
                anchor={0.5}
                style={{ fontSize: 10, fill: 0xff6600 }}
              />
            </pixiContainer>
          ))}
        </>
      )}

      {/* Path visualization */}
      {showPaths &&
        Array.from(agents.values()).map((agent) =>
          agent.path ? (
            <pixiGraphics
              key={`path-${agent.id}`}
              draw={(g) => {
                g.clear();
                const { waypoints, currentIndex } = agent.path!;

                // Draw remaining path
                for (let i = currentIndex; i < waypoints.length - 1; i++) {
                  const progress =
                    (i - currentIndex) /
                    Math.max(1, waypoints.length - currentIndex - 1);
                  const green = Math.floor(255 * (1 - progress));
                  const red = Math.floor(255 * progress);
                  const color = (red << 16) | (green << 8) | 0;

                  g.moveTo(waypoints[i].x, waypoints[i].y);
                  g.lineTo(waypoints[i + 1].x, waypoints[i + 1].y);
                  g.stroke({ width: 3, color });
                }

                // Draw waypoint markers
                waypoints.forEach((wp, i) => {
                  g.circle(wp.x, wp.y, 4);
                  g.fill(
                    i === 0
                      ? 0x00ff00
                      : i === waypoints.length - 1
                        ? 0xff0000
                        : 0xffff00,
                  );
                });
              }}
            />
          ) : null,
        )}

      {/* Phase labels */}
      {showPhaseLabels &&
        Array.from(agents.values()).map((agent) => (
          <pixiText
            key={`phase-${agent.id}`}
            text={agent.phase}
            x={agent.currentPosition.x}
            y={agent.currentPosition.y + 55}
            anchor={0.5}
            style={{
              fontSize: 9,
              fill: 0xffffff,
              fontFamily: "monospace",
            }}
          />
        ))}

      {/* Obstacle visualization */}
      {showObstacles &&
        obstacleTiles.map((tile, i) => (
          <pixiGraphics
            key={`obstacle-${i}`}
            draw={(g) => {
              g.clear();
              g.rect(tile.x, tile.y, tile.width, tile.height);
              // Color based on tile type
              const color =
                tile.type === TileType.WALL
                  ? 0xff0000 // Red for walls
                  : tile.type === TileType.DESK
                    ? 0xff8800 // Orange for desks
                    : tile.type === TileType.BOSS_DESK
                      ? 0xff00ff // Magenta for boss desk
                      : 0xffff00; // Yellow for other
              g.fill({ color, alpha: 0.3 });
              g.stroke({ width: 1, color, alpha: 0.6 });
            }}
          />
        ))}
    </>
  );
}
