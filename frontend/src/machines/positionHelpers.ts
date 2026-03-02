/**
 * Position Helpers
 *
 * Utility functions for calculating agent positions in the office:
 *   - Desk positions based on desk number
 *   - Elevator target positions
 *
 * Extracted from agentMachineService.ts for testability and reuse.
 */

import type { Position } from "@/types";
import {
  ARRIVAL_QUEUE_POSITIONS,
  DEPARTURE_QUEUE_POSITIONS,
  ELEVATOR_PATHFINDING_TARGET,
} from "@/systems/queuePositions";

// ============================================================================
// DESK LAYOUT CONSTANTS
// ============================================================================

/** Number of desks per row in the grid layout. */
const DESK_ROW_SIZE = 4;

/**
 * Starting X coordinate for the first desk column (desk 1).
 * Matches useDeskPositions: columns at 256, 512, 768, 1024.
 */
const DESK_X_START = 256;

/**
 * X spacing between desk columns.
 */
const DESK_X_STEP = 256;

/**
 * Y coordinate for the first desk row (desk 1–4).
 *
 * Chair center is at desk origin (408) + 30 = 438.
 * Agent body center is 24 px above chair: 438 − 24 = 414.
 * Agent bottom circle center is 18 px below body center: 414 + 18 = 432.
 */
const DESK_Y_START = 432;

/**
 * Y spacing between desk rows.
 */
const DESK_Y_STEP = 192;

// ============================================================================
// DESK POSITION
// ============================================================================

/**
 * Calculate the pixel position for an agent seated at a given desk.
 *
 * Desks are numbered starting at 1, laid out in a grid of
 * {@link DESK_ROW_SIZE} columns.
 *
 * @param deskNum - 1-based desk number
 * @returns Pixel position for the agent's bottom circle centre
 */
export function getDeskPosition(deskNum: number): Position {
  const index = deskNum - 1;
  const row = Math.floor(index / DESK_ROW_SIZE);
  const col = index % DESK_ROW_SIZE;
  return {
    x: DESK_X_START + col * DESK_X_STEP,
    y: DESK_Y_START + row * DESK_Y_STEP,
  };
}

// ============================================================================
// QUEUE / READY POSITION HELPERS
// ============================================================================

/**
 * Return the A0 / D0 position where agents stand when talking to the boss.
 *
 * @param queueType - Which queue the agent belongs to
 */
export function getReadyPosition(queueType: "arrival" | "departure"): Position {
  return queueType === "arrival"
    ? ARRIVAL_QUEUE_POSITIONS[0]
    : DEPARTURE_QUEUE_POSITIONS[0];
}

// ============================================================================
// ELEVATOR POSITION HELPERS
// ============================================================================

/**
 * Return the pathfinding target for agents walking to the elevator.
 *
 * This is the cell that the pathfinder navigates toward; the agent
 * snaps to the true departure position once inside the elevator.
 */
export function getElevatorPathTarget(): Position {
  return ELEVATOR_PATHFINDING_TARGET;
}
