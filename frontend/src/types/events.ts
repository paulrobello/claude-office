/**
 * Event-related type definitions.
 *
 * Covers WebSocket message types, event payloads, and event detail shapes
 * for all Claude Office event traffic.
 */

// ============================================================================
// EVENT TYPES
// ============================================================================

export type EventType =
  | "session_start"
  | "session_end"
  | "pre_tool_use"
  | "post_tool_use"
  | "user_prompt_submit"
  | "permission_request"
  | "notification"
  | "stop"
  | "subagent_start"
  | "subagent_stop"
  | "context_compaction"
  | "error"
  | "background_task_notification";

// ============================================================================
// EVENT DETAIL
// ============================================================================

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

// ============================================================================
// WEBSOCKET MESSAGE
// ============================================================================

import type { GameState } from "./agents";
import type { GitStatus } from "./office";

export interface WebSocketMessage {
  type: "state_update" | "event" | "reload" | "git_status" | "session_deleted";
  timestamp: string;
  state?: GameState;
  event?: {
    id: string;
    type: EventType;
    agentId: string;
    summary: string;
    timestamp: string;
    detail?: EventDetail;
  };
  gitStatus?: GitStatus;
  session_id?: string;
}
