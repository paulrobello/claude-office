/**
 * Agent State Machine — Composition Root
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
 *
 * Implementation is split across:
 *   - agentMachineCommon.ts  — shared types, actions, guards, delays
 *   - agentArrivalMachine.ts — arrival sub-machine states
 *   - agentDepartureMachine.ts — departure sub-machine states
 */

import { setup, assign, type ActorRefFrom } from "xstate";
import {
  buildSharedActions,
  sharedGuards,
  sharedDelays,
  defaultAgentContext,
  type AgentMachineActions,
  type AgentMachineContext,
  type AgentMachineEvent,
} from "./agentMachineCommon";

// Re-export all public types so existing consumers keep working without changes.
export type {
  AgentMachineContext,
  AgentMachineEvent,
  AgentMachineActions,
} from "./agentMachineCommon";

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
      ...buildSharedActions(actions),
      // Context mutation actions — must be defined inline inside setup() so
      // that XState v5 can infer the full AgentMachineEvent type.
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
        queueType: null as "arrival" | "departure" | null,
      }),
      incrementConversationStep: assign({
        conversationStep: ({ context }) => context.conversationStep + 1,
      }),
      resetConversationStep: assign({
        conversationStep: 0,
      }),
    },
    guards: sharedGuards,
    delays: sharedDelays,
  }).createMachine({
    id: "agent",
    initial: "waiting",
    context: defaultAgentContext,

    states: {
      // ======================================================================
      // WAITING — Initial state before SPAWN is received
      // ======================================================================
      waiting: {
        // No entry actions — just waiting for a SPAWN event
      },

      // ======================================================================
      // IDLE — Agent is at their desk working
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
      // ARRIVAL FLOW — New agent joining the office
      // ======================================================================
      arrival: {
        initial: "arriving",
        states: {
          arriving: {
            entry: [
              { type: "notifyPhaseChange", params: { phase: "arriving" } },
              "setQueueTypeArrival",
              "openElevator",
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
              "closeElevator",
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
      // DEPARTURE FLOW — Agent leaving the office
      // ======================================================================
      departure: {
        initial: "departing",
        states: {
          departing: {
            entry: [
              { type: "notifyPhaseChange", params: { phase: "departing" } },
              "clearAgentBubble",
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
              "showFarewellBubble",
              "openElevator",
              "startWalkingToElevator",
            ],
            on: {
              ARRIVED_AT_ELEVATOR: "in_elevator",
            },
          },

          in_elevator: {
            entry: [
              { type: "notifyPhaseChange", params: { phase: "in_elevator" } },
            ],
            after: {
              ELEVATOR_PAUSE: "waiting_for_door_close",
            },
          },

          waiting_for_door_close: {
            entry: ["closeElevator"],
            on: {
              ELEVATOR_DOOR_CLOSING: "elevator_closing",
            },
          },

          elevator_closing: {
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
      // Normal spawn — start arrival flow from elevator
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
      // Mid-session spawn — agent already at desk (skip arrival)
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
      // Mid-session spawn — agent already in arrival queue
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
      // Mid-session spawn — agent already in departure queue
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
