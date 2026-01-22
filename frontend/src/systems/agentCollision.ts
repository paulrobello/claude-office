/**
 * Agent Collision Avoidance System
 *
 * Implements wait-and-repath strategy for agent collisions:
 * 1. Before each move, check if next position is occupied
 * 2. If blocked, wait for a short duration
 * 3. If still blocked after waiting, recalculate path
 *
 * Integrates with NavigationGrid for obstacle tracking.
 */

import { Position } from "@/types";
import { getNavigationGrid } from "./navigationGrid";
import { recalculatePath } from "./pathfinding";

// Collision configuration
const COLLISION_WAIT_MIN_MS = 100;
const COLLISION_WAIT_MAX_MS = 300;
const YIELD_WAIT_MIN_MS = 400; // Longer wait for yielding agent
const YIELD_WAIT_MAX_MS = 600;
const MAX_REPATH_ATTEMPTS = 3;

// Agent collision dimensions (based on capsule shape, matches boss)
const AGENT_WIDTH = 48; // 1.5 blocks × 32px
const AGENT_HEIGHT = 80; // 2.5 blocks × 32px
const AGENT_BOTTOM_HALF_OFFSET = AGENT_HEIGHT / 4; // Check from center down to bottom

/**
 * Agent collision state tracking.
 */
interface AgentCollisionState {
  agentId: string;
  waitingUntil: number | null;
  repathCount: number;
  lastPosition: Position;
}

/**
 * Collision avoidance manager.
 */
class CollisionManager {
  private agentStates: Map<string, AgentCollisionState> = new Map();

  /**
   * Register an agent for collision tracking.
   */
  registerAgent(agentId: string, position: Position): void {
    this.agentStates.set(agentId, {
      agentId,
      waitingUntil: null,
      repathCount: 0,
      lastPosition: { ...position },
    });

    // Add agent to navigation grid
    const grid = getNavigationGrid();
    grid.updateAgentPosition(agentId, position);
  }

  /**
   * Unregister an agent from collision tracking.
   */
  unregisterAgent(agentId: string): void {
    this.agentStates.delete(agentId);

    // Remove from navigation grid
    const grid = getNavigationGrid();
    grid.removeDynamicObstacle(`agent_${agentId}`);
  }

  /**
   * Update agent position in the collision system.
   */
  updatePosition(agentId: string, position: Position): void {
    const state = this.agentStates.get(agentId);
    if (state) {
      state.lastPosition = { ...position };
    }

    // Update navigation grid
    const grid = getNavigationGrid();
    grid.updateAgentPosition(agentId, position);
  }

  /**
   * Determine if this agent should yield to another in a collision.
   * Uses lexicographic comparison - agent with "smaller" ID yields.
   * This breaks deadlock symmetry by giving consistent priority.
   */
  private shouldYield(agentId: string, otherAgentId: string): boolean {
    return agentId < otherAgentId;
  }

  /**
   * Check if an agent should wait due to collision.
   * Returns true if agent should pause movement.
   *
   * Priority system: When two agents collide, the agent with lexicographically
   * smaller ID yields (waits longer). This breaks the deadlock symmetry.
   */
  shouldWait(agentId: string, nextPosition: Position): boolean {
    const state = this.agentStates.get(agentId);
    if (!state) return false;

    const now = performance.now();

    // If currently waiting, check if wait time has elapsed
    if (state.waitingUntil !== null) {
      if (now < state.waitingUntil) {
        return true; // Still waiting
      }
      state.waitingUntil = null; // Wait complete
    }

    // Check for collision with other agents
    const collidingAgentId = this.checkCollision(agentId, nextPosition);

    if (collidingAgentId) {
      // Determine who should yield based on priority
      const isYielder = this.shouldYield(agentId, collidingAgentId);

      // Yielding agent waits longer to let priority agent pass
      const waitMin = isYielder ? YIELD_WAIT_MIN_MS : COLLISION_WAIT_MIN_MS;
      const waitMax = isYielder ? YIELD_WAIT_MAX_MS : COLLISION_WAIT_MAX_MS;
      const waitTime = waitMin + Math.random() * (waitMax - waitMin);

      state.waitingUntil = now + waitTime;
      return true;
    }

    return false;
  }

  /**
   * Check if agent should repath due to persistent collision.
   * Call this after waiting completes.
   */
  shouldRepath(agentId: string, nextPosition: Position): boolean {
    const state = this.agentStates.get(agentId);
    if (!state) return false;

    // Check if still blocked after waiting
    const collision = this.checkCollision(agentId, nextPosition);

    if (collision && state.repathCount < MAX_REPATH_ATTEMPTS) {
      state.repathCount++;
      return true;
    }

    return false;
  }

  /**
   * Reset repath counter after successful movement.
   */
  resetRepathCount(agentId: string): void {
    const state = this.agentStates.get(agentId);
    if (state) {
      state.repathCount = 0;
    }
  }

  /**
   * Check for collision between this agent and others.
   * Only checks bottom half of agents (where feet are) for collision.
   */
  private checkCollision(agentId: string, position: Position): string | null {
    const grid = getNavigationGrid();
    const targetGrid = grid.worldToGrid(position.x, position.y);

    // Bottom half center point (offset down from sprite center)
    const myFootY = position.y + AGENT_BOTTOM_HALF_OFFSET;

    // Check if target tile has another agent
    for (const [otherId, otherState] of this.agentStates) {
      if (otherId === agentId) continue;

      const otherGrid = grid.worldToGrid(
        otherState.lastPosition.x,
        otherState.lastPosition.y,
      );

      // Quick tile-based check first (within 2 tiles)
      const dx = Math.abs(targetGrid.gx - otherGrid.gx);
      const dy = Math.abs(targetGrid.gy - otherGrid.gy);

      if (dx <= 2 && dy <= 2) {
        // Check horizontal overlap (based on agent width)
        const distX = Math.abs(position.x - otherState.lastPosition.x);
        if (distX >= AGENT_WIDTH) continue; // No horizontal overlap

        // Check vertical overlap on bottom halves only
        const otherFootY = otherState.lastPosition.y + AGENT_BOTTOM_HALF_OFFSET;
        const distY = Math.abs(myFootY - otherFootY);

        // Collision if bottom halves overlap (within half height)
        if (distY < AGENT_HEIGHT / 2) {
          return otherId;
        }
      }
    }

    return null;
  }

  /**
   * Get all registered agent IDs.
   */
  getRegisteredAgents(): string[] {
    return Array.from(this.agentStates.keys());
  }

  /**
   * Clear all collision state (for reset).
   */
  clear(): void {
    this.agentStates.clear();
    const grid = getNavigationGrid();
    grid.clearDynamicObstacles();
  }
}

// Singleton instance
export const collisionManager = new CollisionManager();

/**
 * Collision-aware path calculation.
 * Recalculates path avoiding current agent positions.
 */
export function calculateCollisionAwarePath(
  start: Position,
  end: Position,
  agentId: string,
): Position[] {
  // Update this agent's position first
  collisionManager.updatePosition(agentId, start);

  // Calculate path with collision avoidance
  return recalculatePath(start, end, agentId);
}

/**
 * Check if movement to next position would cause collision.
 */
export function checkMoveCollision(
  agentId: string,
  nextPosition: Position,
): { shouldWait: boolean; shouldRepath: boolean } {
  const shouldWait = collisionManager.shouldWait(agentId, nextPosition);

  if (!shouldWait) {
    collisionManager.resetRepathCount(agentId);
    return { shouldWait: false, shouldRepath: false };
  }

  const shouldRepath = collisionManager.shouldRepath(agentId, nextPosition);

  return { shouldWait, shouldRepath };
}
