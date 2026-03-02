/**
 * Whiteboard display mode type definitions.
 *
 * Covers all 11 whiteboard display modes, their data shapes,
 * and supporting types for timeline, news, background tasks, etc.
 */

// ============================================================================
// WHITEBOARD MODE
// ============================================================================

/** Whiteboard display mode index. */
export type WhiteboardMode =
  | 0 // Todo List (existing) - hotkey: T
  | 1 // Remote Workers (background tasks) - hotkey: B
  | 2 // Tool Pizza
  | 3 // Org Chart
  | 4 // Stonks
  | 5 // Weather
  | 6 // Safety Board
  | 7 // Timeline
  | 8 // News Ticker
  | 9 // Coffee
  | 10; // Heat Map

// ============================================================================
// MODE-SPECIFIC DATA TYPES
// ============================================================================

/** Background task tracking (Mode 1: Remote Workers). */
export interface BackgroundTask {
  taskId: string;
  status: "completed" | "failed" | "running";
  summary?: string;
  startedAt?: string;
  completedAt?: string;
}

/** Timeline entry for agent lifespan tracking (Mode 7: Agent Timeline). */
export interface AgentLifespan {
  agentId: string;
  agentName: string;
  color: string;
  startTime: string;
  endTime: string | null; // null = still active
}

/** News ticker item (Mode 8: News Ticker). */
export interface NewsItem {
  category: "tool" | "agent" | "session" | "error" | "coffee";
  headline: string;
  timestamp: string;
}

// ============================================================================
// WHITEBOARD DATA
// ============================================================================

/** Aggregated data for all whiteboard display modes. */
export interface WhiteboardData {
  // Mode 1: Remote Workers (background tasks)
  backgroundTasks: BackgroundTask[];

  // Mode 2: Tool Usage Pizza Chart
  toolUsage: Record<string, number>;

  // Mode 4: Productivity Stonks
  taskCompletedCount: number;
  bugFixedCount: number;
  coffeeBreakCount: number;
  codeWrittenCount: number;

  // Mode 5: Weather
  recentErrorCount: number;
  recentSuccessCount: number;
  activityLevel: number; // 0.0 to 1.0

  // Mode 6: Safety Board
  consecutiveSuccesses: number;
  lastIncidentTime: string | null;

  // Mode 7: Agent Timeline
  agentLifespans: AgentLifespan[];

  // Mode 8: News Ticker
  newsItems: NewsItem[];

  // Mode 9: Coffee
  coffeeCups: number;

  // Mode 10: File Heat Map
  fileEdits: Record<string, number>;
}
