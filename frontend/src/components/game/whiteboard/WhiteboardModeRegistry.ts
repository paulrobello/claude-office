/**
 * WhiteboardModeRegistry - Mode metadata and helper functions for the whiteboard.
 *
 * Centralizes mode names, icons, and cycling logic so that Whiteboard.tsx
 * and individual mode components do not need to duplicate this information.
 */

import type { WhiteboardMode } from "@/types";

// ============================================================================
// MODE METADATA
// ============================================================================

export interface ModeInfo {
  name: string;
  icon: string;
}

export const MODE_INFO: Record<WhiteboardMode, ModeInfo> = {
  0: { name: "TODO", icon: "📋" },
  1: { name: "REMOTE", icon: "📹" },
  2: { name: "TOOL USE", icon: "🍕" },
  3: { name: "ORG", icon: "📊" },
  4: { name: "STONKS", icon: "📈" },
  5: { name: "WEATHER", icon: "🌤️" },
  6: { name: "SAFETY", icon: "⚠️" },
  7: { name: "TIMELINE", icon: "📅" },
  8: { name: "NEWS", icon: "📰" },
  9: { name: "COFFEE", icon: "☕" },
  10: { name: "HEATMAP", icon: "🔥" },
  11: { name: "KANBAN", icon: "📌" },
};

export const WHITEBOARD_MODE_COUNT = 12;

/**
 * Returns the next mode index, wrapping around after mode 10.
 */
export function getNextMode(current: WhiteboardMode): WhiteboardMode {
  return ((current + 1) % WHITEBOARD_MODE_COUNT) as WhiteboardMode;
}

/**
 * Returns display info for a given mode.
 */
export function getModeInfo(mode: WhiteboardMode): ModeInfo {
  return MODE_INFO[mode];
}
