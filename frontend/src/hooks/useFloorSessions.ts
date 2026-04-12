/**
 * Floor session filtering hook.
 *
 * Returns sessions assigned to a specific floor, derived from a provided
 * sessions array. Memoized to avoid unnecessary re-renders.
 */

"use client";

import { useMemo } from "react";
import type { Session } from "./useSessions";

/**
 * Get all sessions assigned to a specific floor.
 *
 * @param sessions - Full sessions array (typically from useSessions).
 * @param floorId - The floor identifier to filter by. Pass `undefined`
 *   to return an empty array (no floor selected).
 * @returns Sessions whose `floorId` matches.
 */
export function useFloorSessions(
  sessions: Session[],
  floorId: string | undefined,
): Session[] {
  return useMemo(
    () => (floorId ? sessions.filter((s) => s.floorId === floorId) : []),
    [sessions, floorId],
  );
}
