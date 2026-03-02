/**
 * Queue Manager
 *
 * Encapsulates queue reservation tracking and ready-position occupancy
 * for both the arrival and departure queues.
 *
 * Extracted from AgentMachineService so that queue logic can be
 * reasoned about and tested independently of the machine lifecycle.
 */

import { getQueuePosition } from "@/systems/queuePositions";
import { animationSystem } from "@/systems/animationSystem";
import { useGameStore } from "@/stores/gameStore";

// ============================================================================
// QUEUE MANAGER
// ============================================================================

export class QueueManager {
  /**
   * Reserved queue positions for agents walking to a queue slot.
   * Prevents race conditions where two agents try to claim the same slot.
   * Key: "arrival" | "departure"  Value: Map<positionIndex → agentId>
   */
  private reservations: Map<string, Map<number, string>> = new Map([
    ["arrival", new Map()],
    ["departure", new Map()],
  ]);

  /**
   * Which agent is currently at or walking to the ready position (A0/D0).
   * Prevents multiple agents from stacking at the ready position.
   * Key: "arrival" | "departure"  Value: agentId | null
   */
  private readyOccupant: Map<string, string | null> = new Map([
    ["arrival", null],
    ["departure", null],
  ]);

  // ==========================================================================
  // RESERVATION API
  // ==========================================================================

  /**
   * Reserve a queue slot for an agent that is walking toward it.
   * Returns the 1-based position index that was reserved.
   */
  reserveQueueSlot(
    agentId: string,
    queueType: "arrival" | "departure",
  ): number {
    const store = useGameStore.getState();
    const queue =
      queueType === "arrival" ? store.arrivalQueue : store.departureQueue;
    const reservations = this.reservations.get(queueType)!;

    // Count reservations held by OTHER agents
    let reservationCount = 0;
    for (const reservedBy of reservations.values()) {
      if (reservedBy !== agentId) {
        reservationCount++;
      }
    }

    // New agent always joins at the back
    const slotIndex = queue.length + reservationCount + 1;
    reservations.set(slotIndex, agentId);
    return slotIndex;
  }

  /**
   * Clear the reservation held by a specific agent (called when they arrive
   * at their queue position and formally join the queue).
   */
  clearReservation(agentId: string, queueType: "arrival" | "departure"): void {
    const reservations = this.reservations.get(queueType)!;
    for (const [posIndex, reservedBy] of reservations.entries()) {
      if (reservedBy === agentId) {
        reservations.delete(posIndex);
        break;
      }
    }
  }

  /**
   * Clear ALL reservations held by a specific agent across both queues.
   */
  clearAllReservations(agentId: string): void {
    for (const reservations of this.reservations.values()) {
      for (const [posIndex, reservedBy] of reservations.entries()) {
        if (reservedBy === agentId) {
          reservations.delete(posIndex);
          break;
        }
      }
    }
  }

  /**
   * Return the current slot index reserved for an agent, or -1 if none.
   */
  getReservationIndex(
    agentId: string,
    queueType: "arrival" | "departure",
  ): number {
    const reservations = this.reservations.get(queueType)!;
    for (const [posIndex, reservedBy] of reservations.entries()) {
      if (reservedBy === agentId) return posIndex;
    }
    return -1;
  }

  // ==========================================================================
  // READY-POSITION OCCUPANCY API
  // ==========================================================================

  /**
   * Mark an agent as occupying the ready position for their queue type.
   */
  claimReadyPosition(
    agentId: string,
    queueType: "arrival" | "departure",
  ): void {
    this.readyOccupant.set(queueType, agentId);
  }

  /**
   * Release the ready position for a queue type.
   * Returns the agentId that was occupying it, or null.
   */
  releaseReadyPosition(
    agentId: string,
    queueType: "arrival" | "departure",
  ): boolean {
    const current = this.readyOccupant.get(queueType);
    if (current === agentId) {
      this.readyOccupant.set(queueType, null);
      return true;
    }
    return false;
  }

  /**
   * Release the ready position for whichever queue this agent occupies.
   * Returns the queueType that was released, or null.
   */
  releaseReadyPositionForAgent(
    agentId: string,
  ): "arrival" | "departure" | null {
    for (const [queueType, occupant] of this.readyOccupant.entries()) {
      if (occupant === agentId) {
        this.readyOccupant.set(queueType, null);
        return queueType as "arrival" | "departure";
      }
    }
    return null;
  }

  /**
   * Return the current occupant of the ready position, or null.
   */
  getReadyOccupant(queueType: "arrival" | "departure"): string | null {
    return this.readyOccupant.get(queueType) ?? null;
  }

  // ==========================================================================
  // QUEUE INDEX SYNC
  // ==========================================================================

  /**
   * Recalculate queue positions for all agents in a queue after one leaves,
   * sending them to their new physical slot via the animation system.
   */
  updateQueueIndices(
    queueType: "arrival" | "departure",
    sendEventToAgent: (
      agentId: string,
      event: { type: "QUEUE_POSITION_CHANGED"; newIndex: number },
    ) => void,
  ): void {
    const store = useGameStore.getState();
    const queue =
      queueType === "arrival" ? store.arrivalQueue : store.departureQueue;

    queue.forEach((agentId, index) => {
      sendEventToAgent(agentId, {
        type: "QUEUE_POSITION_CHANGED",
        newIndex: index,
      });

      // Position index 0 in queue maps to slot 1 (A1/D1), etc.
      const positionIndex = index + 1;
      const newPosition = getQueuePosition(queueType, positionIndex);

      if (newPosition) {
        store.updateAgentTarget(agentId, newPosition);
        store.updateAgentQueueInfo(agentId, queueType, index);
        animationSystem.setAgentPath(agentId, newPosition);
      }
    });
  }

  // ==========================================================================
  // RESET
  // ==========================================================================

  /**
   * Clear all state — called when the service resets.
   */
  reset(): void {
    this.reservations.get("arrival")!.clear();
    this.reservations.get("departure")!.clear();
    this.readyOccupant.set("arrival", null);
    this.readyOccupant.set("departure", null);
  }
}
