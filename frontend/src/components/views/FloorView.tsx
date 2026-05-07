"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import { LOBBY_FLOOR_ID } from "@/types/navigation";
import { SessionSidebar } from "@/components/layout/SessionSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import type { Session } from "@/hooks/useSessions";

// ============================================================================
// DYNAMIC IMPORT
// ============================================================================

function FloorLoadingFallback(): React.ReactNode {
  return (
    <div className="w-full h-full bg-slate-900 animate-pulse flex items-center justify-center text-white font-mono text-center">
      Initializing Floor...
    </div>
  );
}

const OfficeGame = dynamic(
  () =>
    import("@/components/game/OfficeGame").then((m) => ({
      default: m.OfficeGame,
    })),
  {
    ssr: false,
    loading: () => <FloorLoadingFallback />,
  },
);

// ============================================================================
// FLOOR VIEW
// ============================================================================

export interface FloorViewProps {
  sessions: Session[];
  sessionsLoading: boolean;
  sessionId: string;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onSessionSelect: (id: string) => Promise<void>;
  onDeleteSession: (session: Session) => void;
  onRenameSession: (sessionId: string, newName: string) => Promise<void>;
}

export function FloorView({
  sessions,
  sessionsLoading,
  sessionId,
  isCollapsed,
  onToggleCollapsed,
  onSessionSelect,
  onDeleteSession,
  onRenameSession,
}: FloorViewProps): React.ReactNode {
  const floorId = useNavigationStore((s) => s.floorId);
  const buildingConfig = useNavigationStore((s) => s.buildingConfig);
  const isLobby = floorId === LOBBY_FLOOR_ID;
  const floor = isLobby
    ? null
    : buildingConfig?.floors.find((f) => f.id === floorId);

  // Helper: check if a session belongs to any configured floor
  const sessionMatchesAnyFloor = (s: Session): boolean =>
    buildingConfig
      ? buildingConfig.floors.some((f) =>
          f.rooms.some((room) => {
            if (!room.repoName) return false;
            if (s.projectRoot) {
              const basename = s.projectRoot.split("/").pop();
              if (basename === room.repoName) return true;
            }
            return s.projectName === room.repoName;
          }),
        )
      : false;

  // Filter sessions based on whether this is the lobby or a regular floor.
  // Lobby only shows active unmatched sessions to avoid flooding with stale data.
  const matchedSessions = isLobby
    ? sessions.filter(
        (s) => s.status === "active" && !sessionMatchesAnyFloor(s),
      )
    : floor && floor.rooms.length > 0
      ? sessions.filter((s) =>
          floor.rooms.some((room) => {
            if (!room.repoName) return false;
            if (s.projectRoot) {
              const basename = s.projectRoot.split("/").pop();
              if (basename === room.repoName) return true;
            }
            return s.projectName === room.repoName;
          }),
        )
      : sessions;

  // Sort: most recent session per project first, then remaining by recency.
  // This prevents many old sessions from one project burying active sessions
  // from other projects.
  const floorSessions = [...matchedSessions].sort((a, b) => {
    // Active sessions always come first
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;
    // Then by most recently updated
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  // On floor entry, auto-switch sessionId to the most recent matching session
  // if the current session doesn't belong to this floor. Tracked per floorId so
  // re-entering the same floor doesn't override a manual sidebar pick.
  const lastAutoSelectedFloorRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastAutoSelectedFloorRef.current === floorId) return;
    if (floorSessions.length === 0) return;
    lastAutoSelectedFloorRef.current = floorId;
    const currentInFloor = floorSessions.some((s) => s.id === sessionId);
    if (!currentInFloor) {
      void onSessionSelect(floorSessions[0].id);
    }
  }, [floorId, floorSessions, sessionId, onSessionSelect]);

  return (
    <div className="flex-grow flex gap-2 overflow-hidden min-h-0">
      <SessionSidebar
        sessions={floorSessions}
        sessionsLoading={sessionsLoading}
        sessionId={sessionId}
        isCollapsed={isCollapsed}
        onToggleCollapsed={onToggleCollapsed}
        onSessionSelect={onSessionSelect}
        onDeleteSession={onDeleteSession}
        onRenameSession={onRenameSession}
      />

      <div
        data-tour-id="game-canvas"
        className="flex-grow border border-slate-800 rounded-lg shadow-2xl bg-slate-900 overflow-hidden relative"
      >
        <OfficeGame />
      </div>

      <RightSidebar />
    </div>
  );
}
