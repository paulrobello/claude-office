/**
 * Types barrel — re-exports all domain type files for backward compatibility.
 *
 * Consumers can continue to import from "@/types" without changes.
 * New code should prefer importing from the specific domain file:
 *   - "@/types/agents"    — Agent, Boss, BubbleContent, Position, GameState, ...
 *   - "@/types/events"    — EventType, WebSocketMessage, EventDetail
 *   - "@/types/office"    — OfficeState, ElevatorState, PhoneState, GitStatus, ...
 *   - "@/types/whiteboard" — WhiteboardData, AgentLifespan, NewsItem, ...
 */

export type {
  BubbleType,
  BubbleContent,
  Position,
  AgentState,
  Agent,
  BossState,
  Boss,
  ConversationEntry,
  TodoStatus,
  TodoItem,
  GameState,
} from "./agents";

export type { EventType, EventDetail, WebSocketMessage } from "./events";

export type {
  ElevatorState,
  PhoneState,
  OfficeState,
  FileStatus,
  ChangedFile,
  GitCommit,
  GitStatus,
} from "./office";

export type {
  WhiteboardMode,
  BackgroundTask,
  AgentLifespan,
  NewsItem,
  WhiteboardData,
} from "./whiteboard";
