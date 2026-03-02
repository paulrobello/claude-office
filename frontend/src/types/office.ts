/**
 * Office infrastructure type definitions.
 *
 * Covers elevator state, phone state, context utilization, git status,
 * and the top-level OfficeState shape.
 */

// ============================================================================
// OFFICE STATE ENUMS
// ============================================================================

export type ElevatorState = "closed" | "arriving" | "open" | "departing";
export type PhoneState = "idle" | "ringing" | "in_use";

// ============================================================================
// OFFICE STATE
// ============================================================================

export interface OfficeState {
  deskCount: number;
  elevatorState: ElevatorState;
  phoneState: PhoneState;
  contextUtilization: number; // 0.0 to 1.0 representing context window usage
  toolUsesSinceCompaction: number; // Counter for safety sign - resets on compaction
  printReport: boolean; // True when user requested a report and session ended
}

// ============================================================================
// GIT STATUS
// ============================================================================

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
