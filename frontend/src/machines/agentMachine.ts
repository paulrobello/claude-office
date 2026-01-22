/**
 * Agent State Machine
 *
 * Defines the lifecycle of an agent from spawn to removal.
 * Uses XState v5 for explicit state management.
 *
 * Arrival Flow:
 *   spawn → arriving → in_arrival_queue → walking_to_ready → conversing
 *         → walking_to_boss → at_boss → walking_to_desk → idle
 *
 * Departure Flow:
 *   idle → departing → in_departure_queue → walking_to_ready → conversing
 *        → walking_to_boss → at_boss → walking_to_elevator → in_elevator
 *        → waiting_for_door_close → elevator_closing → removed
 */

import { setup, assign, type ActorRefFrom } from "xstate";
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
// ACTIONS (externalized for testability)
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
// MACHINE DEFINITION
// ============================================================================

export const createAgentMachine = (actions: AgentMachineActions) =>
  setup({
    types: {
      context: {} as AgentMachineContext,
      events: {} as AgentMachineEvent,
    },
    actions: {
      // Phase notifications
      notifyPhaseChange: ({ context }, params: { phase: string }) => {
        actions.onPhaseChanged(context.agentId, params.phase);
      },

      // Walking actions
      startWalkingToQueue: ({ context }) => {
        const queueType = context.queueType ?? "arrival";
        actions.onStartWalking(
          context.agentId,
          context.targetPosition,
          `to_${queueType}_queue`,
        );
      },
      startWalkingToReady: ({ context }) => {
        actions.onStartWalking(
          context.agentId,
          context.targetPosition,
          "to_ready",
        );
      },
      startWalkingToBoss: ({ context }) => {
        actions.onStartWalking(
          context.agentId,
          context.targetPosition,
          "to_boss",
        );
      },
      startWalkingToDesk: ({ context }) => {
        actions.onStartWalking(
          context.agentId,
          context.targetPosition,
          "to_desk",
        );
      },
      startWalkingToElevator: ({ context }) => {
        actions.onStartWalking(
          context.agentId,
          context.targetPosition,
          "to_elevator",
        );
      },

      // Queue actions
      joinQueue: ({ context }) => {
        if (context.queueType) {
          actions.onQueueJoined(
            context.agentId,
            context.queueType,
            context.queueIndex,
          );
        }
      },
      leaveQueue: ({ context }) => {
        actions.onQueueLeft(context.agentId);
      },

      // Conversation actions
      showArrivalBossBubble: ({ context }) => {
        const name = context.agentName ?? "Agent";
        actions.onShowBossBubble(`Here's your task, ${name}!`, "clipboard");
      },
      showArrivalAgentBubble: ({ context }) => {
        actions.onShowAgentBubble(
          context.agentId,
          getRandomWorkAcceptanceQuote(),
          "thumbs-up",
        );
      },
      showDepartureBossBubble: ({ context }) => {
        const name = context.agentName ?? "Agent";
        actions.onShowBossBubble(
          `Good work, ${name}. I'll take that.`,
          "check",
        );
      },
      showDepartureAgentBubble: ({ context }) => {
        actions.onShowAgentBubble(
          context.agentId,
          getRandomWorkCompletionQuote(),
          "file-text",
        );
      },
      clearBossBubble: () => {
        actions.onClearBossBubble();
      },
      clearAgentBubble: ({ context }) => {
        actions.onClearAgentBubble(context.agentId);
      },
      showFarewellBubble: ({ context }) => {
        // Fun farewell messages when agent leaves (100 phrases)
        const farewells = [
          // Classic goodbyes
          "Peace out! ✌️",
          "Later gators! 🐊",
          "Off to lunch! 🍕",
          "Task complete!",
          "Bye bye! 👋",
          "See ya! 😎",
          "Mission done!",
          "Adios! 🎉",
          "Catch ya later!",
          "Gotta bounce! 🏀",
          // Work done vibes
          "Nailed it! 💅",
          "Done and dusted!",
          "That's a wrap! 🎬",
          "Job well done!",
          "Crushed it! 💪",
          "Another one down!",
          "Check that off!",
          "Work's done here!",
          "Mission complete!",
          "All finished up!",
          // Casual exits
          "I'm outta here!",
          "Time to jet! ✈️",
          "Heading out!",
          "Off I go!",
          "Gotta run!",
          "Time to split!",
          "Making my exit!",
          "Dipping out!",
          "Bouncing now!",
          "Rolling out! 🛞",
          // Fun phrases
          "To infinity! 🚀",
          "Smell ya later!",
          "Toodaloo! 👋",
          "Ciao for now!",
          "Hasta la vista!",
          "Au revoir! 🇫🇷",
          "Sayonara! 🇯🇵",
          "Arrivederci! 🇮🇹",
          "Cheerio! 🇬🇧",
          "Ta-ta for now!",
          // Food-related
          "Snack time! 🍿",
          "Coffee break! ☕",
          "Lunch awaits! 🥪",
          "Pizza calling! 🍕",
          "Taco Tuesday? 🌮",
          "Need caffeine! ☕",
          "Donut run! 🍩",
          "Sushi time! 🍣",
          "Hungry now!",
          "Brunch o'clock!",
          // Relaxation
          "Nap time! 😴",
          "Beach bound! 🏖️",
          "Netflix time! 📺",
          "Couch calling!",
          "Hammock mode! 🏝️",
          "R&R time!",
          "Vacation mode!",
          "Chill time! 🧊",
          "Spa day! 💆",
          "Me time!",
          // Energetic
          "Boom! Done! 💥",
          "Drop the mic! 🎤",
          "And scene! 🎭",
          "Exit stage left!",
          "Finito!",
          "That's all folks!",
          "The end! 🔚",
          "Curtain call! 🎪",
          "Bam! Complete!",
          "Kapow! Done! 💫",
          // Emoji-heavy
          "Later! 🙌",
          "Byeee! 💨",
          "Gone! 💨",
          "Zoom zoom! 🏎️",
          "Whoosh! 💨",
          "Poof! ✨",
          "Deuces! ✌️",
          "Peacing out! ☮️",
          "Waving bye! 👋",
          "Off like a rocket! 🚀",
          // Professional-ish
          "Until next time!",
          "Be seeing you!",
          "Take care now!",
          "Have a good one!",
          "Keep it real!",
          "Stay classy!",
          "Stay awesome! ⭐",
          "Rock on! 🤘",
          "Over and out!",
          "Signing off! 📝",
          // Random fun
          "Yeet! 🚀",
          "I'm ghost! 👻",
          "Vanishing act! 🎩",
          "Ninja exit! 🥷",
          "Stealth mode! 🕵️",
          "Beam me up! 🛸",
          "Teleporting out!",
          "Level complete! 🎮",
          "Quest finished! ⚔️",
          "Achievement get! 🏆",
        ];
        const msg = farewells[Math.floor(Math.random() * farewells.length)];
        actions.onShowAgentBubble(context.agentId, msg);
      },

      // Boss availability
      claimBoss: ({ context }) => {
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
      removeAgent: ({ context }) => {
        actions.onAgentRemoved(context.agentId);
      },

      // Context updates
      updateQueueIndex: assign({
        queueIndex: (_, params: { newIndex: number }) => params.newIndex,
      }),
      setQueueTypeArrival: assign({
        queueType: "arrival" as const,
      }),
      setQueueTypeDeparture: assign({
        queueType: "departure" as const,
      }),
      clearQueueType: assign({
        queueType: null,
      }),
      incrementConversationStep: assign({
        conversationStep: ({ context }) => context.conversationStep + 1,
      }),
      resetConversationStep: assign({
        conversationStep: 0,
      }),
    },
    guards: {
      isAtFrontOfQueue: ({ context }) => context.queueIndex === 0,
      isArrival: ({ context }) => context.queueType === "arrival",
      isDeparture: ({ context }) => context.queueType === "departure",
    },
    delays: {
      BOSS_PAUSE: 100,
      ELEVATOR_PAUSE: 500,
      DOOR_CLOSE_DELAY: 520, // Wait for door close animation (500ms) + minimal buffer
    },
  }).createMachine({
    id: "agent",
    initial: "waiting",
    context: {
      agentId: "",
      agentName: null,
      desk: null,
      queueType: null,
      queueIndex: -1,
      currentPosition: { x: 0, y: 0 },
      targetPosition: { x: 0, y: 0 },
      conversationStep: 0,
    },

    states: {
      // ======================================================================
      // WAITING - Initial state before SPAWN is received
      // ======================================================================
      waiting: {
        // No entry actions - just waiting for SPAWN event
      },

      // ======================================================================
      // IDLE - Agent is at their desk working
      // ======================================================================
      idle: {
        entry: [{ type: "notifyPhaseChange", params: { phase: "idle" } }],
        on: {
          REMOVE: {
            target: "departure.departing",
            actions: ["setQueueTypeDeparture"],
          },
        },
      },

      // ======================================================================
      // ARRIVAL FLOW - New agent joining the office
      // ======================================================================
      arrival: {
        initial: "arriving",
        states: {
          arriving: {
            entry: [
              { type: "notifyPhaseChange", params: { phase: "arriving" } },
              "setQueueTypeArrival",
              "openElevator", // Open elevator for agent to exit
              "startWalkingToQueue",
            ],
            on: {
              ARRIVED_AT_QUEUE: "in_queue",
            },
          },

          in_queue: {
            entry: [
              {
                type: "notifyPhaseChange",
                params: { phase: "in_arrival_queue" },
              },
              "closeElevator", // Agent has exited elevator
              "joinQueue",
            ],
            on: {
              QUEUE_POSITION_CHANGED: {
                actions: [
                  {
                    type: "updateQueueIndex",
                    params: ({ event }) => ({ newIndex: event.newIndex }),
                  },
                ],
              },
              BOSS_AVAILABLE: {
                target: "walking_to_ready",
                guard: "isAtFrontOfQueue",
                actions: ["claimBoss", "leaveQueue"],
              },
            },
          },

          walking_to_ready: {
            entry: [
              {
                type: "notifyPhaseChange",
                params: { phase: "walking_to_ready" },
              },
              "startWalkingToReady",
            ],
            on: {
              ARRIVED_AT_READY: "conversing",
            },
          },

          conversing: {
            initial: "boss_speaks",
            entry: [
              { type: "notifyPhaseChange", params: { phase: "conversing" } },
              "resetConversationStep",
            ],
            states: {
              boss_speaks: {
                entry: ["clearBossBubble", "showArrivalBossBubble"],
                on: {
                  BUBBLE_DISPLAYED: "agent_responds",
                },
              },
              agent_responds: {
                entry: ["incrementConversationStep", "showArrivalAgentBubble"],
                // Short delay then proceed - don't wait for bubble dismissal
                after: {
                  800: "done",
                },
              },
              done: {
                type: "final",
              },
            },
            onDone: "walking_to_boss",
          },

          walking_to_boss: {
            entry: [
              {
                type: "notifyPhaseChange",
                params: { phase: "walking_to_boss" },
              },
              "startWalkingToBoss",
            ],
            on: {
              ARRIVED_AT_BOSS: "at_boss",
            },
          },

          at_boss: {
            entry: [
              { type: "notifyPhaseChange", params: { phase: "at_boss" } },
            ],
            after: {
              BOSS_PAUSE: "walking_to_desk",
            },
          },

          walking_to_desk: {
            entry: [
              {
                type: "notifyPhaseChange",
                params: { phase: "walking_to_desk" },
              },
              "releaseBoss",
              "clearQueueType",
              "startWalkingToDesk",
            ],
            on: {
              ARRIVED_AT_DESK: "#agent.idle",
            },
          },
        },
      },

      // ======================================================================
      // DEPARTURE FLOW - Agent leaving the office
      // ======================================================================
      departure: {
        initial: "departing",
        states: {
          departing: {
            entry: [
              { type: "notifyPhaseChange", params: { phase: "departing" } },
              "clearAgentBubble", // Clear any lingering tool use bubbles
              "startWalkingToQueue",
            ],
            on: {
              ARRIVED_AT_QUEUE: "in_queue",
            },
          },

          in_queue: {
            entry: [
              {
                type: "notifyPhaseChange",
                params: { phase: "in_departure_queue" },
              },
              "joinQueue",
            ],
            on: {
              QUEUE_POSITION_CHANGED: {
                actions: [
                  {
                    type: "updateQueueIndex",
                    params: ({ event }) => ({ newIndex: event.newIndex }),
                  },
                ],
              },
              BOSS_AVAILABLE: {
                target: "walking_to_ready",
                guard: "isAtFrontOfQueue",
                actions: ["claimBoss", "leaveQueue"],
              },
            },
          },

          walking_to_ready: {
            entry: [
              {
                type: "notifyPhaseChange",
                params: { phase: "walking_to_ready" },
              },
              "startWalkingToReady",
            ],
            on: {
              ARRIVED_AT_READY: "conversing",
            },
          },

          conversing: {
            initial: "agent_speaks",
            entry: [
              { type: "notifyPhaseChange", params: { phase: "conversing" } },
              "resetConversationStep",
            ],
            states: {
              agent_speaks: {
                entry: ["clearBossBubble", "showDepartureAgentBubble"],
                on: {
                  BUBBLE_DISPLAYED: "boss_responds",
                },
              },
              boss_responds: {
                entry: ["incrementConversationStep", "showDepartureBossBubble"],
                on: {
                  BUBBLE_DISPLAYED: "done",
                },
              },
              done: {
                type: "final",
              },
            },
            onDone: "walking_to_boss",
          },

          walking_to_boss: {
            entry: [
              {
                type: "notifyPhaseChange",
                params: { phase: "walking_to_boss" },
              },
              "startWalkingToBoss",
            ],
            on: {
              ARRIVED_AT_BOSS: "at_boss",
            },
          },

          at_boss: {
            entry: [
              { type: "notifyPhaseChange", params: { phase: "at_boss" } },
            ],
            after: {
              BOSS_PAUSE: "walking_to_elevator",
            },
          },

          walking_to_elevator: {
            entry: [
              {
                type: "notifyPhaseChange",
                params: { phase: "walking_to_elevator" },
              },
              "releaseBoss",
              "showFarewellBubble", // Show fun goodbye message
              "openElevator", // Open elevator BEFORE agent starts walking
              "startWalkingToElevator",
            ],
            on: {
              ARRIVED_AT_ELEVATOR: "in_elevator",
            },
          },

          in_elevator: {
            entry: [
              { type: "notifyPhaseChange", params: { phase: "in_elevator" } },
              // Elevator already open from walking_to_elevator
            ],
            after: {
              ELEVATOR_PAUSE: "waiting_for_door_close",
            },
          },

          waiting_for_door_close: {
            // Agent signals they're ready to leave, waits for elevator to actually close
            entry: ["closeElevator"],
            on: {
              // Elevator doors are closing - start the door animation delay
              ELEVATOR_DOOR_CLOSING: "elevator_closing",
            },
          },

          elevator_closing: {
            // Agent stays visible while doors close animation plays
            after: {
              DOOR_CLOSE_DELAY: "removed",
            },
          },

          removed: {
            type: "final",
            entry: ["clearQueueType", "removeAgent"],
          },
        },
      },
    },

    // Global spawn event handlers
    on: {
      // Normal spawn - start arrival flow from elevator
      SPAWN: {
        target: ".arrival.arriving",
        actions: assign({
          agentId: ({ event }) => event.agentId,
          agentName: ({ event }) => event.name,
          desk: ({ event }) => event.desk,
          currentPosition: ({ event }) => event.position,
          targetPosition: ({ event }) => event.position,
        }),
      },
      // Mid-session spawn - agent already at desk (skip arrival)
      SPAWN_AT_DESK: {
        target: ".idle",
        actions: assign({
          agentId: ({ event }) => event.agentId,
          agentName: ({ event }) => event.name,
          desk: ({ event }) => event.desk,
          currentPosition: ({ event }) => event.position,
          targetPosition: ({ event }) => event.position,
          queueType: null,
          queueIndex: -1,
        }),
      },
      // Mid-session spawn - agent already in arrival queue (getting work from boss)
      SPAWN_IN_ARRIVAL_QUEUE: {
        target: ".arrival.in_queue",
        actions: assign({
          agentId: ({ event }) => event.agentId,
          agentName: ({ event }) => event.name,
          desk: ({ event }) => event.desk,
          currentPosition: ({ event }) => event.position,
          targetPosition: ({ event }) => event.position,
          queueType: "arrival" as const,
          queueIndex: ({ event }) => event.queueIndex,
        }),
      },
      // Mid-session spawn - agent already in departure queue (turning in work)
      SPAWN_IN_DEPARTURE_QUEUE: {
        target: ".departure.in_queue",
        actions: assign({
          agentId: ({ event }) => event.agentId,
          agentName: ({ event }) => event.name,
          desk: ({ event }) => event.desk,
          currentPosition: ({ event }) => event.position,
          targetPosition: ({ event }) => event.position,
          queueType: "departure" as const,
          queueIndex: ({ event }) => event.queueIndex,
        }),
      },
    },
  });

export type AgentMachine = ReturnType<typeof createAgentMachine>;
export type AgentMachineActor = ActorRefFrom<AgentMachine>;
