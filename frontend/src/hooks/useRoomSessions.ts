/**
 * Room session filtering hook.
 *
 * Returns sessions assigned to a specific room, derived from a provided
 * sessions array. Memoized to avoid unnecessary re-renders.
 */

"use client";

import { useMemo } from "react";
import type { Session } from "./useSessions";

/**
 * Get all sessions assigned to a specific room.
 *
 * @param sessions - Full sessions array (typically from useSessions).
 * @param roomId - The room identifier to filter by. Pass `undefined`
 *   to return an empty array (no room selected).
 * @returns Sessions whose `roomId` matches.
 */
export function useRoomSessions(
  sessions: Session[],
  roomId: string | undefined,
): Session[] {
  return useMemo(
    () => (roomId ? sessions.filter((s) => s.roomId === roomId) : []),
    [sessions, roomId],
  );
}
