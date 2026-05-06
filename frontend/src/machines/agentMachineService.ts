/**
 * Agent Machine Service
 *
 * Thin coordinator that manages agent state machine lifecycles.
 * Spawns machines when agents arrive, routes events, and cleans up on departure.
 *
 * Queue management is delegated to {@link QueueManager}.
 * Position calculations are delegated to {@link positionHelpers}.
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
  getQueuePosition,
  reserveElevatorPosition,
  releaseElevatorPosition,
  ELEVATOR_DEPARTURE_POSITION,
} from "@/systems/queuePositions";
import { animationSystem } from "@/systems/animationSystem";
import { QueueManager } from "./queueManager";
import {
  getDeskPosition,
  getReadyPosition,
  getElevatorPathTarget,
} from "./positionHelpers";

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
  private queue = new QueueManager();

  // Reference count for elevator usage — only close when all agents are done
  private elevatorUsageCount = 0;

  /**
   * Agents that the backend has removed but whose frontend animation hasn't
   * reached "idle" yet. When such an agent finally arrives at its desk, we
   * fire its departure flow immediately instead of waiting for the next
   * backend state-update (which may never come if the session is winding
   * down).
   */
  private pendingDepartures: Set<string> = new Set();

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
    const actor = createActor(machine, { id: `agent-${agentId}` });

    this.agents.set(agentId, { actor, agentId });
    actor.start();

    const store = useGameStore.getState();

    if (options?.queueType === "arrival" && options.queueIndex !== undefined) {
      this.spawnInArrivalQueue(
        actor,
        agentId,
        name,
        desk,
        initialPosition,
        options.queueIndex,
        store,
      );
    } else if (
      options?.queueType === "departure" &&
      options.queueIndex !== undefined
    ) {
      this.spawnInDepartureQueue(
        actor,
        agentId,
        name,
        desk,
        initialPosition,
        options.queueIndex,
        store,
      );
    } else if (options?.skipArrival && desk) {
      this.spawnAtDesk(actor, agentId, name, desk, store);
    } else {
      this.spawnFromElevator(actor, agentId, name, desk, initialPosition);
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
    this.pendingDepartures.delete(agentId);
    managed.actor.send({ type: "REMOVE" });
  }

  /**
   * Mark an agent as needing to depart once it reaches the idle state.
   * Used when the backend removes an agent before its arrival animation
   * has finished — the actual REMOVE event is dispatched in
   * handlePhaseChanged when phase becomes "idle".
   */
  markPendingDeparture(agentId: string): void {
    if (!this.agents.has(agentId)) return;
    this.pendingDepartures.add(agentId);
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
   * Called by the animation system when path following completes.
   */
  notifyArrival(agentId: string, phase: AgentPhase): void {
    const managed = this.agents.get(agentId);
    if (!managed) return;

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
   * Blocked if boss is doing compaction animation or if ready position is occupied.
   */
  notifyBossAvailable(): void {
    const store = useGameStore.getState();

    if (store.compactionPhase !== "idle") return;

    if (store.arrivalQueue.length > 0) {
      if (this.queue.getReadyOccupant("arrival")) return;
      this.sendEvent(store.arrivalQueue[0], { type: "BOSS_AVAILABLE" });
      return;
    }

    if (store.departureQueue.length > 0) {
      if (this.queue.getReadyOccupant("departure")) return;
      this.sendEvent(store.departureQueue[0], { type: "BOSS_AVAILABLE" });
    }
  }

  /**
   * Update queue indices for all agents in a queue and move them to new positions.
   */
  updateQueueIndices(queueType: "arrival" | "departure"): void {
    this.queue.updateQueueIndices(queueType, (agentId, event) =>
      this.sendEvent(agentId, event),
    );
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
    this.queue.reset();
    this.elevatorUsageCount = 0;
    this.pendingDepartures.clear();
  }

  // ==========================================================================
  // PRIVATE SPAWN HELPERS
  // ==========================================================================

  private spawnInArrivalQueue(
    actor: ReturnType<typeof createActor>,
    agentId: string,
    name: string | null,
    desk: number | null,
    position: Position,
    queueIndex: number,
    store: ReturnType<typeof useGameStore.getState>,
  ): void {
    actor.send({
      type: "SPAWN_IN_ARRIVAL_QUEUE",
      agentId,
      name,
      desk,
      position,
      queueIndex,
    });
    store.updateAgentPosition(agentId, position);
    store.updateAgentPhase(agentId, "in_arrival_queue");
    store.updateAgentQueueInfo(agentId, "arrival", queueIndex);
    if (!store.arrivalQueue.includes(agentId)) {
      store.enqueueArrival(agentId);
    }
  }

  private spawnInDepartureQueue(
    actor: ReturnType<typeof createActor>,
    agentId: string,
    name: string | null,
    desk: number | null,
    position: Position,
    queueIndex: number,
    store: ReturnType<typeof useGameStore.getState>,
  ): void {
    actor.send({
      type: "SPAWN_IN_DEPARTURE_QUEUE",
      agentId,
      name,
      desk,
      position,
      queueIndex,
    });
    store.updateAgentPosition(agentId, position);
    store.updateAgentPhase(agentId, "in_departure_queue");
    store.updateAgentQueueInfo(agentId, "departure", queueIndex);
    if (!store.departureQueue.includes(agentId)) {
      store.enqueueDeparture(agentId);
    }
  }

  private spawnAtDesk(
    actor: ReturnType<typeof createActor>,
    agentId: string,
    name: string | null,
    desk: number,
    store: ReturnType<typeof useGameStore.getState>,
  ): void {
    const deskPosition = getDeskPosition(desk);
    actor.send({
      type: "SPAWN_AT_DESK",
      agentId,
      name,
      desk,
      position: deskPosition,
    });
    store.updateAgentPosition(agentId, deskPosition);
    store.updateAgentPhase(agentId, "idle");
  }

  private spawnFromElevator(
    actor: ReturnType<typeof createActor>,
    agentId: string,
    name: string | null,
    desk: number | null,
    position: Position,
  ): void {
    reserveElevatorPosition(agentId, position);
    actor.send({ type: "SPAWN", agentId, name, desk, position });
  }

  // ==========================================================================
  // ACTION HANDLERS
  // ==========================================================================

  private handleStartWalking(
    agentId: string,
    _target: Position,
    movementType: string,
  ): void {
    const store = useGameStore.getState();
    let targetPosition: Position = _target;

    if (movementType.includes("queue")) {
      const queueType = movementType.includes("departure")
        ? "departure"
        : "arrival";
      const queue =
        queueType === "arrival" ? store.arrivalQueue : store.departureQueue;
      const queueIndex = queue.indexOf(agentId);

      let slotIndex: number;
      if (queueIndex >= 0) {
        // Already in queue — use current slot
        slotIndex = queueIndex + 1;
      } else {
        // Not yet in queue — reserve back of the line
        slotIndex = this.queue.reserveQueueSlot(agentId, queueType);
      }

      const position = getQueuePosition(queueType, slotIndex);
      if (position) targetPosition = position;
    } else if (movementType === "to_ready" || movementType === "to_boss") {
      const agent = store.agents.get(agentId);
      const queueType = agent?.queueType ?? "arrival";
      targetPosition = getReadyPosition(queueType);

      if (movementType === "to_ready") {
        this.queue.claimReadyPosition(agentId, queueType);
      }
    } else if (movementType === "to_desk") {
      const agent = store.agents.get(agentId);
      if (agent?.desk) {
        targetPosition = getDeskPosition(agent.desk);
      }
      this.releaseReadyAndNotify(agentId, store);
    } else if (movementType === "to_elevator") {
      targetPosition = getElevatorPathTarget();
      this.releaseReadyAndNotify(agentId, store);
    }

    store.updateAgentTarget(agentId, targetPosition);
    animationSystem.setAgentPath(agentId, targetPosition);
  }

  /**
   * Release the ready position for this agent and notify the next agent in
   * queue that it may now advance (via a microtask to avoid re-entrancy).
   *
   * Looks up by agentId rather than queueType because the store's queueType
   * is cleared in handleQueueLeft (during in_queue → walking_to_ready), so
   * by the time this runs (entering walking_to_desk / walking_to_elevator)
   * the agent's stored queueType is already null.
   */
  private releaseReadyAndNotify(
    agentId: string,
    _store: ReturnType<typeof useGameStore.getState>,
  ): void {
    const released = this.queue.releaseReadyPositionForAgent(agentId);
    if (released) {
      setTimeout(() => this.notifyBossAvailable(), 0);
    }
  }

  private handleQueueJoined(
    agentId: string,
    queueType: "arrival" | "departure",
    _index: number, // Ignored — we recalculate after enqueue
  ): void {
    this.queue.clearReservation(agentId, queueType);

    if (queueType === "arrival") {
      useGameStore.getState().enqueueArrival(agentId);
    } else {
      useGameStore.getState().enqueueDeparture(agentId);
    }

    // Get fresh state after enqueue for accurate queue data
    const freshStore = useGameStore.getState();
    const queue =
      queueType === "arrival"
        ? freshStore.arrivalQueue
        : freshStore.departureQueue;
    const actualIndex = queue.indexOf(agentId);
    const agent = freshStore.agents.get(agentId);

    freshStore.updateAgentQueueInfo(agentId, queueType, actualIndex);

    this.sendEvent(agentId, {
      type: "QUEUE_POSITION_CHANGED",
      newIndex: actualIndex,
    });

    // Move agent to correct slot if they are not already there
    const correctSlot = actualIndex + 1;
    const correctPosition = getQueuePosition(queueType, correctSlot);
    if (correctPosition && agent) {
      const needsMove =
        Math.abs(agent.currentPosition.x - correctPosition.x) > 5 ||
        Math.abs(agent.currentPosition.y - correctPosition.y) > 5;
      if (needsMove) {
        freshStore.updateAgentTarget(agentId, correctPosition);
        animationSystem.setAgentPath(agentId, correctPosition);
      }
    }

    // If this is the first agent and boss is free, trigger boss available
    if (actualIndex === 0 && !freshStore.boss.inUseBy) {
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

    store.updateAgentQueueInfo(agentId, null, -1);

    if (queueType) {
      this.updateQueueIndices(queueType);
    }
  }

  private handlePhaseChanged(agentId: string, phase: string): void {
    const store = useGameStore.getState();
    const previousPhase = store.agents.get(agentId)?.phase;

    store.updateAgentPhase(agentId, phase as AgentPhase);

    // Release elevator position when agent leaves the arriving phase
    if (previousPhase === "arriving" && phase !== "arriving") {
      releaseElevatorPosition(agentId);
    }

    // Snap agent to departure position when entering elevator
    if (phase === "in_elevator") {
      store.updateAgentPosition(agentId, ELEVATOR_DEPARTURE_POSITION);
    }

    // If the backend already removed this agent while it was still arriving,
    // fire its departure now that it has reached its desk.
    if (phase === "idle" && this.pendingDepartures.has(agentId)) {
      setTimeout(() => this.triggerDeparture(agentId), 0);
    }
  }

  private handleShowBossBubble(text: string, icon?: string): void {
    const store = useGameStore.getState();

    const isCompleting = store.boss.backendState === "completing";
    const hasPersistentBubble = store.boss.bubble.content?.persistent === true;

    if (isCompleting || hasPersistentBubble) {
      console.log(
        `[AgentMachineService] Skipping boss bubble "${text.slice(0, 30)}..." - isCompleting=${isCompleting}, hasPersistentBubble=${hasPersistentBubble}`,
      );
      // Unblock any agent waiting for BUBBLE_DISPLAYED in the conversing
      // sub-state. Without this, the agent gets stuck at A0 forever (and
      // every other agent behind it in the queue stays standing too).
      for (const [agentId, agent] of store.agents) {
        if (agent.phase === "conversing") {
          setTimeout(() => this.notifyBubbleComplete(agentId), 0);
          break;
        }
      }
      return;
    }

    store.enqueueBubble(
      "boss",
      { type: "speech", text, icon },
      { immediate: true },
    );
  }

  private handleShowAgentBubble(
    agentId: string,
    text: string,
    icon?: string,
  ): void {
    const store = useGameStore.getState();
    store.enqueueBubble(agentId, { type: "speech", text, icon });
  }

  private handleClearBossBubble(): void {
    useGameStore.getState().clearBubbles("boss");
  }

  private handleClearAgentBubble(agentId: string): void {
    useGameStore.getState().clearBubbles(agentId);
  }

  private handleSetBossInUse(by: "arrival" | "departure" | null): void {
    const store = useGameStore.getState();
    store.setBossInUse(by);
    if (by === null) {
      setTimeout(() => this.notifyBossAvailable(), 0);
    }
  }

  private handleOpenElevator(): void {
    this.elevatorUsageCount++;
    useGameStore.getState().setElevatorState("open");
  }

  private handleCloseElevator(): void {
    this.elevatorUsageCount = Math.max(0, this.elevatorUsageCount - 1);
    if (this.elevatorUsageCount === 0) {
      useGameStore.getState().setElevatorState("closed");
      this.notifyElevatorDoorClosing();
    }
  }

  /**
   * Notify all agents that elevator doors are starting to close.
   * XState will ignore the event if an agent is not in a receptive state.
   */
  private notifyElevatorDoorClosing(): void {
    for (const managed of this.agents.values()) {
      managed.actor.send({ type: "ELEVATOR_DOOR_CLOSING" });
    }
  }

  private handleAgentRemoved(agentId: string): void {
    const managed = this.agents.get(agentId);
    if (managed) {
      managed.actor.stop();
      this.agents.delete(agentId);
    }

    this.queue.clearAllReservations(agentId);
    this.pendingDepartures.delete(agentId);

    const queueType = this.queue.releaseReadyPositionForAgent(agentId);
    if (queueType) {
      setTimeout(() => this.notifyBossAvailable(), 0);
    }

    useGameStore.getState().removeAgent(agentId);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const agentMachineService = new AgentMachineService();
