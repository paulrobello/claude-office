/**
 * Agent Machine Service
 *
 * Manages the lifecycle of agent state machines.
 * Spawns new machines when agents arrive, sends events, and cleans up on departure.
 */

import { createActor, type ActorRefFrom } from "xstate";
import {
  createAgentMachine,
  type AgentMachineActions,
  type AgentMachineEvent,
  type AgentMachine,
} from "./agentMachine";
import { useGameStore, type AgentPhase } from "@/stores/gameStore";
import type { Position } from "@/types";
import {
  ARRIVAL_QUEUE_POSITIONS,
  DEPARTURE_QUEUE_POSITIONS,
  ELEVATOR_PATHFINDING_TARGET,
  ELEVATOR_DEPARTURE_POSITION,
  getQueuePosition,
  reserveElevatorPosition,
  releaseElevatorPosition,
} from "@/systems/queuePositions";
import { animationSystem } from "@/systems/animationSystem";

// ============================================================================
// TYPES
// ============================================================================

interface ManagedAgent {
  actor: ActorRefFrom<AgentMachine>;
  agentId: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class AgentMachineService {
  private agents: Map<string, ManagedAgent> = new Map();
  private actions: AgentMachineActions;

  // Track reserved queue positions for agents walking to queue (prevents race conditions)
  // Key: "arrival" or "departure", Value: Map of positionIndex -> agentId
  private queueReservations: Map<string, Map<number, string>> = new Map([
    ["arrival", new Map()],
    ["departure", new Map()],
  ]);

  // Track which agent is currently at or walking to the ready position (A0/D0)
  // This prevents multiple agents from stacking at the ready position
  private readyPositionOccupant: Map<string, string | null> = new Map([
    ["arrival", null],
    ["departure", null],
  ]);

  // Reference count for elevator usage - only close when all agents are done
  private elevatorUsageCount = 0;

  constructor() {
    // Initialize actions that bridge state machine to store
    this.actions = {
      onStartWalking: this.handleStartWalking.bind(this),
      onQueueJoined: this.handleQueueJoined.bind(this),
      onQueueLeft: this.handleQueueLeft.bind(this),
      onPhaseChanged: this.handlePhaseChanged.bind(this),
      onShowBossBubble: this.handleShowBossBubble.bind(this),
      onShowAgentBubble: this.handleShowAgentBubble.bind(this),
      onClearBossBubble: this.handleClearBossBubble.bind(this),
      onClearAgentBubble: this.handleClearAgentBubble.bind(this),
      onSetBossInUse: this.handleSetBossInUse.bind(this),
      onOpenElevator: this.handleOpenElevator.bind(this),
      onCloseElevator: this.handleCloseElevator.bind(this),
      onAgentRemoved: this.handleAgentRemoved.bind(this),
    };
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Spawn a new agent and start its state machine.
   *
   * Supports three spawn modes for mid-session joining:
   * - At desk: Agent is already working at their desk (SPAWN_AT_DESK)
   * - In arrival queue: Agent is waiting to get work from boss (SPAWN_IN_ARRIVAL_QUEUE)
   * - In departure queue: Agent is waiting to turn in work (SPAWN_IN_DEPARTURE_QUEUE)
   * - Normal: Agent arrives from elevator (SPAWN)
   */
  spawnAgent(
    agentId: string,
    name: string | null,
    desk: number | null,
    initialPosition: Position,
    options?: {
      backendState?: string;
      skipArrival?: boolean;
      queueType?: "arrival" | "departure";
      queueIndex?: number;
    },
  ): void {
    if (this.agents.has(agentId)) {
      console.warn(`[SERVICE] Agent ${agentId} already exists`);
      return;
    }

    const machine = createAgentMachine(this.actions);
    const actor = createActor(machine, {
      id: `agent-${agentId}`,
    });

    this.agents.set(agentId, { actor, agentId });

    // Start the actor
    actor.start();

    const store = useGameStore.getState();

    // Check spawn mode for mid-session joins
    if (options?.queueType === "arrival" && options.queueIndex !== undefined) {
      // Agent is in arrival queue - spawn directly there
      actor.send({
        type: "SPAWN_IN_ARRIVAL_QUEUE",
        agentId,
        name,
        desk,
        position: initialPosition,
        queueIndex: options.queueIndex,
      });

      // Update store
      store.updateAgentPosition(agentId, initialPosition);
      store.updateAgentPhase(agentId, "in_arrival_queue");
      store.updateAgentQueueInfo(agentId, "arrival", options.queueIndex);

      // Add to arrival queue in store if not already there
      if (!store.arrivalQueue.includes(agentId)) {
        store.enqueueArrival(agentId);
      }
    } else if (
      options?.queueType === "departure" &&
      options.queueIndex !== undefined
    ) {
      // Agent is in departure queue - spawn directly there
      actor.send({
        type: "SPAWN_IN_DEPARTURE_QUEUE",
        agentId,
        name,
        desk,
        position: initialPosition,
        queueIndex: options.queueIndex,
      });

      // Update store
      store.updateAgentPosition(agentId, initialPosition);
      store.updateAgentPhase(agentId, "in_departure_queue");
      store.updateAgentQueueInfo(agentId, "departure", options.queueIndex);

      // Add to departure queue in store if not already there
      if (!store.departureQueue.includes(agentId)) {
        store.enqueueDeparture(agentId);
      }
    } else if (options?.skipArrival && desk) {
      // Agent is at desk - spawn directly there
      const deskPosition = this.getDeskPosition(desk);

      actor.send({
        type: "SPAWN_AT_DESK",
        agentId,
        name,
        desk,
        position: deskPosition,
      });

      // Update store
      store.updateAgentPosition(agentId, deskPosition);
      store.updateAgentPhase(agentId, "idle");
    } else {
      // Normal arrival flow - spawn from elevator
      // Reserve the elevator position to prevent collisions
      reserveElevatorPosition(agentId, initialPosition);

      actor.send({
        type: "SPAWN",
        agentId,
        name,
        desk,
        position: initialPosition,
      });
    }
  }

  /**
   * Trigger departure for an agent (when removed from backend).
   */
  triggerDeparture(agentId: string): void {
    const managed = this.agents.get(agentId);
    if (!managed) {
      console.warn(
        `[SERVICE] Cannot trigger departure for unknown agent ${agentId}`,
      );
      return;
    }

    managed.actor.send({ type: "REMOVE" });
  }

  /**
   * Send an event to an agent's state machine.
   */
  sendEvent(agentId: string, event: AgentMachineEvent): void {
    const managed = this.agents.get(agentId);
    if (!managed) {
      console.warn(`[SERVICE] Cannot send event to unknown agent ${agentId}`);
      return;
    }

    managed.actor.send(event);
  }

  /**
   * Notify that an agent has arrived at their animation destination.
   * This is called by the animation system when path following completes.
   */
  notifyArrival(agentId: string, phase: AgentPhase): void {
    const managed = this.agents.get(agentId);
    if (!managed) return;

    // Map phase to appropriate arrival event
    const eventMap: Partial<Record<AgentPhase, AgentMachineEvent["type"]>> = {
      arriving: "ARRIVED_AT_QUEUE",
      departing: "ARRIVED_AT_QUEUE",
      walking_to_ready: "ARRIVED_AT_READY",
      walking_to_boss: "ARRIVED_AT_BOSS",
      walking_to_desk: "ARRIVED_AT_DESK",
      walking_to_elevator: "ARRIVED_AT_ELEVATOR",
    };

    const eventType = eventMap[phase];
    if (eventType) {
      managed.actor.send({ type: eventType } as AgentMachineEvent);
    }
  }

  /**
   * Notify that a bubble has finished displaying.
   * Called by animation system after bubble display duration expires.
   */
  notifyBubbleComplete(agentId: string): void {
    const managed = this.agents.get(agentId);
    if (!managed) return;

    managed.actor.send({ type: "BUBBLE_DISPLAYED" });
  }

  /**
   * Notify that the boss is available for the next agent in queue.
   * Blocks if boss is doing compaction animation or if ready position is occupied.
   */
  notifyBossAvailable(): void {
    const store = useGameStore.getState();

    // Don't notify if boss is doing compaction animation
    if (store.compactionPhase !== "idle") {
      return;
    }

    // Priority: arrival queue first
    if (store.arrivalQueue.length > 0) {
      // Check if ready position is already occupied
      const arrivalOccupant = this.readyPositionOccupant.get("arrival");
      if (arrivalOccupant) {
        return;
      }

      const frontId = store.arrivalQueue[0];
      this.sendEvent(frontId, { type: "BOSS_AVAILABLE" });
      return;
    }

    // Then departure queue
    if (store.departureQueue.length > 0) {
      // Check if ready position is already occupied
      const departureOccupant = this.readyPositionOccupant.get("departure");
      if (departureOccupant) {
        return;
      }

      const frontId = store.departureQueue[0];
      this.sendEvent(frontId, { type: "BOSS_AVAILABLE" });
    }
  }

  /**
   * Update queue indices for all agents in a queue and move them to new positions.
   */
  updateQueueIndices(queueType: "arrival" | "departure"): void {
    const store = useGameStore.getState();
    const queue =
      queueType === "arrival" ? store.arrivalQueue : store.departureQueue;

    queue.forEach((agentId, index) => {
      // Update the state machine context
      this.sendEvent(agentId, {
        type: "QUEUE_POSITION_CHANGED",
        newIndex: index,
      });

      // Calculate new position (index 0 in queue = position 1, etc.)
      const positionIndex = index + 1;
      const newPosition = getQueuePosition(queueType, positionIndex);

      if (newPosition) {
        // Update store and start walking to new position
        store.updateAgentTarget(agentId, newPosition);
        store.updateAgentQueueInfo(agentId, queueType, index);
        animationSystem.setAgentPath(agentId, newPosition);
      }
    });
  }

  /**
   * Get all active agent IDs.
   */
  getActiveAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Check if an agent exists.
   */
  hasAgent(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * Reset the service (clear all agents).
   */
  reset(): void {
    for (const [, managed] of this.agents) {
      managed.actor.stop();
    }
    this.agents.clear();

    // Clear all queue reservations
    this.queueReservations.get("arrival")!.clear();
    this.queueReservations.get("departure")!.clear();

    // Clear ready position occupants
    this.readyPositionOccupant.set("arrival", null);
    this.readyPositionOccupant.set("departure", null);

    // Reset elevator usage count
    this.elevatorUsageCount = 0;
  }

  // ==========================================================================
  // ACTION HANDLERS
  // ==========================================================================

  private handleStartWalking(
    agentId: string,
    target: Position,
    movementType: string,
  ): void {
    const store = useGameStore.getState();

    // Calculate target position based on movement type
    let targetPosition = target;

    if (movementType.includes("queue")) {
      // Parse queueType from movementType (e.g., "to_arrival_queue" or "to_departure_queue")
      const queueType = movementType.includes("departure")
        ? "departure"
        : "arrival";
      const queue =
        queueType === "arrival" ? store.arrivalQueue : store.departureQueue;
      const queueIndex = queue.indexOf(agentId);

      let expectedIndex: number;
      if (queueIndex >= 0) {
        // Agent is already in queue, use their current position
        // Queue index 0 maps to position 1 (A1/D1), index 1 maps to position 2, etc.
        expectedIndex = queueIndex + 1;
      } else {
        // Agent not in queue yet - ALWAYS go to the back of the queue
        // This prevents new agents from "cutting in line" when positions open up
        const reservations = this.queueReservations.get(queueType)!;

        // Count active reservations (agents walking to queue but not yet in it)
        let reservationCount = 0;
        for (const reservedBy of reservations.values()) {
          if (reservedBy !== agentId) {
            reservationCount++;
          }
        }

        // New agents always join at the back: queue length + reservations + 1
        // Position 1 is first waiting spot (A1), so if queue has 2 agents and 0 reservations,
        // new agent goes to position 3 (A3)
        expectedIndex = queue.length + reservationCount + 1;

        // Reserve this position for this agent
        reservations.set(expectedIndex, agentId);
      }

      const position = getQueuePosition(queueType, expectedIndex);
      if (position) {
        targetPosition = position;
      }
    } else if (movementType === "to_ready" || movementType === "to_boss") {
      // Both "to_ready" and "to_boss" go to A0/D0 - the boss interaction position
      // A0/D0 is where agents stand to talk to the boss
      const agent = store.agents.get(agentId);
      const queueType = agent?.queueType ?? "arrival";
      targetPosition =
        queueType === "arrival"
          ? ARRIVAL_QUEUE_POSITIONS[0]
          : DEPARTURE_QUEUE_POSITIONS[0];

      // Mark this agent as occupying the ready position
      if (movementType === "to_ready") {
        this.readyPositionOccupant.set(queueType, agentId);
      }
    } else if (movementType === "to_desk") {
      const agent = store.agents.get(agentId);
      if (agent?.desk) {
        targetPosition = this.getDeskPosition(agent.desk);
      }

      // Clear ready position occupancy - agent is leaving A0
      if (agent?.queueType) {
        const currentOccupant = this.readyPositionOccupant.get(agent.queueType);
        if (currentOccupant === agentId) {
          this.readyPositionOccupant.set(agent.queueType, null);
          // Notify next agent in queue now that position is clear
          setTimeout(() => this.notifyBossAvailable(), 0);
        }
      }
    } else if (movementType === "to_elevator") {
      targetPosition = ELEVATOR_PATHFINDING_TARGET;

      // Clear ready position occupancy - agent is leaving D0
      const agent = store.agents.get(agentId);
      if (agent?.queueType) {
        const currentOccupant = this.readyPositionOccupant.get(agent.queueType);
        if (currentOccupant === agentId) {
          this.readyPositionOccupant.set(agent.queueType, null);
          // Notify next agent in queue now that position is clear
          setTimeout(() => this.notifyBossAvailable(), 0);
        }
      }
    }

    // Update store with new target
    store.updateAgentTarget(agentId, targetPosition);

    // Create path for animation system
    animationSystem.setAgentPath(agentId, targetPosition);
  }

  private handleQueueJoined(
    agentId: string,
    queueType: "arrival" | "departure",
    _index: number, // Ignored - we calculate the actual index after enqueue
  ): void {
    // Clear any reservation this agent had (they've arrived at their position)
    const reservations = this.queueReservations.get(queueType)!;
    for (const [posIndex, reservedBy] of reservations.entries()) {
      if (reservedBy === agentId) {
        reservations.delete(posIndex);
        break;
      }
    }

    // Add to queue
    if (queueType === "arrival") {
      useGameStore.getState().enqueueArrival(agentId);
    } else {
      useGameStore.getState().enqueueDeparture(agentId);
    }

    // Get fresh state after enqueue to get accurate queue data
    const freshStore = useGameStore.getState();
    const queue =
      queueType === "arrival"
        ? freshStore.arrivalQueue
        : freshStore.departureQueue;
    const actualIndex = queue.indexOf(agentId);
    const agent = freshStore.agents.get(agentId);

    freshStore.updateAgentQueueInfo(agentId, queueType, actualIndex);

    // Update the state machine's context with the actual queue index
    this.sendEvent(agentId, {
      type: "QUEUE_POSITION_CHANGED",
      newIndex: actualIndex,
    });

    // Move agent to their correct logical position if needed
    // Queue index 0 = position 1 (A1/D1), index 1 = position 2, etc.
    const correctPositionIndex = actualIndex + 1;
    const correctPosition = getQueuePosition(queueType, correctPositionIndex);
    if (correctPosition && agent) {
      const needsMove =
        Math.abs(agent.currentPosition.x - correctPosition.x) > 5 ||
        Math.abs(agent.currentPosition.y - correctPosition.y) > 5;
      if (needsMove) {
        freshStore.updateAgentTarget(agentId, correctPosition);
        animationSystem.setAgentPath(agentId, correctPosition);
      }
    }

    // If this is the first agent in queue and boss is free, trigger boss available
    if (actualIndex === 0 && !freshStore.boss.inUseBy) {
      // Use setTimeout to ensure queue index is updated before checking guard
      setTimeout(() => this.notifyBossAvailable(), 0);
    }
  }

  private handleQueueLeft(agentId: string): void {
    const store = useGameStore.getState();
    const agent = store.agents.get(agentId);
    if (!agent) return;

    const queueType = agent.queueType;
    if (queueType === "arrival") {
      store.dequeueArrival();
    } else if (queueType === "departure") {
      store.dequeueDeparture();
    }

    // Update remaining queue members
    if (queueType) {
      this.updateQueueIndices(queueType);
    }
  }

  private handlePhaseChanged(agentId: string, phase: string): void {
    const store = useGameStore.getState();
    const previousPhase = store.agents.get(agentId)?.phase;

    store.updateAgentPhase(agentId, phase as AgentPhase);

    // Release elevator position when agent leaves the arriving phase
    // (they've moved out of the elevator zone into the queue)
    if (previousPhase === "arriving" && phase !== "arriving") {
      releaseElevatorPosition(agentId);
    }

    // When entering in_elevator, snap agent to departure position (lower in elevator)
    if (phase === "in_elevator") {
      store.updateAgentPosition(agentId, ELEVATOR_DEPARTURE_POSITION);
    }
  }

  private handleShowBossBubble(text: string, icon?: string): void {
    const store = useGameStore.getState();

    // Skip hand-in conversation bubbles if:
    // 1. The session is completing (STOP event has been processed)
    // 2. A persistent bubble is currently showing (completion message)
    // This prevents agent hand-in bubbles from replacing the completion message
    const isCompleting = store.boss.backendState === "completing";
    const hasPersistentBubble = store.boss.bubble.content?.persistent === true;

    if (isCompleting || hasPersistentBubble) {
      console.log(
        `[AgentMachineService] Skipping boss bubble "${text.slice(0, 30)}..." - isCompleting=${isCompleting}, hasPersistentBubble=${hasPersistentBubble}`,
      );
      return;
    }

    // Use immediate: true for conversation bubbles to ensure agent state machines
    // don't get stuck waiting for BUBBLE_DISPLAYED during compaction.
    // Only backend bubbles (tool use messages) should be queued during compaction.
    store.enqueueBubble(
      "boss",
      {
        type: "speech",
        text,
        icon,
      },
      { immediate: true },
    );
  }

  private handleShowAgentBubble(
    agentId: string,
    text: string,
    icon?: string,
  ): void {
    const store = useGameStore.getState();
    store.enqueueBubble(agentId, {
      type: "speech",
      text,
      icon,
    });
  }

  private handleClearBossBubble(): void {
    const store = useGameStore.getState();
    store.clearBubbles("boss");
  }

  private handleClearAgentBubble(agentId: string): void {
    const store = useGameStore.getState();
    store.clearBubbles(agentId);
  }

  private handleSetBossInUse(by: "arrival" | "departure" | null): void {
    const store = useGameStore.getState();
    store.setBossInUse(by);

    // If boss is now free, check for next agent
    if (by === null) {
      // Use setTimeout to avoid immediate recursion
      setTimeout(() => this.notifyBossAvailable(), 0);
    }
  }

  private handleOpenElevator(): void {
    this.elevatorUsageCount++;
    const store = useGameStore.getState();
    store.setElevatorState("open");
  }

  private handleCloseElevator(): void {
    this.elevatorUsageCount = Math.max(0, this.elevatorUsageCount - 1);
    // Only actually close when no agents are using the elevator
    if (this.elevatorUsageCount === 0) {
      const store = useGameStore.getState();
      store.setElevatorState("closed");
      // Notify all agents waiting in elevator that doors are closing
      this.notifyElevatorDoorClosing();
    }
  }

  /**
   * Notify all agents in the elevator that the doors are starting to close.
   * Agents in waiting_for_door_close state will transition to elevator_closing.
   */
  private notifyElevatorDoorClosing(): void {
    for (const managed of this.agents.values()) {
      // Send to all agents - XState will ignore if not in a state that handles this event
      managed.actor.send({ type: "ELEVATOR_DOOR_CLOSING" });
    }
  }

  private handleAgentRemoved(agentId: string): void {
    // Clean up the actor
    const managed = this.agents.get(agentId);
    if (managed) {
      managed.actor.stop();
      this.agents.delete(agentId);
    }

    // Clear any queue reservations
    for (const reservations of this.queueReservations.values()) {
      for (const [posIndex, reservedBy] of reservations.entries()) {
        if (reservedBy === agentId) {
          reservations.delete(posIndex);
          break;
        }
      }
    }

    // Clear ready position occupancy if this agent was the occupant
    for (const [queueType, occupant] of this.readyPositionOccupant.entries()) {
      if (occupant === agentId) {
        this.readyPositionOccupant.set(queueType, null);
        // Notify next agent in queue now that position is clear
        setTimeout(() => this.notifyBossAvailable(), 0);
        break;
      }
    }

    // Remove from store
    const store = useGameStore.getState();
    store.removeAgent(agentId);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private getDeskPosition(deskNum: number): Position {
    const rowSize = 4;
    const index = deskNum - 1;
    const row = Math.floor(index / rowSize);
    const col = index % rowSize;
    // Grid-aligned positions matching useDeskPositions: X at 256, 512, 768, 1024
    const xStart = 256;
    // Chair center is at desk origin (408) + 30 = 438
    // Agent body center should be 24px above chair (like boss): 438 - 24 = 414
    // Agent bottom circle center is 18px below body center: 414 + 18 = 432
    return {
      x: xStart + col * 256,
      y: 432 + row * 192, // Agent bottom circle center for proper chair seating
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const agentMachineService = new AgentMachineService();
