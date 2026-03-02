/**
 * Agent Arrival Sub-Machine — State Documentation
 *
 * Documents the arrival flow states extracted from agentMachine.ts.
 * These states are embedded directly into the parent machine in agentMachine.ts
 * under the "arrival" compound state.
 *
 * Arrival Flow:
 *   spawn → arriving → in_arrival_queue → walking_to_ready → conversing
 *         → walking_to_boss → at_boss → walking_to_desk → idle (parent)
 *
 * Actions used (defined in agentMachineCommon.ts / agentMachine.ts):
 *   - notifyPhaseChange, setQueueTypeArrival, openElevator, closeElevator
 *   - startWalkingToQueue, startWalkingToReady, startWalkingToBoss, startWalkingToDesk
 *   - joinQueue, leaveQueue, claimBoss, releaseBoss, clearQueueType
 *   - showArrivalBossBubble, showArrivalAgentBubble, clearBossBubble
 *   - updateQueueIndex, resetConversationStep, incrementConversationStep
 *
 * Guards used:
 *   - isAtFrontOfQueue
 *
 * Delays used:
 *   - BOSS_PAUSE (100 ms)
 */

// This file is intentionally documentation-only.
// The arrival states live in agentMachine.ts → "arrival" compound state.
// See agentMachineCommon.ts for shared types and action/guard definitions.

export const ARRIVAL_STATES = [
  "arriving",
  "in_queue",
  "walking_to_ready",
  "conversing",
  "walking_to_boss",
  "at_boss",
  "walking_to_desk",
] as const;

export type ArrivalState = (typeof ARRIVAL_STATES)[number];
