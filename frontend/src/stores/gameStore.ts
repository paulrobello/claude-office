"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  Position,
  BubbleContent,
  BossState,
  AgentState as BackendAgentState,
  ElevatorState,
  PhoneState,
  TodoItem,
  GitStatus,
  WebSocketMessage,
  Agent as BackendAgent,
  GameState as BackendGameState,
  WhiteboardData,
  WhiteboardMode,
} from "@/types";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Frontend-controlled agent phases for queue choreography.
 * These are distinct from backend AgentState which tracks work status.
 */
export type AgentPhase =
  | "idle" // At desk, working
  | "arriving" // Just spawned, walking to queue
  | "in_arrival_queue" // Waiting in arrival queue
  | "walking_to_ready" // Moving to position 0 (ready to talk spot)
  | "conversing" // At position 0, talking to boss
  | "walking_to_boss" // Moving to boss desk slot
  | "at_boss" // Brief pause at boss desk
  | "walking_to_desk" // Moving from boss to assigned desk
  | "departing" // Removed from backend, walking to queue
  | "in_departure_queue" // Waiting in departure queue
  | "walking_to_elevator" // Moving from boss to elevator
  | "in_elevator"; // In elevator, about to be removed

/**
 * Path state for an agent following waypoints.
 */
export interface PathState {
  waypoints: Position[];
  currentIndex: number;
  progress: number; // 0-1 along current segment
}

/**
 * Bubble state with queue for ensuring minimum display time.
 */
export interface BubbleState {
  content: BubbleContent | null;
  displayStartTime: number | null;
  queue: BubbleContent[];
}

/**
 * Complete animation state for an agent (frontend-owned).
 */
export interface AgentAnimationState {
  // Identity (from backend)
  id: string;
  name: string | null;
  color: string;
  number: number;
  desk: number | null;
  backendState: BackendAgentState;
  currentTask: string | null;

  // Phase tracking (frontend owned)
  phase: AgentPhase;

  // Position state (frontend owned)
  currentPosition: Position;
  targetPosition: Position;
  path: PathState | null;

  // Bubble state (frontend owned)
  bubble: BubbleState;

  // Queue metadata
  queueType: "arrival" | "departure" | null;
  queueIndex: number; // Position in queue (-1 = not in queue)

  // Animation state
  isTyping: boolean; // True when agent is actively using tools
}

/**
 * Compaction animation phases for the boss walking to and jumping on trash can.
 */
export type CompactionAnimationPhase =
  | "idle" // No animation
  | "walking_to_trash" // Boss walking to trash can
  | "jumping" // Boss jumping on trash can
  | "walking_back"; // Boss returning to desk

/**
 * Boss animation state.
 */
export interface BossAnimationState {
  backendState: BossState;
  position: Position;
  bubble: BubbleState;
  inUseBy: "arrival" | "departure" | null;
  currentTask: string | null;
  isTyping: boolean; // True when boss is actively using tools (typing animation)
}

/**
 * Event log entry for display.
 */
export type EventLogEntry = Omit<
  NonNullable<WebSocketMessage["event"]>,
  "timestamp"
> & { timestamp: Date };

/**
 * Replay frame for event replay.
 */
export interface ReplayFrame {
  event: NonNullable<WebSocketMessage["event"]>;
  state: BackendGameState;
}

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface GameStore {
  // ========== Agent State ==========
  agents: Map<string, AgentAnimationState>;

  // Agent actions
  addAgent: (backendAgent: BackendAgent, initialPosition: Position) => void;
  removeAgent: (agentId: string) => void;
  updateAgentPhase: (agentId: string, phase: AgentPhase) => void;
  updateAgentPosition: (agentId: string, position: Position) => void;
  updateAgentTarget: (agentId: string, target: Position) => void;
  updateAgentPath: (agentId: string, path: PathState | null) => void;
  updateAgentBackendState: (agentId: string, state: BackendAgentState) => void;
  updateAgentQueueInfo: (
    agentId: string,
    queueType: "arrival" | "departure" | null,
    queueIndex: number,
  ) => void;
  setAgentTyping: (agentId: string, typing: boolean) => void;

  // ========== Queue State ==========
  arrivalQueue: string[]; // Agent IDs in order
  departureQueue: string[]; // Agent IDs in order

  // Queue actions
  enqueueArrival: (agentId: string) => void;
  enqueueDeparture: (agentId: string) => void;
  dequeueArrival: () => string | undefined;
  dequeueDeparture: () => string | undefined;
  advanceQueue: (queueType: "arrival" | "departure") => void;
  syncQueues: (arrivalQueue: string[], departureQueue: string[]) => void;

  // ========== Boss State ==========
  boss: BossAnimationState;

  // Boss actions
  updateBossBackendState: (state: BossState) => void;
  updateBossTask: (task: string | null) => void;
  setBossInUse: (by: "arrival" | "departure" | null) => void;
  setBossTyping: (typing: boolean) => void;

  // ========== Bubble Actions (unified for boss and agents) ==========
  enqueueBubble: (
    entityId: string,
    content: BubbleContent,
    options?: { immediate?: boolean },
  ) => void;
  advanceBubble: (entityId: string) => void;
  clearBubbles: (entityId: string) => void;
  getCurrentBubble: (entityId: string) => BubbleContent | null;
  isBubbleQueueEmpty: (entityId: string) => boolean;
  hasBubbleText: (entityId: string, text: string) => boolean;

  // ========== Office State ==========
  sessionId: string;
  deskCount: number;
  elevatorState: ElevatorState;
  phoneState: PhoneState;
  contextUtilization: number; // 0.0 to 1.0 representing context window usage
  toolUsesSinceCompaction: number; // Counter for safety sign - resets on compaction
  isCompacting: boolean; // True when context compaction animation is active
  compactionPhase: CompactionAnimationPhase; // Phase of the compaction animation
  printReport: boolean; // True when user requested a report and session ended
  todos: TodoItem[];
  gitStatus: GitStatus | null;
  eventLog: EventLogEntry[];

  // Office actions
  setSessionId: (id: string) => void;
  setElevatorState: (state: ElevatorState) => void;
  setPhoneState: (state: PhoneState) => void;
  setDeskCount: (count: number) => void;
  setContextUtilization: (utilization: number) => void;
  setToolUsesSinceCompaction: (count: number) => void;
  triggerCompaction: () => void; // Trigger context compaction animation
  setCompactionPhase: (phase: CompactionAnimationPhase) => void; // Set compaction animation phase
  setIsCompacting: (isCompacting: boolean) => void; // Set isCompacting flag
  setTodos: (todos: TodoItem[]) => void;
  setPrintReport: (printReport: boolean) => void;
  setGitStatus: (status: GitStatus | null) => void;
  addEventLog: (event: NonNullable<WebSocketMessage["event"]>) => void;

  // Whiteboard actions
  whiteboardData: WhiteboardData;
  whiteboardMode: WhiteboardMode;
  setWhiteboardData: (data: WhiteboardData) => void;
  cycleWhiteboardMode: () => void;

  // ========== UI State ==========
  isConnected: boolean;
  isReplaying: boolean;
  replaySpeed: number;
  replayEvents: ReplayFrame[];
  currentReplayIndex: number;

  // Debug state
  debugMode: boolean;
  showPaths: boolean;
  showQueueSlots: boolean;
  showPhaseLabels: boolean;
  showObstacles: boolean;

  // UI actions
  setConnected: (connected: boolean) => void;
  setReplaying: (replaying: boolean) => void;
  setReplaySpeed: (speed: number) => void;
  setReplayEvents: (events: ReplayFrame[]) => void;
  setReplayIndex: (index: number) => void;
  setDebugMode: (enabled: boolean) => void;
  toggleDebugOverlay: (
    overlay: "paths" | "queueSlots" | "phaseLabels" | "obstacles",
  ) => void;
  loadPersistedDebugSettings: () => void;

  // ========== Top-level Actions ==========
  reset: () => void;
  resetForReplay: () => void;
  resetForSessionSwitch: () => void;
  processBackendState: (state: BackendGameState) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BOSS_POSITION: Position = { x: 640, y: 900 }; // Desk center at y=960 (30*32)
const MAX_EVENT_LOG = 500;
const DEBUG_SETTINGS_KEY = "claude-office-debug-settings";
const WHITEBOARD_MODE_COUNT = 10; // 0-9 modes

// Initial whiteboard data
const initialWhiteboardData: WhiteboardData = {
  toolUsage: {},
  taskCompletedCount: 0,
  bugFixedCount: 0,
  coffeeBreakCount: 0,
  codeWrittenCount: 0,
  recentErrorCount: 0,
  recentSuccessCount: 0,
  activityLevel: 0,
  consecutiveSuccesses: 0,
  lastIncidentTime: null,
  agentLifespans: [],
  newsItems: [],
  coffeeCups: 0,
  fileEdits: {},
};

// Helper to load debug settings from localStorage
interface DebugSettings {
  debugMode: boolean;
  showPaths: boolean;
  showQueueSlots: boolean;
  showPhaseLabels: boolean;
  showObstacles: boolean;
}

function loadDebugSettings(): Partial<DebugSettings> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(DEBUG_SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored) as DebugSettings;
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

function saveDebugSettings(settings: DebugSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEBUG_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const createEmptyBubbleState = (): BubbleState => ({
  content: null,
  displayStartTime: null,
  queue: [],
});

const initialBossState: BossAnimationState = {
  backendState: "idle",
  position: BOSS_POSITION,
  bubble: createEmptyBubbleState(),
  inUseBy: null,
  currentTask: null,
  isTyping: false,
};

const initialState = {
  // Agents
  agents: new Map<string, AgentAnimationState>(),

  // Queues
  arrivalQueue: [] as string[],
  departureQueue: [] as string[],

  // Boss
  boss: initialBossState,

  // Office
  sessionId: "None",
  deskCount: 8,
  elevatorState: "closed" as ElevatorState,
  phoneState: "idle" as PhoneState,
  contextUtilization: 0.0,
  toolUsesSinceCompaction: 0,
  isCompacting: false,
  compactionPhase: "idle" as CompactionAnimationPhase,
  printReport: false,
  todos: [] as TodoItem[],
  gitStatus: null as GitStatus | null,
  eventLog: [] as EventLogEntry[],

  // Whiteboard
  whiteboardData: initialWhiteboardData,
  whiteboardMode: 0 as WhiteboardMode,

  // UI
  isConnected: false,
  isReplaying: false,
  replaySpeed: 1,
  replayEvents: [] as ReplayFrame[],
  currentReplayIndex: -1,

  // Debug - will be overwritten by localStorage values if available
  debugMode: false,
  showPaths: false,
  showQueueSlots: false,
  showPhaseLabels: false,
  showObstacles: false,
};

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ========================================================================
    // AGENT ACTIONS
    // ========================================================================

    addAgent: (backendAgent, initialPosition) =>
      set((state) => {
        const newAgents = new Map(state.agents);
        const animState: AgentAnimationState = {
          id: backendAgent.id,
          name: backendAgent.name ?? null,
          color: backendAgent.color,
          number: backendAgent.number,
          desk: backendAgent.desk ?? null,
          backendState: backendAgent.state,
          currentTask: backendAgent.currentTask ?? null,
          phase: "arriving",
          currentPosition: initialPosition,
          targetPosition: initialPosition,
          path: null,
          bubble: createEmptyBubbleState(),
          queueType: null,
          queueIndex: -1,
          isTyping: false,
        };
        newAgents.set(backendAgent.id, animState);

        // Update desk count if needed
        const newDeskCount = Math.max(
          state.deskCount,
          Math.ceil((newAgents.size + 1) / 4) * 4,
        );

        return { agents: newAgents, deskCount: newDeskCount };
      }),

    removeAgent: (agentId) =>
      set((state) => {
        const newAgents = new Map(state.agents);
        newAgents.delete(agentId);

        // Also remove from queues
        const newArrivalQueue = state.arrivalQueue.filter(
          (id) => id !== agentId,
        );
        const newDepartureQueue = state.departureQueue.filter(
          (id) => id !== agentId,
        );

        return {
          agents: newAgents,
          arrivalQueue: newArrivalQueue,
          departureQueue: newDepartureQueue,
        };
      }),

    updateAgentPhase: (agentId, phase) =>
      set((state) => {
        const agent = state.agents.get(agentId);
        if (!agent) return state;

        const newAgents = new Map(state.agents);
        newAgents.set(agentId, { ...agent, phase });
        return { agents: newAgents };
      }),

    updateAgentPosition: (agentId, position) =>
      set((state) => {
        const agent = state.agents.get(agentId);
        if (!agent) return state;

        const newAgents = new Map(state.agents);
        newAgents.set(agentId, { ...agent, currentPosition: position });
        return { agents: newAgents };
      }),

    updateAgentTarget: (agentId, target) =>
      set((state) => {
        const agent = state.agents.get(agentId);
        if (!agent) return state;

        const newAgents = new Map(state.agents);
        newAgents.set(agentId, { ...agent, targetPosition: target });
        return { agents: newAgents };
      }),

    updateAgentPath: (agentId, path) =>
      set((state) => {
        const agent = state.agents.get(agentId);
        if (!agent) return state;

        const newAgents = new Map(state.agents);
        newAgents.set(agentId, { ...agent, path });
        return { agents: newAgents };
      }),

    updateAgentBackendState: (agentId, backendState) =>
      set((state) => {
        const agent = state.agents.get(agentId);
        if (!agent) return state;

        const newAgents = new Map(state.agents);
        newAgents.set(agentId, { ...agent, backendState });
        return { agents: newAgents };
      }),

    updateAgentQueueInfo: (agentId, queueType, queueIndex) =>
      set((state) => {
        const agent = state.agents.get(agentId);
        if (!agent) return state;

        const newAgents = new Map(state.agents);
        newAgents.set(agentId, { ...agent, queueType, queueIndex });
        return { agents: newAgents };
      }),

    setAgentTyping: (agentId, isTyping) =>
      set((state) => {
        const agent = state.agents.get(agentId);
        if (!agent) return state;

        const newAgents = new Map(state.agents);
        newAgents.set(agentId, { ...agent, isTyping });
        return { agents: newAgents };
      }),

    // ========================================================================
    // QUEUE ACTIONS
    // ========================================================================

    enqueueArrival: (agentId) =>
      set((state) => {
        if (state.arrivalQueue.includes(agentId)) return state;

        const newQueue = [...state.arrivalQueue, agentId];
        const queueIndex = newQueue.length - 1;

        // Update agent's queue info
        const agent = state.agents.get(agentId);
        if (agent) {
          const newAgents = new Map(state.agents);
          newAgents.set(agentId, {
            ...agent,
            queueType: "arrival",
            queueIndex,
          });
          return { arrivalQueue: newQueue, agents: newAgents };
        }

        return { arrivalQueue: newQueue };
      }),

    enqueueDeparture: (agentId) =>
      set((state) => {
        if (state.departureQueue.includes(agentId)) return state;

        const newQueue = [...state.departureQueue, agentId];
        const queueIndex = newQueue.length - 1;

        // Update agent's queue info
        const agent = state.agents.get(agentId);
        if (agent) {
          const newAgents = new Map(state.agents);
          newAgents.set(agentId, {
            ...agent,
            queueType: "departure",
            queueIndex,
          });
          return { departureQueue: newQueue, agents: newAgents };
        }

        return { departureQueue: newQueue };
      }),

    dequeueArrival: () => {
      const state = get();
      if (state.arrivalQueue.length === 0) return undefined;

      const [frontId, ...rest] = state.arrivalQueue;
      set({ arrivalQueue: rest });

      // Update remaining agents' queue indices
      const newAgents = new Map(state.agents);
      rest.forEach((id, idx) => {
        const agent = newAgents.get(id);
        if (agent) {
          newAgents.set(id, { ...agent, queueIndex: idx });
        }
      });
      set({ agents: newAgents });

      return frontId;
    },

    dequeueDeparture: () => {
      const state = get();
      if (state.departureQueue.length === 0) return undefined;

      const [frontId, ...rest] = state.departureQueue;
      set({ departureQueue: rest });

      // Update remaining agents' queue indices
      const newAgents = new Map(state.agents);
      rest.forEach((id, idx) => {
        const agent = newAgents.get(id);
        if (agent) {
          newAgents.set(id, { ...agent, queueIndex: idx });
        }
      });
      set({ agents: newAgents });

      return frontId;
    },

    advanceQueue: (queueType) =>
      set((state) => {
        const queue =
          queueType === "arrival" ? state.arrivalQueue : state.departureQueue;
        if (queue.length === 0) return state;

        // Update all agents' queue indices
        const newAgents = new Map(state.agents);
        queue.forEach((id, idx) => {
          const agent = newAgents.get(id);
          if (agent) {
            newAgents.set(id, { ...agent, queueIndex: idx });
          }
        });

        return { agents: newAgents };
      }),

    syncQueues: (arrivalQueue, departureQueue) =>
      set((state) => {
        // Update agents' queue info based on synced queues
        const newAgents = new Map(state.agents);

        arrivalQueue.forEach((id, idx) => {
          const agent = newAgents.get(id);
          if (agent) {
            newAgents.set(id, {
              ...agent,
              queueType: "arrival",
              queueIndex: idx,
            });
          }
        });

        departureQueue.forEach((id, idx) => {
          const agent = newAgents.get(id);
          if (agent) {
            newAgents.set(id, {
              ...agent,
              queueType: "departure",
              queueIndex: idx,
            });
          }
        });

        return {
          arrivalQueue,
          departureQueue,
          agents: newAgents,
        };
      }),

    // ========================================================================
    // BOSS ACTIONS
    // ========================================================================

    updateBossBackendState: (backendState) =>
      set((state) => ({
        boss: { ...state.boss, backendState },
      })),

    updateBossTask: (task) =>
      set((state) => ({
        boss: { ...state.boss, currentTask: task },
      })),

    setBossInUse: (by) =>
      set((state) => ({
        boss: { ...state.boss, inUseBy: by },
      })),

    setBossTyping: (typing) =>
      set((state) => ({
        boss: { ...state.boss, isTyping: typing },
      })),

    // ========================================================================
    // BUBBLE ACTIONS
    // ========================================================================

    enqueueBubble: (entityId, content, options) =>
      set((state) => {
        const now = Date.now();

        if (entityId === "boss") {
          const bossBubble = state.boss.bubble;
          // Queue bubbles instead of displaying immediately in these cases:
          // 1. During compaction (boss is jumping on trash) - unless immediate flag
          // 2. There's already a bubble displaying
          // The immediate flag is used for conversation bubbles that need to
          // proceed normally to avoid blocking the agent state machine.
          const isCompacting = state.compactionPhase !== "idle";
          const shouldQueueForCompaction = isCompacting && !options?.immediate;
          const shouldQueue = shouldQueueForCompaction || bossBubble.content;

          console.log(
            `[Store] enqueueBubble boss: isCompacting=${isCompacting}, hasContent=${!!bossBubble.content}, shouldQueue=${shouldQueue}, queueLen=${bossBubble.queue.length}, text="${content.text?.slice(0, 30)}..."`,
          );

          if (!shouldQueue) {
            // No current bubble and not compacting, display immediately
            // IMPORTANT: Preserve any existing queued bubbles (e.g., from compaction)
            console.log(`[Store] Boss bubble DISPLAYED immediately`);
            return {
              boss: {
                ...state.boss,
                bubble: {
                  content,
                  displayStartTime: now,
                  queue: bossBubble.queue,
                },
              },
            };
          }
          // Queue it (compacting or already has a bubble displaying)
          console.log(
            `[Store] Boss bubble QUEUED (new queueLen=${bossBubble.queue.length + 1})`,
          );
          return {
            boss: {
              ...state.boss,
              bubble: {
                ...bossBubble,
                queue: [...bossBubble.queue, content],
              },
            },
          };
        }

        // Agent bubble
        const agent = state.agents.get(entityId);
        if (!agent) return state;

        const agentBubble = agent.bubble;
        const newAgents = new Map(state.agents);

        if (!agentBubble.content) {
          // IMPORTANT: Preserve any existing queued bubbles
          newAgents.set(entityId, {
            ...agent,
            bubble: {
              content,
              displayStartTime: now,
              queue: agentBubble.queue,
            },
          });
        } else {
          newAgents.set(entityId, {
            ...agent,
            bubble: {
              ...agentBubble,
              queue: [...agentBubble.queue, content],
            },
          });
        }

        return { agents: newAgents };
      }),

    advanceBubble: (entityId) =>
      set((state) => {
        const now = Date.now();

        if (entityId === "boss") {
          const bossBubble = state.boss.bubble;
          if (bossBubble.queue.length > 0) {
            const [next, ...rest] = bossBubble.queue;
            return {
              boss: {
                ...state.boss,
                bubble: {
                  content: next,
                  displayStartTime: now,
                  queue: rest,
                },
              },
            };
          }
          // Clear bubble
          return {
            boss: {
              ...state.boss,
              bubble: createEmptyBubbleState(),
            },
          };
        }

        // Agent bubble
        const agent = state.agents.get(entityId);
        if (!agent) return state;

        const agentBubble = agent.bubble;
        const newAgents = new Map(state.agents);

        if (agentBubble.queue.length > 0) {
          const [next, ...rest] = agentBubble.queue;
          newAgents.set(entityId, {
            ...agent,
            bubble: {
              content: next,
              displayStartTime: now,
              queue: rest,
            },
          });
        } else {
          newAgents.set(entityId, {
            ...agent,
            bubble: createEmptyBubbleState(),
          });
        }

        return { agents: newAgents };
      }),

    clearBubbles: (entityId) =>
      set((state) => {
        if (entityId === "boss") {
          return {
            boss: {
              ...state.boss,
              bubble: createEmptyBubbleState(),
            },
          };
        }

        const agent = state.agents.get(entityId);
        if (!agent) return state;

        const newAgents = new Map(state.agents);
        newAgents.set(entityId, {
          ...agent,
          bubble: createEmptyBubbleState(),
        });

        return { agents: newAgents };
      }),

    getCurrentBubble: (entityId) => {
      const state = get();
      if (entityId === "boss") {
        return state.boss.bubble.content;
      }
      return state.agents.get(entityId)?.bubble.content ?? null;
    },

    isBubbleQueueEmpty: (entityId) => {
      const state = get();
      if (entityId === "boss") {
        const b = state.boss.bubble;
        return !b.content && b.queue.length === 0;
      }
      const agent = state.agents.get(entityId);
      if (!agent) return true;
      return !agent.bubble.content && agent.bubble.queue.length === 0;
    },

    hasBubbleText: (entityId, text) => {
      const state = get();
      const bubble =
        entityId === "boss"
          ? state.boss.bubble
          : state.agents.get(entityId)?.bubble;
      if (!bubble) return false;
      // Check current content
      if (bubble.content?.text === text) return true;
      // Check queue
      return bubble.queue.some((b) => b.text === text);
    },

    // ========================================================================
    // OFFICE ACTIONS
    // ========================================================================

    setSessionId: (id) => set({ sessionId: id }),
    setElevatorState: (elevatorState) => set({ elevatorState }),
    setPhoneState: (phoneState) => set({ phoneState }),
    setDeskCount: (deskCount) => set({ deskCount }),
    setContextUtilization: (contextUtilization) =>
      // Only update context utilization - don't reset compaction state
      // The compaction animation system controls when compaction ends via setCompactionPhase
      set({ contextUtilization }),
    setToolUsesSinceCompaction: (toolUsesSinceCompaction) =>
      set({ toolUsesSinceCompaction }),
    triggerCompaction: () => {
      // Start compaction animation - boss will walk to trash can and jump on it
      set({
        isCompacting: true,
        toolUsesSinceCompaction: 0,
        compactionPhase: "walking_to_trash",
      });
    },
    setCompactionPhase: (compactionPhase) => set({ compactionPhase }),
    setIsCompacting: (isCompacting) => set({ isCompacting }),
    setTodos: (todos) => set({ todos }),
    setPrintReport: (printReport) => set({ printReport }),
    setGitStatus: (gitStatus) => set({ gitStatus }),

    addEventLog: (event) =>
      set((state) => {
        const timestamp = event.timestamp
          ? new Date(event.timestamp)
          : new Date();
        const entry: EventLogEntry = { ...event, timestamp };
        return {
          eventLog: [entry, ...state.eventLog.slice(0, MAX_EVENT_LOG - 1)],
        };
      }),

    // ========================================================================
    // WHITEBOARD ACTIONS
    // ========================================================================

    setWhiteboardData: (whiteboardData) => set({ whiteboardData }),

    cycleWhiteboardMode: () =>
      set((state) => ({
        whiteboardMode: ((state.whiteboardMode + 1) %
          WHITEBOARD_MODE_COUNT) as WhiteboardMode,
      })),

    // ========================================================================
    // UI ACTIONS
    // ========================================================================

    setConnected: (isConnected) => set({ isConnected }),
    setReplaying: (isReplaying) => set({ isReplaying }),
    setReplaySpeed: (replaySpeed) => set({ replaySpeed }),
    setReplayEvents: (replayEvents) => set({ replayEvents }),
    setReplayIndex: (currentReplayIndex) => set({ currentReplayIndex }),

    setDebugMode: (debugMode) => {
      set({ debugMode });
      const state = get();
      saveDebugSettings({
        debugMode,
        showPaths: state.showPaths,
        showQueueSlots: state.showQueueSlots,
        showPhaseLabels: state.showPhaseLabels,
        showObstacles: state.showObstacles,
      });
    },
    toggleDebugOverlay: (overlay) => {
      set((state) => {
        let newState: Partial<DebugSettings>;
        switch (overlay) {
          case "paths":
            newState = { showPaths: !state.showPaths };
            break;
          case "queueSlots":
            newState = { showQueueSlots: !state.showQueueSlots };
            break;
          case "phaseLabels":
            newState = { showPhaseLabels: !state.showPhaseLabels };
            break;
          case "obstacles":
            newState = { showObstacles: !state.showObstacles };
            break;
          default:
            return state;
        }
        // Save to localStorage after state update
        const currentState = { ...state, ...newState };
        saveDebugSettings({
          debugMode: currentState.debugMode,
          showPaths: currentState.showPaths,
          showQueueSlots: currentState.showQueueSlots,
          showPhaseLabels: currentState.showPhaseLabels,
          showObstacles: currentState.showObstacles,
        });
        return newState;
      });
    },

    loadPersistedDebugSettings: () => {
      const persisted = loadDebugSettings();
      if (Object.keys(persisted).length > 0) {
        set({
          debugMode: persisted.debugMode ?? false,
          showPaths: persisted.showPaths ?? false,
          showQueueSlots: persisted.showQueueSlots ?? false,
          showPhaseLabels: persisted.showPhaseLabels ?? false,
          showObstacles: persisted.showObstacles ?? false,
        });
      }
    },

    // ========================================================================
    // TOP-LEVEL ACTIONS
    // ========================================================================

    reset: () =>
      set({
        ...initialState,
        agents: new Map(),
        boss: { ...initialBossState, bubble: createEmptyBubbleState() },
        whiteboardData: { ...initialWhiteboardData },
        whiteboardMode: 0,
      }),

    resetForReplay: () =>
      set({
        ...initialState,
        agents: new Map(),
        boss: { ...initialBossState, bubble: createEmptyBubbleState() },
        whiteboardData: { ...initialWhiteboardData },
        whiteboardMode: 0,
        isReplaying: true,
      }),

    resetForSessionSwitch: () =>
      set({
        // Reset all agent/game state but preserve UI settings
        agents: new Map(),
        arrivalQueue: [],
        departureQueue: [],
        boss: { ...initialBossState, bubble: createEmptyBubbleState() },
        sessionId: "None",
        deskCount: 8,
        elevatorState: "closed",
        phoneState: "idle",
        contextUtilization: 0.0,
        toolUsesSinceCompaction: 0,
        isCompacting: false,
        compactionPhase: "idle",
        todos: [],
        gitStatus: null,
        eventLog: [], // Clear event log for new session
        whiteboardData: { ...initialWhiteboardData },
        // Keep whiteboardMode - user preference
        // Keep connection-related state
        isConnected: false,
        isReplaying: false, // Important: allow WebSocket to reconnect
        replayEvents: [],
        currentReplayIndex: -1,
        // Debug settings are preserved (not reset)
      }),

    processBackendState: (backendState) =>
      set((state) => {
        // This is called when we receive a full state update from backend.
        // It reconciles the backend agent list with our frontend state.

        const currentAgentIds = new Set(state.agents.keys());
        const backendAgentIds = new Set(backendState.agents.map((a) => a.id));

        const newAgents = new Map(state.agents);
        const newArrivalQueue = [...state.arrivalQueue];
        const newDepartureQueue = [...state.departureQueue];

        // Handle new agents (arrivals)
        for (const backendAgent of backendState.agents) {
          if (!currentAgentIds.has(backendAgent.id)) {
            // New agent - will be added via state machine event, not here
          } else {
            // Existing agent - update backend state
            const existing = newAgents.get(backendAgent.id);
            if (existing) {
              newAgents.set(backendAgent.id, {
                ...existing,
                backendState: backendAgent.state,
                currentTask: backendAgent.currentTask ?? null,
                desk: backendAgent.desk ?? null,
                name: backendAgent.name ?? null,
              });
            }
          }
        }

        // Handle removed agents (departures)
        for (const agentId of currentAgentIds) {
          if (!backendAgentIds.has(agentId)) {
            // Will be handled by state machine event when agent is idle
          }
        }

        // Update boss
        const newBoss: BossAnimationState = {
          ...state.boss,
          backendState: backendState.boss.state,
          currentTask: backendState.boss.currentTask ?? null,
        };

        // Process bubbles from backend state
        // (These are enqueued separately via state machine events)

        // Update whiteboard data if provided
        const whiteboardData = backendState.whiteboardData
          ? {
              toolUsage: backendState.whiteboardData.toolUsage ?? {},
              taskCompletedCount:
                backendState.whiteboardData.taskCompletedCount ?? 0,
              bugFixedCount: backendState.whiteboardData.bugFixedCount ?? 0,
              coffeeBreakCount:
                backendState.whiteboardData.coffeeBreakCount ?? 0,
              codeWrittenCount:
                backendState.whiteboardData.codeWrittenCount ?? 0,
              recentErrorCount:
                backendState.whiteboardData.recentErrorCount ?? 0,
              recentSuccessCount:
                backendState.whiteboardData.recentSuccessCount ?? 0,
              activityLevel: backendState.whiteboardData.activityLevel ?? 0,
              consecutiveSuccesses:
                backendState.whiteboardData.consecutiveSuccesses ?? 0,
              lastIncidentTime:
                backendState.whiteboardData.lastIncidentTime ?? null,
              agentLifespans: backendState.whiteboardData.agentLifespans ?? [],
              newsItems: backendState.whiteboardData.newsItems ?? [],
              coffeeCups: backendState.whiteboardData.coffeeCups ?? 0,
              fileEdits: backendState.whiteboardData.fileEdits ?? {},
            }
          : state.whiteboardData;

        return {
          agents: newAgents,
          arrivalQueue: newArrivalQueue,
          departureQueue: newDepartureQueue,
          boss: newBoss,
          sessionId: backendState.sessionId,
          deskCount: backendState.office.deskCount,
          // NOTE: elevatorState is NOT synced from backend - it's controlled by
          // the frontend's agent state machine for smooth animations
          phoneState: backendState.office.phoneState,
          contextUtilization: backendState.office.contextUtilization ?? 0.0,
          toolUsesSinceCompaction:
            backendState.office.toolUsesSinceCompaction ?? 0,
          printReport: backendState.office.printReport ?? false,
          todos: backendState.todos,
          whiteboardData,
        };
      }),
  })),
);

// ============================================================================
// SELECTORS (for efficient subscriptions)
// ============================================================================

export const selectAgents = (state: GameStore) => state.agents;
export const selectBoss = (state: GameStore) => state.boss;
export const selectArrivalQueue = (state: GameStore) => state.arrivalQueue;
export const selectDepartureQueue = (state: GameStore) => state.departureQueue;
export const selectIsConnected = (state: GameStore) => state.isConnected;
export const selectIsReplaying = (state: GameStore) => state.isReplaying;
export const selectDebugMode = (state: GameStore) => state.debugMode;
export const selectSessionId = (state: GameStore) => state.sessionId;
export const selectShowPaths = (state: GameStore) => state.showPaths;
export const selectShowQueueSlots = (state: GameStore) => state.showQueueSlots;
export const selectShowPhaseLabels = (state: GameStore) =>
  state.showPhaseLabels;
export const selectShowObstacles = (state: GameStore) => state.showObstacles;
export const selectElevatorState = (state: GameStore) => state.elevatorState;
export const selectContextUtilization = (state: GameStore) =>
  state.contextUtilization;
export const selectIsCompacting = (state: GameStore) => state.isCompacting;
export const selectCompactionPhase = (state: GameStore) =>
  state.compactionPhase;
export const selectTodos = (state: GameStore) => state.todos;
export const selectGitStatus = (state: GameStore) => state.gitStatus;
export const selectEventLog = (state: GameStore) => state.eventLog;
export const selectToolUsesSinceCompaction = (state: GameStore) =>
  state.toolUsesSinceCompaction;
export const selectPrintReport = (state: GameStore) => state.printReport;
export const selectWhiteboardData = (state: GameStore) => state.whiteboardData;
export const selectWhiteboardMode = (state: GameStore) => state.whiteboardMode;
