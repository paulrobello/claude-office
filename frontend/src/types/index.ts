/**
 * Types barrel — re-exports backend-derived types from generated.ts and
 * defines purely-frontend types inline.
 *
 * Consumers can continue to import from "@/types" without changes.
 *
 * DO NOT hand-edit types that originate from backend Pydantic models.
 * Run `make gen-types` to regenerate generated.ts from the backend models.
 */

// ============================================================================
// GENERATED TYPES — re-exported from ./generated (do not edit)
// ============================================================================

export type {
  // Agents
  Agent,
  AgentState,
  Boss,
  BossState,
  // Common
  BubbleContent,
  BubbleType,
  SpeechContent,
  TodoStatus,
  TodoItem,
  // Office state
  OfficeState,
  ElevatorState,
  PhoneState,
  // Sessions / whiteboard
  AgentLifespan,
  BackgroundTask,
  FileEdit,
  NewsItem,
  WhiteboardData,
  GameState,
  Session,
  ConversationEntry,
  HistoryEntry,
  // Git
  FileStatus,
  ChangedFile,
  GitStatus,
  // Events (backend models)
  EventType,
  EventData,
  Event,
} from "./generated";

// Re-export Commit with the legacy GitCommit alias for backward compatibility
export type { Commit, Commit as GitCommit } from "./generated";

// ============================================================================
// FRONTEND-ONLY TYPES — not derived from backend models
// ============================================================================

/**
 * 2D position with typed x/y coordinates.
 * The backend uses dict[str, int] (no named model), so this stays frontend-only.
 * The index signature makes this compatible with the generated Position type
 * (which is { [k: string]: number } from dict[str, int]).
 */
export interface Position {
  x: number;
  y: number;
  [k: string]: number;
}

/**
 * Whiteboard display mode index (0–10).
 * Pure frontend concept — the backend has no equivalent.
 */
export type WhiteboardMode =
  | 0 // Todo List — hotkey T
  | 1 // Remote Workers (background tasks) — hotkey B
  | 2 // Tool Pizza
  | 3 // Org Chart
  | 4 // Stonks
  | 5 // Weather
  | 6 // Safety Board
  | 7 // Timeline
  | 8 // News Ticker
  | 9 // Coffee
  | 10; // Heat Map

/**
 * Shape of the optional event detail payload carried in WebSocket events.
 * Derived from the frontend event-log rendering requirements.
 */
export interface EventDetail {
  toolName?: string;
  toolInput?: Record<string, unknown>;
  resultSummary?: string;
  message?: string;
  thinking?: string;
  errorType?: string;
  taskDescription?: string;
  agentName?: string;
  prompt?: string;
}

/**
 * WebSocket message types sent from the backend over the /ws endpoint.
 */
export interface WebSocketMessage {
  type: "state_update" | "event" | "reload" | "git_status" | "session_deleted";
  timestamp: string;
  state?: import("./generated").GameState;
  event?: {
    id: string;
    type: import("./generated").EventType;
    agentId: string;
    summary: string;
    timestamp: string;
    detail?: EventDetail;
  };
  gitStatus?: import("./generated").GitStatus;
  session_id?: string;
}
