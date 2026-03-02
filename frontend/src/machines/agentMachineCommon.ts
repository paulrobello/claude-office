/**
 * Agent Machine — Shared types, actions, guards, and delays
 *
 * This module contains everything shared between the arrival and departure
 * sub-machines: context shape, event union, the external action interface,
 * and the reusable action/guard/delay implementations.
 */

import type { Position } from "@/types";
import {
  getRandomWorkAcceptanceQuote,
  getRandomWorkCompletionQuote,
} from "@/constants/quotes";

// ============================================================================
// TYPES
// ============================================================================

export interface AgentMachineContext {
  agentId: string;
  agentName: string | null;
  desk: number | null;
  queueType: "arrival" | "departure" | null;
  queueIndex: number;
  currentPosition: Position;
  targetPosition: Position;
  conversationStep: number;
}

export type AgentMachineEvent =
  | {
      type: "SPAWN";
      agentId: string;
      name: string | null;
      desk: number | null;
      position: Position;
    }
  | {
      type: "SPAWN_AT_DESK";
      agentId: string;
      name: string | null;
      desk: number | null;
      position: Position;
    }
  | {
      type: "SPAWN_IN_ARRIVAL_QUEUE";
      agentId: string;
      name: string | null;
      desk: number | null;
      position: Position;
      queueIndex: number;
    }
  | {
      type: "SPAWN_IN_DEPARTURE_QUEUE";
      agentId: string;
      name: string | null;
      desk: number | null;
      position: Position;
      queueIndex: number;
    }
  | { type: "REMOVE" }
  | { type: "ARRIVED_AT_QUEUE" }
  | { type: "QUEUE_POSITION_CHANGED"; newIndex: number }
  | { type: "BOSS_AVAILABLE" }
  | { type: "ARRIVED_AT_READY" }
  | { type: "BUBBLE_DISPLAYED" }
  | { type: "CONVERSATION_COMPLETE" }
  | { type: "ARRIVED_AT_BOSS" }
  | { type: "BOSS_TIMEOUT" }
  | { type: "ARRIVED_AT_DESK" }
  | { type: "ARRIVED_AT_ELEVATOR" }
  | { type: "ELEVATOR_TIMEOUT" }
  | { type: "ELEVATOR_DOOR_CLOSING" };

// ============================================================================
// EXTERNAL ACTION INTERFACE
// ============================================================================

/**
 * External action handlers that the machine will call.
 * These are injected when spawning the machine.
 */
export interface AgentMachineActions {
  onStartWalking: (
    agentId: string,
    target: Position,
    movementType: string,
  ) => void;
  onQueueJoined: (
    agentId: string,
    queueType: "arrival" | "departure",
    index: number,
  ) => void;
  onQueueLeft: (agentId: string) => void;
  onPhaseChanged: (agentId: string, phase: string) => void;
  onShowBossBubble: (text: string, icon?: string) => void;
  onShowAgentBubble: (agentId: string, text: string, icon?: string) => void;
  onClearBossBubble: () => void;
  onClearAgentBubble: (agentId: string) => void;
  onSetBossInUse: (by: "arrival" | "departure" | null) => void;
  onOpenElevator: () => void;
  onCloseElevator: () => void;
  onAgentRemoved: (agentId: string) => void;
}

// ============================================================================
// FAREWELL MESSAGES
// ============================================================================

const FAREWELL_MESSAGES = [
  // Classic goodbyes
  "Peace out! \u270c\ufe0f",
  "Later gators! \ud83d\udc0a",
  "Off to lunch! \ud83c\udf55",
  "Task complete!",
  "Bye bye! \ud83d\udc4b",
  "See ya! \ud83d\ude0e",
  "Mission done!",
  "Adios! \ud83c\udf89",
  "Catch ya later!",
  "Gotta bounce! \ud83c\udfc0",
  // Work done vibes
  "Nailed it! \ud83d\udc85",
  "Done and dusted!",
  "That's a wrap! \ud83c\udfac",
  "Job well done!",
  "Crushed it! \ud83d\udcaa",
  "Another one down!",
  "Check that off!",
  "Work's done here!",
  "Mission complete!",
  "All finished up!",
  // Casual exits
  "I'm outta here!",
  "Time to jet! \u2708\ufe0f",
  "Heading out!",
  "Off I go!",
  "Gotta run!",
  "Time to split!",
  "Making my exit!",
  "Dipping out!",
  "Bouncing now!",
  "Rolling out! \ud83d\udede",
  // Fun phrases
  "To infinity! \ud83d\ude80",
  "Smell ya later!",
  "Toodaloo! \ud83d\udc4b",
  "Ciao for now!",
  "Hasta la vista!",
  "Au revoir! \ud83c\uddeb\ud83c\uddf7",
  "Sayonara! \ud83c\uddef\ud83c\uddf5",
  "Arrivederci! \ud83c\uddee\ud83c\uddf9",
  "Cheerio! \ud83c\uddec\ud83c\udde7",
  "Ta-ta for now!",
  // Food-related
  "Snack time! \ud83c\udf7f",
  "Coffee break! \u2615",
  "Lunch awaits! \ud83e\udd6a",
  "Pizza calling! \ud83c\udf55",
  "Taco Tuesday? \ud83c\udf2e",
  "Need caffeine! \u2615",
  "Donut run! \ud83c\udf69",
  "Sushi time! \ud83c\udf63",
  "Hungry now!",
  "Brunch o'clock!",
  // Relaxation
  "Nap time! \ud83d\ude34",
  "Beach bound! \ud83c\udfd6\ufe0f",
  "Netflix time! \ud83d\udcfa",
  "Couch calling!",
  "Hammock mode! \ud83c\udfd5\ufe0f",
  "R&R time!",
  "Vacation mode!",
  "Chill time! \ud83e\uddca",
  "Spa day! \ud83d\udc86",
  "Me time!",
  // Energetic
  "Boom! Done! \ud83d\udca5",
  "Drop the mic! \ud83c\udfa4",
  "And scene! \ud83c\udfad",
  "Exit stage left!",
  "Finito!",
  "That's all folks!",
  "The end! \ud83d\udd1a",
  "Curtain call! \ud83c\udfaa",
  "Bam! Complete!",
  "Kapow! Done! \ud83d\udcab",
  // Emoji-heavy
  "Later! \ud83d\ude4c",
  "Byeee! \ud83d\udca8",
  "Gone! \ud83d\udca8",
  "Zoom zoom! \ud83c\udfce\ufe0f",
  "Whoosh! \ud83d\udca8",
  "Poof! \u2728",
  "Deuces! \u270c\ufe0f",
  "Peacing out! \u262e\ufe0f",
  "Waving bye! \ud83d\udc4b",
  "Off like a rocket! \ud83d\ude80",
  // Professional-ish
  "Until next time!",
  "Be seeing you!",
  "Take care now!",
  "Have a good one!",
  "Keep it real!",
  "Stay classy!",
  "Stay awesome! \u2b50",
  "Rock on! \ud83e\udd18",
  "Over and out!",
  "Signing off! \ud83d\udcdd",
  // Random fun
  "Yeet! \ud83d\ude80",
  "I'm ghost! \ud83d\udc7b",
  "Vanishing act! \ud83c\udfa9",
  "Ninja exit! \ud83e\udd77",
  "Stealth mode! \ud83d\udd75\ufe0f",
  "Beam me up! \ud83d\udef8",
  "Teleporting out!",
  "Level complete! \ud83c\udfae",
  "Quest finished! \u2694\ufe0f",
  "Achievement get! \ud83c\udfc6",
];

export function getRandomFarewell(): string {
  return FAREWELL_MESSAGES[
    Math.floor(Math.random() * FAREWELL_MESSAGES.length)
  ];
}

// ============================================================================
// SHARED ACTION FACTORIES
// ============================================================================

/**
 * Build the shared action map used by both arrival and departure machines.
 * The caller injects the external `actions` object at machine creation time.
 */
export function buildSharedActions(actions: AgentMachineActions) {
  return {
    // Phase notifications
    notifyPhaseChange: (
      { context }: { context: AgentMachineContext },
      params: { phase: string },
    ) => {
      actions.onPhaseChanged(context.agentId, params.phase);
    },

    // Walking actions
    startWalkingToQueue: ({ context }: { context: AgentMachineContext }) => {
      const queueType = context.queueType ?? "arrival";
      actions.onStartWalking(
        context.agentId,
        context.targetPosition,
        `to_${queueType}_queue`,
      );
    },
    startWalkingToReady: ({ context }: { context: AgentMachineContext }) => {
      actions.onStartWalking(
        context.agentId,
        context.targetPosition,
        "to_ready",
      );
    },
    startWalkingToBoss: ({ context }: { context: AgentMachineContext }) => {
      actions.onStartWalking(
        context.agentId,
        context.targetPosition,
        "to_boss",
      );
    },
    startWalkingToDesk: ({ context }: { context: AgentMachineContext }) => {
      actions.onStartWalking(
        context.agentId,
        context.targetPosition,
        "to_desk",
      );
    },
    startWalkingToElevator: ({ context }: { context: AgentMachineContext }) => {
      actions.onStartWalking(
        context.agentId,
        context.targetPosition,
        "to_elevator",
      );
    },

    // Queue actions
    joinQueue: ({ context }: { context: AgentMachineContext }) => {
      if (context.queueType) {
        actions.onQueueJoined(
          context.agentId,
          context.queueType,
          context.queueIndex,
        );
      }
    },
    leaveQueue: ({ context }: { context: AgentMachineContext }) => {
      actions.onQueueLeft(context.agentId);
    },

    // Arrival conversation actions
    showArrivalBossBubble: ({ context }: { context: AgentMachineContext }) => {
      const name = context.agentName ?? "Agent";
      actions.onShowBossBubble(`Here's your task, ${name}!`, "clipboard");
    },
    showArrivalAgentBubble: ({ context }: { context: AgentMachineContext }) => {
      actions.onShowAgentBubble(
        context.agentId,
        getRandomWorkAcceptanceQuote(),
        "thumbs-up",
      );
    },

    // Departure conversation actions
    showDepartureBossBubble: ({
      context,
    }: {
      context: AgentMachineContext;
    }) => {
      const name = context.agentName ?? "Agent";
      actions.onShowBossBubble(`Good work, ${name}. I'll take that.`, "check");
    },
    showDepartureAgentBubble: ({
      context,
    }: {
      context: AgentMachineContext;
    }) => {
      actions.onShowAgentBubble(
        context.agentId,
        getRandomWorkCompletionQuote(),
        "file-text",
      );
    },
    showFarewellBubble: ({ context }: { context: AgentMachineContext }) => {
      actions.onShowAgentBubble(context.agentId, getRandomFarewell());
    },

    // Bubble lifecycle
    clearBossBubble: () => {
      actions.onClearBossBubble();
    },
    clearAgentBubble: ({ context }: { context: AgentMachineContext }) => {
      actions.onClearAgentBubble(context.agentId);
    },

    // Boss availability
    claimBoss: ({ context }: { context: AgentMachineContext }) => {
      actions.onSetBossInUse(context.queueType);
    },
    releaseBoss: () => {
      actions.onSetBossInUse(null);
    },

    // Elevator actions
    openElevator: () => {
      actions.onOpenElevator();
    },
    closeElevator: () => {
      actions.onCloseElevator();
    },

    // Removal
    removeAgent: ({ context }: { context: AgentMachineContext }) => {
      actions.onAgentRemoved(context.agentId);
    },
  };
}

/**
 * Names of actions that require `assign` and must be defined
 * inside `setup()` at the call site where XState can infer the
 * full event type.  The keys here match the names referenced in
 * state machine entry/transition arrays.
 *
 * Callers should spread `buildSharedActions(actions)` and then add
 * the assign-based actions returned by `buildAssignActions()`.
 */
export const ASSIGN_ACTION_NAMES = [
  "updateQueueIndex",
  "setQueueTypeArrival",
  "setQueueTypeDeparture",
  "clearQueueType",
  "incrementConversationStep",
  "resetConversationStep",
] as const;

// ============================================================================
// SHARED GUARDS
// ============================================================================

export const sharedGuards = {
  isAtFrontOfQueue: ({ context }: { context: AgentMachineContext }) =>
    context.queueIndex === 0,
  isArrival: ({ context }: { context: AgentMachineContext }) =>
    context.queueType === "arrival",
  isDeparture: ({ context }: { context: AgentMachineContext }) =>
    context.queueType === "departure",
};

// ============================================================================
// SHARED DELAYS
// ============================================================================

export const sharedDelays = {
  BOSS_PAUSE: 100,
  ELEVATOR_PAUSE: 500,
  DOOR_CLOSE_DELAY: 520, // Wait for door close animation (500ms) + minimal buffer
} as const;

// ============================================================================
// DEFAULT CONTEXT
// ============================================================================

export const defaultAgentContext: AgentMachineContext = {
  agentId: "",
  agentName: null,
  desk: null,
  queueType: null,
  queueIndex: -1,
  currentPosition: { x: 0, y: 0 },
  targetPosition: { x: 0, y: 0 },
  conversationStep: 0,
};
