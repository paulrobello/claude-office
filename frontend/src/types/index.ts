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
  | "error";

export type BubbleType = "thought" | "speech";

export interface BubbleContent {
  type: BubbleType;
  text: string;
  icon?: string;
  persistent?: boolean; // If true, bubble stays until explicitly replaced
}

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

export interface Position {
  x: number;
  y: number;
}

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

export interface Boss {
  state: BossState;
  currentTask?: string;
  bubble?: BubbleContent;
  position: Position;
}

export type ElevatorState = "closed" | "arriving" | "open" | "departing";
export type PhoneState = "idle" | "ringing" | "in_use";
export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  content: string;
  status: TodoStatus;
  activeForm?: string;
}

export interface OfficeState {
  deskCount: number;
  elevatorState: ElevatorState;
  phoneState: PhoneState;
  contextUtilization: number; // 0.0 to 1.0 representing context window usage
  toolUsesSinceCompaction: number; // Counter for safety sign - resets on compaction
  printReport: boolean; // True when user requested a report and session ended
}

// ============================================================================
// WHITEBOARD DATA TYPES
// ============================================================================

/** Timeline entry for agent lifespan tracking (Mode 6) */
export interface AgentLifespan {
  agentId: string;
  agentName: string;
  color: string;
  startTime: string;
  endTime: string | null; // null = still active
}

/** News ticker item (Mode 7) */
export interface NewsItem {
  category: "tool" | "agent" | "session" | "error" | "coffee";
  headline: string;
  timestamp: string;
}

/** Whiteboard display mode */
export type WhiteboardMode =
  | 0 // Todo List (existing)
  | 1 // Tool Pizza
  | 2 // Org Chart
  | 3 // Stonks
  | 4 // Weather
  | 5 // Safety Board
  | 6 // Timeline
  | 7 // News Ticker
  | 8 // Coffee
  | 9; // Heat Map

/** Data for whiteboard display modes */
export interface WhiteboardData {
  // Mode 1: Tool Usage Pizza Chart
  toolUsage: Record<string, number>;

  // Mode 3: Productivity Stonks
  taskCompletedCount: number;
  bugFixedCount: number;
  coffeeBreakCount: number;
  codeWrittenCount: number;

  // Mode 4: Weather
  recentErrorCount: number;
  recentSuccessCount: number;
  activityLevel: number; // 0.0 to 1.0

  // Mode 5: Safety Board
  consecutiveSuccesses: number;
  lastIncidentTime: string | null;

  // Mode 6: Agent Timeline
  agentLifespans: AgentLifespan[];

  // Mode 7: News Ticker
  newsItems: NewsItem[];

  // Mode 8: Coffee
  coffeeCups: number;

  // Mode 9: File Heat Map
  fileEdits: Record<string, number>;
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
}

export type FileStatus = "M" | "A" | "D" | "R" | "C" | "?" | "!";

export interface ChangedFile {
  path: string;
  status: FileStatus;
  staged: boolean;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
  relative_time: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  changed_files: ChangedFile[];
  commits: GitCommit[];
  last_updated: string;
  repo_path: string;
}

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
  };
  gitStatus?: GitStatus;
  session_id?: string;
}
