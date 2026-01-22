/**
 * Office Queue System
 *
 * Manages two queues:
 * 1. Arrival Queue: Agents report to boss (left side) before going to desk
 * 2. Departure Queue: Agents turn in work (right side) before leaving
 *
 * Each queue has predefined positions. The boss desk slot is the "head"
 * of each queue. Only one boss slot can be occupied at a time, with
 * the arrival (getting work) slot having priority.
 */

import { Position } from "@/types";

// Boss desk positions (where agents stand IN FRONT of the desk)
// Boss desk center at y:928 (grid-aligned 29*32)
// Agents stand 60px above desk center so pathfinding can reach them
export const BOSS_SLOT_LEFT: Position = { x: 520, y: 868 }; // Getting work (arrivals)
export const BOSS_SLOT_RIGHT: Position = { x: 760, y: 868 }; // Receiving work (departures)

// Boss center position (for rendering)
// Desk visual: drawn 20px below boss with 80px height → desk center = boss_y + 60
// For desk center at y=960 (grid-aligned 30*32), boss is at y=900
export const BOSS_POSITION: Position = { x: 640, y: 900 };

// Elevator position (DO NOT CHANGE - this is the elevator's fixed location)
export const ELEVATOR_POSITION: Position = { x: 86, y: 178 };

// Pathfinding target for agents walking to elevator (can be adjusted independently)
export const ELEVATOR_PATHFINDING_TARGET: Position = { x: 86, y: 192 };

// Position where departing agents stand inside elevator (after arriving)
export const ELEVATOR_DEPARTURE_POSITION: Position = { x: 86, y: 200 };

// Elevator spawn positions (2x3 grid inside elevator)
// Elevator interior: ~112x144px centered at x:86
export const ELEVATOR_SPAWN_POSITIONS: Position[] = [
  { x: 56, y: 190 }, // Top left
  { x: 116, y: 190 }, // Top right
  { x: 56, y: 240 }, // Middle left
  { x: 116, y: 240 }, // Middle right
  { x: 56, y: 290 }, // Bottom left
  { x: 116, y: 290 }, // Bottom right
];

// Track available spawn slots (rotates through positions)
let nextSpawnIndex = 0;

// Track which elevator positions are currently occupied (by agent ID)
const occupiedElevatorPositions: Map<number, string> = new Map();

/**
 * Get the next spawn position for a new agent, avoiding occupied positions.
 * Falls back to cycling if all positions are occupied.
 */
export function getNextSpawnPosition(): Position {
  // Try to find an unoccupied position
  for (let i = 0; i < ELEVATOR_SPAWN_POSITIONS.length; i++) {
    const index = (nextSpawnIndex + i) % ELEVATOR_SPAWN_POSITIONS.length;
    if (!occupiedElevatorPositions.has(index)) {
      nextSpawnIndex = index + 1;
      return ELEVATOR_SPAWN_POSITIONS[index];
    }
  }

  // All positions occupied - fall back to cycling (will cause overlap)
  const pos =
    ELEVATOR_SPAWN_POSITIONS[nextSpawnIndex % ELEVATOR_SPAWN_POSITIONS.length];
  nextSpawnIndex++;
  return pos;
}

/**
 * Reserve an elevator position for an agent (call when spawning)
 */
export function reserveElevatorPosition(
  agentId: string,
  position: Position,
): void {
  const index = ELEVATOR_SPAWN_POSITIONS.findIndex(
    (p) => p.x === position.x && p.y === position.y,
  );
  if (index !== -1) {
    occupiedElevatorPositions.set(index, agentId);
  }
}

/**
 * Release an elevator position (call when agent leaves elevator zone)
 */
export function releaseElevatorPosition(agentId: string): void {
  for (const [index, id] of occupiedElevatorPositions.entries()) {
    if (id === agentId) {
      occupiedElevatorPositions.delete(index);
      break;
    }
  }
}

/**
 * Reset spawn index and clear occupied positions (for session reset)
 */
export function resetSpawnIndex(): void {
  nextSpawnIndex = 0;
  occupiedElevatorPositions.clear();
}

// Elevator zone bounds for collision exclusion
export const ELEVATOR_ZONE = {
  minX: 30, // 86 - 56 (half interior width)
  maxX: 142, // 86 + 56
  minY: 90, // Top of elevator
  maxY: 300, // Floor level threshold (extended to include lower spawn positions)
};

/**
 * Check if a position is inside the elevator zone
 * Used to skip collision checks and hide agents
 */
export function isInElevatorZone(pos: Position): boolean {
  return (
    pos.x >= ELEVATOR_ZONE.minX &&
    pos.x <= ELEVATOR_ZONE.maxX &&
    pos.y >= ELEVATOR_ZONE.minY &&
    pos.y <= ELEVATOR_ZONE.maxY
  );
}

// Arrival queue positions (left side, horizontal then vertical L-shape)
// Position 0 (A0) is the "ready" spot where agent waits before approaching boss
// Position 1+ are waiting spots in the queue line
// A0-A2: horizontal along bottom, A3-A7: vertical going up (above printer)
export const ARRIVAL_QUEUE_POSITIONS: Position[] = [
  { x: 480, y: 930 }, // Position 0 (A0 - ready spot, left of boss desk)
  { x: 330, y: 930 }, // Position 1 (first waiting spot)
  { x: 190, y: 930 }, // Position 2 (horizontal)
  { x: 70, y: 820 }, // Position 3 (moved up - above printer)
  { x: 70, y: 710 }, // Position 4 (vertical going up)
  { x: 70, y: 600 }, // Position 5
  { x: 70, y: 490 }, // Position 6
  { x: 70, y: 380 }, // Position 7
];

// Departure queue positions (right side, horizontal then vertical L-shape)
// Position 0 (D0) is the "ready" spot where agent waits before approaching boss
// Position 1+ are waiting spots in the queue line
// D0-D3: horizontal along bottom, D4-D7: vertical going up
export const DEPARTURE_QUEUE_POSITIONS: Position[] = [
  { x: 800, y: 930 }, // Position 0 (D0 - ready spot, right of boss desk)
  { x: 950, y: 930 }, // Position 1 (first waiting spot)
  { x: 1090, y: 930 }, // Position 2 (horizontal)
  { x: 1210, y: 930 }, // Position 3 (corner)
  { x: 1210, y: 820 }, // Position 4 (vertical going up)
  { x: 1210, y: 710 }, // Position 5
  { x: 1210, y: 600 }, // Position 6
  { x: 1210, y: 490 }, // Position 7
];

export type QueueType = "arrival" | "departure";

export interface QueueSlot {
  agentId: string;
  position: Position;
  queueIndex: number; // Index in queue (0 = front, waiting for boss)
}

/**
 * Get the queue positions for a given queue type
 */
export function getQueuePositions(type: QueueType): Position[] {
  return type === "arrival"
    ? ARRIVAL_QUEUE_POSITIONS
    : DEPARTURE_QUEUE_POSITIONS;
}

/**
 * Get the boss slot position for a given queue type
 */
export function getBossSlot(type: QueueType): Position {
  return type === "arrival" ? BOSS_SLOT_LEFT : BOSS_SLOT_RIGHT;
}

/**
 * Get position for an agent at a given index in the queue
 * Returns the boss slot if index is -1 (at boss desk)
 * Returns undefined if index exceeds available positions
 */
export function getQueuePosition(
  type: QueueType,
  index: number,
): Position | undefined {
  if (index < 0) {
    return getBossSlot(type);
  }
  const positions = getQueuePositions(type);
  if (index >= positions.length) {
    // Overflow - place beyond last position (110px vertical spacing)
    const lastPos = positions[positions.length - 1];
    const offset = (index - positions.length + 1) * 110;
    // Overflow goes upward (negative y)
    return { x: lastPos.x, y: lastPos.y - offset };
  }
  return positions[index];
}

/**
 * Calculate all agent positions for a queue given their IDs in order
 */
export function calculateQueueSlots(
  type: QueueType,
  agentIds: string[],
): QueueSlot[] {
  return agentIds.map((agentId, index) => ({
    agentId,
    position: getQueuePosition(type, index)!,
    queueIndex: index,
  }));
}

/**
 * Get desk position for a given desk number (1-indexed)
 * Returns the position where agent BOTTOM CIRCLE CENTER should be placed.
 * The bottom circle center is 22px above the feet, 18px below body center.
 * Must match DeskGrid rendering in OfficeGameV2.tsx
 * Grid-aligned: X at multiples of 32, row spacing 192 (6×32)
 */
export function getDeskPosition(deskNum: number): Position {
  const rowSize = 4;
  const index = deskNum - 1;
  const row = Math.floor(index / rowSize);
  const col = index % rowSize;
  // Grid-aligned positions: 256, 512, 768, 1024
  const xStart = 256;
  // Chair center is at desk origin (408) + 30 = 438
  // Agent body center should be 24px above chair (like boss): 438 - 24 = 414
  // Agent bottom circle center is 18px below body center: 414 + 18 = 432
  return {
    x: xStart + col * 256,
    y: 432 + row * 192, // Agent bottom circle center for proper chair seating
  };
}
