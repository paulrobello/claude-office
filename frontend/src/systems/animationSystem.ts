/**
 * Animation System
 *
 * Single requestAnimationFrame loop that updates all animation state:
 * - Agent position interpolation along paths
 * - Bubble display timing
 * - Queue advancement checks
 *
 * This is the core animation tick that drives all movement and timing.
 */

import {
  useGameStore,
  type AgentPhase,
  type PathState,
} from "@/stores/gameStore";
import { agentMachineService } from "@/machines/agentMachineService";
import { calculatePath, updateAgentObstacle } from "./pathfinding";
import { collisionManager } from "./agentCollision";
import type { Position } from "@/types";

// ============================================================================
// CONSTANTS
// ============================================================================

const MOVEMENT_SPEED = 200; // pixels per second
const BUBBLE_DURATION_MS = 3000; // 3 seconds per bubble

// ============================================================================
// ANIMATION SYSTEM CLASS
// ============================================================================

interface AnimationState {
  isRunning: boolean;
  lastTickTime: number;
  rafId: number | null;
}

class AnimationSystem {
  private state: AnimationState = {
    isRunning: false,
    lastTickTime: 0,
    rafId: null,
  };

  /**
   * Start the animation loop.
   */
  start(): void {
    if (this.state.isRunning) return;

    this.state.isRunning = true;
    this.state.lastTickTime = performance.now();
    this.tick();
  }

  /**
   * Stop the animation loop.
   */
  stop(): void {
    this.state.isRunning = false;
    if (this.state.rafId !== null) {
      cancelAnimationFrame(this.state.rafId);
      this.state.rafId = null;
    }
  }

  /**
   * Check if animation system is running.
   */
  isRunning(): boolean {
    return this.state.isRunning;
  }

  /**
   * Calculate and set a path for an agent.
   * Skips recalculation if agent is already moving to the same destination.
   */
  setAgentPath(agentId: string, target: Position): void {
    const store = useGameStore.getState();
    const agent = store.agents.get(agentId);
    if (!agent) return;

    // Check if agent is already at the target (within 5px tolerance)
    const dx = Math.abs(agent.currentPosition.x - target.x);
    const dy = Math.abs(agent.currentPosition.y - target.y);
    if (dx < 5 && dy < 5) {
      // Already at destination - trigger immediate arrival
      store.updateAgentPath(agentId, null);
      this.handleArrival(agentId, agent.phase);
      return;
    }

    // Check if agent is already moving to this target (within 10px tolerance)
    // This prevents path recalculation mid-movement which causes skipping
    if (agent.path && agent.targetPosition) {
      const targetDx = Math.abs(agent.targetPosition.x - target.x);
      const targetDy = Math.abs(agent.targetPosition.y - target.y);
      if (targetDx < 10 && targetDy < 10) {
        // Already heading to same destination - skip path reset
        return;
      }
    }

    // Register agent for collision tracking if not already
    collisionManager.registerAgent(agentId, agent.currentPosition);

    const waypoints = calculatePath(agent.currentPosition, target, agentId);

    if (waypoints.length > 1) {
      store.updateAgentTarget(agentId, target);
      store.updateAgentPath(agentId, {
        waypoints,
        currentIndex: 0,
        progress: 0,
      });
    } else {
      // Path calculation returned no valid path or single point - treat as arrival
      store.updateAgentPath(agentId, null);
      this.handleArrival(agentId, agent.phase);
    }
  }

  /**
   * Register a new agent for collision tracking.
   */
  registerAgent(agentId: string, position: Position): void {
    collisionManager.registerAgent(agentId, position);
  }

  /**
   * Unregister an agent from collision tracking.
   */
  unregisterAgent(agentId: string): void {
    collisionManager.unregisterAgent(agentId);
  }

  // ==========================================================================
  // MAIN TICK LOOP
  // ==========================================================================

  private tick = (): void => {
    if (!this.state.isRunning) return;

    const now = performance.now();
    const deltaMs = now - this.state.lastTickTime;
    const deltaSeconds = deltaMs / 1000;
    this.state.lastTickTime = now;

    // Update all systems
    this.updateAgentPositions(deltaSeconds);
    this.updateBubbleTimers();
    this.checkQueueAdvancement();

    // Schedule next frame
    this.state.rafId = requestAnimationFrame(this.tick);
  };

  // ==========================================================================
  // POSITION UPDATES
  // ==========================================================================

  private updateAgentPositions(deltaSeconds: number): void {
    const store = useGameStore.getState();

    for (const [agentId, agent] of store.agents) {
      if (!agent.path) {
        // Still update obstacle position for stationary agents
        updateAgentObstacle(agentId, agent.currentPosition);
        collisionManager.updatePosition(agentId, agent.currentPosition);
        continue;
      }

      // Calculate what the next position would be
      const result = this.updatePathProgress(
        {
          currentPosition: agent.currentPosition,
          targetPosition: agent.targetPosition,
          path: agent.path,
        },
        deltaSeconds,
      );
      if (!result) continue;

      const { newPosition, newPath, arrived } = result;

      // Agent collision disabled - agents pass through each other
      // This simplifies pathfinding and avoids deadlock issues

      // Update position in store
      store.updateAgentPosition(agentId, newPosition);

      // Update obstacle position for pathfinding
      updateAgentObstacle(agentId, newPosition);

      // Update collision manager position for agent-to-agent collision
      collisionManager.updatePosition(agentId, newPosition);

      // Update path state
      if (arrived) {
        store.updateAgentPath(agentId, null);
        this.handleArrival(agentId, agent.phase);
      } else if (newPath) {
        store.updateAgentPath(agentId, newPath);
      }
    }
  }

  private updatePathProgress(
    agent: {
      currentPosition: Position;
      targetPosition: Position;
      path: PathState;
    },
    deltaSeconds: number,
  ): {
    newPosition: Position;
    newPath: PathState | null;
    arrived: boolean;
  } | null {
    const { waypoints } = agent.path;
    let { currentIndex, progress } = agent.path;

    // Safety check
    if (currentIndex >= waypoints.length - 1) {
      return {
        newPosition: waypoints[waypoints.length - 1],
        newPath: null,
        arrived: true,
      };
    }

    // Calculate total distance to move this frame
    let remainingDistance = MOVEMENT_SPEED * deltaSeconds;

    // Advance through waypoints until we've used all our movement distance
    while (remainingDistance > 0 && currentIndex < waypoints.length - 1) {
      const current = waypoints[currentIndex];
      const next = waypoints[currentIndex + 1];

      // Calculate segment length
      const segmentDx = next.x - current.x;
      const segmentDy = next.y - current.y;
      const segmentLength = Math.sqrt(
        segmentDx * segmentDx + segmentDy * segmentDy,
      );

      // Skip zero-length segments
      if (segmentLength < 0.1) {
        currentIndex++;
        progress = 0;
        continue;
      }

      // Calculate remaining distance in current segment
      const remainingInSegment = (1 - progress) * segmentLength;

      if (remainingDistance >= remainingInSegment) {
        // Move past this waypoint to the next segment
        remainingDistance -= remainingInSegment;
        currentIndex++;
        progress = 0;
      } else {
        // Stay within this segment - calculate final position
        progress += remainingDistance / segmentLength;
        remainingDistance = 0;
      }
    }

    // Check if we've reached the end
    if (currentIndex >= waypoints.length - 1) {
      return {
        newPosition: waypoints[waypoints.length - 1],
        newPath: null,
        arrived: true,
      };
    }

    // Calculate final interpolated position along current segment
    const current = waypoints[currentIndex];
    const next = waypoints[currentIndex + 1];
    const segmentDx = next.x - current.x;
    const segmentDy = next.y - current.y;

    const newPosition: Position = {
      x: current.x + segmentDx * progress,
      y: current.y + segmentDy * progress,
    };

    return {
      newPosition,
      newPath: {
        waypoints,
        currentIndex,
        progress,
      },
      arrived: false,
    };
  }

  private handleArrival(agentId: string, phase: AgentPhase): void {
    agentMachineService.notifyArrival(agentId, phase);
  }

  // ==========================================================================
  // BUBBLE TIMING
  // ==========================================================================

  private updateBubbleTimers(): void {
    const store = useGameStore.getState();
    const now = Date.now(); // Use Date.now() to match displayStartTime

    // Check boss bubble
    const bossBubble = store.boss.bubble;
    if (bossBubble.content && bossBubble.displayStartTime) {
      const elapsed = now - bossBubble.displayStartTime;
      if (elapsed >= BUBBLE_DURATION_MS) {
        // Only advance if bubble is NOT persistent, OR there's a queued bubble to show
        if (!bossBubble.content.persistent || bossBubble.queue.length > 0) {
          console.log(
            `[AnimSys] Boss bubble expired, advancing (persistent=${bossBubble.content.persistent}, queueLen=${bossBubble.queue.length})`,
          );
          store.advanceBubble("boss");

          // Notify any waiting state machines
          this.notifyBubbleComplete("boss");
        }
      }
    } else if (!bossBubble.content && bossBubble.queue.length > 0) {
      // No current bubble but items in queue - display next if boss isn't compacting
      // We don't need to wait for queues to be empty here because:
      // - The queueing logic in enqueueBubble already handles when to queue vs display
      // - By the time we're here, the bubble was already queued for a reason
      // - We just need to wait for compaction to finish
      if (store.compactionPhase === "idle") {
        console.log(
          `[AnimSys] No boss bubble content but queue has ${bossBubble.queue.length} items, advancing`,
        );
        store.advanceBubble("boss");
      }
    }

    // Check agent bubbles
    for (const [agentId, agent] of store.agents) {
      const bubble = agent.bubble;
      if (bubble.content && bubble.displayStartTime) {
        const elapsed = now - bubble.displayStartTime;
        if (elapsed >= BUBBLE_DURATION_MS) {
          // Only advance if bubble is NOT persistent, OR there's a queued bubble to show
          if (!bubble.content.persistent || bubble.queue.length > 0) {
            store.advanceBubble(agentId);

            // Notify the agent's state machine
            this.notifyBubbleComplete(agentId);
          }
        }
      }
    }
  }

  private notifyBubbleComplete(entityId: string): void {
    if (entityId === "boss") {
      // Find any agent in conversing state that's waiting for boss bubble
      const store = useGameStore.getState();
      for (const [agentId, agent] of store.agents) {
        if (agent.phase === "conversing") {
          agentMachineService.notifyBubbleComplete(agentId);
          break;
        }
      }
    } else {
      // Notify specific agent
      agentMachineService.notifyBubbleComplete(entityId);
    }
  }

  // ==========================================================================
  // QUEUE ADVANCEMENT
  // ==========================================================================

  private checkQueueAdvancement(): void {
    const store = useGameStore.getState();

    // If boss is in use, don't advance
    if (store.boss.inUseBy !== null) return;

    // Priority: arrival queue first
    if (store.arrivalQueue.length > 0) {
      const frontId = store.arrivalQueue[0];
      const frontAgent = store.agents.get(frontId);

      // Only advance if agent is:
      // 1. In queue phase
      // 2. At front of queue (index 0)
      // 3. NOT currently walking (no active path)
      if (
        frontAgent?.phase === "in_arrival_queue" &&
        frontAgent.queueIndex === 0 &&
        frontAgent.path === null
      ) {
        agentMachineService.notifyBossAvailable();
        return;
      }
    }

    // Then departure queue
    if (store.departureQueue.length > 0) {
      const frontId = store.departureQueue[0];
      const frontAgent = store.agents.get(frontId);

      if (
        frontAgent?.phase === "in_departure_queue" &&
        frontAgent.queueIndex === 0 &&
        frontAgent.path === null
      ) {
        agentMachineService.notifyBossAvailable();
      }
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const animationSystem = new AnimationSystem();

// ============================================================================
// REACT HOOK
// ============================================================================

import { useEffect } from "react";

/**
 * React hook to start/stop the animation system.
 * Should be called from the main game component.
 */
export function useAnimationSystem(): void {
  useEffect(() => {
    animationSystem.start();
    return () => animationSystem.stop();
  }, []);
}
