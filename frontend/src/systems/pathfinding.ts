/**
 * Grid-based A* pathfinding for office navigation.
 *
 * Agents navigate using A* algorithm on a 32x32 tile grid.
 * Supports dynamic obstacles (other agents) and smooth path interpolation.
 */

import { Position, AgentState } from "@/types";
import { AgentPhase } from "@/stores/gameStore";
import { findWorldPath } from "./astar";
import { smoothPath } from "./pathSmoothing";
import { getNavigationGrid } from "./navigationGrid";

/**
 * Determine movement routing type based on agent phase or state.
 * Used for logging and potential special handling.
 * Accepts both frontend AgentPhase and backend AgentState.
 */
export function getMovementType(phase: AgentPhase | AgentState): string {
  switch (phase) {
    case "arriving":
      return "to_arrival_queue";
    case "departing":
    case "leaving":
      return "to_departure_queue";
    case "walking_to_desk":
      return "arrival";
    case "walking_to_elevator":
    case "in_elevator":
      return "departure";
    case "in_arrival_queue":
    case "in_departure_queue":
      return "in_queue";
    case "walking_to_ready":
    case "walking_to_boss":
      return "to_boss";
    default:
      return "general";
  }
}

/**
 * Calculate waypoints between two positions using A* pathfinding.
 *
 * @param start - Starting position in pixels
 * @param end - Target position in pixels
 * @param agentId - Optional agent ID to ignore self as obstacle
 * @returns Array of waypoints from start to end
 */
export function calculatePath(
  start: Position,
  end: Position,
  agentId?: string,
): Position[] {
  // Quick check: already at destination
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 5) {
    return [start, end];
  }

  // Find path using A*
  const rawPath = findWorldPath(start, end, agentId);

  // If A* returns empty or very short path, return minimal path
  // DO NOT fallback to direct path as it may go through obstacles
  if (rawPath.length < 2) {
    // Return just start position so agent doesn't move through obstacles
    return rawPath.length > 0 ? rawPath : [start];
  }

  // Smooth the path for natural movement
  const smoothed = smoothPath(rawPath);

  // Ensure we start and end at exact positions
  if (smoothed.length >= 2) {
    smoothed[0] = { ...start };
    smoothed[smoothed.length - 1] = { ...end };
  }

  return smoothed;
}

/**
 * Update an agent's position in the navigation grid.
 * Call this when agents move to update collision data.
 */
export function updateAgentObstacle(agentId: string, position: Position): void {
  const grid = getNavigationGrid();
  grid.updateAgentPosition(agentId, position);
}

/**
 * Remove an agent from the navigation grid.
 * Call this when agents are removed from the game.
 */
export function removeAgentObstacle(agentId: string): void {
  const grid = getNavigationGrid();
  grid.removeDynamicObstacle(`agent_${agentId}`);
}

/**
 * Recalculate path for an agent, avoiding current obstacles.
 * Used when paths need to be updated due to obstacle changes.
 */
export function recalculatePath(
  start: Position,
  end: Position,
  agentId: string,
): Position[] {
  return calculatePath(start, end, agentId);
}

// Re-export grid utilities for debugging
export { getNavigationGrid, resetNavigationGrid } from "./navigationGrid";
export { TILE_SIZE, GRID_WIDTH, GRID_HEIGHT, TileType } from "./navigationGrid";
