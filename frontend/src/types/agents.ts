/**
 * Agent and Boss type definitions.
 *
 * Covers agent state machines, boss state machines, bubble content,
 * positions, and the top-level GameState shape.
 */

import type { OfficeState } from "./office";
import type { WhiteboardData } from "./whiteboard";

// ============================================================================
// SHARED PRIMITIVES
// ============================================================================

export type BubbleType = "thought" | "speech";

export interface BubbleContent {
  type: BubbleType;
  text: string;
  icon?: string;
  persistent?: boolean; // If true, bubble stays until explicitly replaced
}

export interface Position {
  x: number;
  y: number;
}

// ============================================================================
// AGENT
// ============================================================================

export type AgentState =
  | "arriving"
  | "reporting"
  | "walking_to_desk"
  | "working"
  | "thinking"
  | "waiting_permission"
  | "completed"
  | "waiting"
  | "reporting_done"
  | "leaving"
  | "in_elevator";

export interface Agent {
  id: string;
  name?: string;
  color: string;
  number: number;
  state: AgentState;
  desk?: number;
  bubble?: BubbleContent;
  currentTask?: string;
  position: Position;
}

// ============================================================================
// BOSS
// ============================================================================

export type BossState =
  | "idle"
  | "phone_ringing"
  | "on_phone"
  | "receiving"
  | "working"
  | "delegating"
  | "waiting_permission"
  | "reviewing"
  | "completing";

export interface Boss {
  state: BossState;
  currentTask?: string;
  bubble?: BubbleContent;
  position: Position;
}

// ============================================================================
// CONVERSATION
// ============================================================================

export interface ConversationEntry {
  id: string;
  role: "user" | "assistant" | "thinking" | "tool";
  agentId: string;
  text: string;
  timestamp: string;
  toolName?: string;
}

// ============================================================================
// GAME STATE
// ============================================================================

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  content: string;
  status: TodoStatus;
  activeForm?: string;
}

export interface GameState {
  sessionId: string;
  boss: Boss;
  agents: Agent[];
  office: OfficeState;
  lastUpdated: Date;
  todos: TodoItem[];
  arrivalQueue?: string[]; // Agent IDs in arrival queue (getting work from boss)
  departureQueue?: string[]; // Agent IDs in departure queue (turning in work to boss)
  whiteboardData?: WhiteboardData; // Data for whiteboard display modes
  conversation?: ConversationEntry[]; // Conversation history (user prompts + Claude responses)
}
