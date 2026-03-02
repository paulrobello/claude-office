/**
 * Agent Departure Sub-Machine — State Documentation
 *
 * Documents the departure flow states extracted from agentMachine.ts.
 * These states are embedded directly into the parent machine in agentMachine.ts
 * under the "departure" compound state.
 *
 * Departure Flow:
 *   idle → departing → in_departure_queue → walking_to_ready → conversing
 *        → walking_to_boss → at_boss → walking_to_elevator → in_elevator
 *        → waiting_for_door_close → elevator_closing → removed (final)
 *
 * Actions used (defined in agentMachineCommon.ts / agentMachine.ts):
 *   - notifyPhaseChange, setQueueTypeDeparture, clearQueueType
 *   - clearAgentBubble, startWalkingToQueue, startWalkingToReady
 *   - startWalkingToBoss, startWalkingToElevator, releaseBoss
 *   - joinQueue, leaveQueue, claimBoss
 *   - showDepartureAgentBubble, showDepartureBossBubble, showFarewellBubble
 *   - clearBossBubble, openElevator, closeElevator, removeAgent
 *   - updateQueueIndex, resetConversationStep, incrementConversationStep
 *
 * Guards used:
 *   - isAtFrontOfQueue
 *
 * Delays used:
 *   - BOSS_PAUSE (100 ms)
 *   - ELEVATOR_PAUSE (500 ms)
 *   - DOOR_CLOSE_DELAY (520 ms)
 */

// This file is intentionally documentation-only.
// The departure states live in agentMachine.ts → "departure" compound state.
// See agentMachineCommon.ts for shared types and action/guard definitions.

export const DEPARTURE_STATES = [
  "departing",
  "in_queue",
  "walking_to_ready",
  "conversing",
  "walking_to_boss",
  "at_boss",
  "walking_to_elevator",
  "in_elevator",
  "waiting_for_door_close",
  "elevator_closing",
  "removed",
] as const;

export type DepartureState = (typeof DEPARTURE_STATES)[number];
