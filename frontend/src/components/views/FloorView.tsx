"use client";

import dynamic from "next/dynamic";
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
}

export function FloorView({
  sessions,
  sessionsLoading,
  sessionId,
  isCollapsed,
  onToggleCollapsed,
  onSessionSelect,
  onDeleteSession,
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
  const matchedSessions = isLobby
    ? sessions.filter((s) => !sessionMatchesAnyFloor(s))
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
      />

      <div
        data-tour-id="game-canvas"
        className="flex-grow border border-slate-800 rounded-lg shadow-2xl bg-slate-900 overflow-hidden relative"
      >
        {/* Floor label overlay */}
        {floor && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 bg-black/60 rounded text-xs font-mono">
            <span>{floor.icon}</span>
            <span style={{ color: floor.accent }}>{floor.name}</span>
          </div>
        )}
        {isLobby && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 bg-black/60 rounded text-xs font-mono">
            <span>{"\u{1F6AA}"}</span>
            <span className="text-slate-400">Lobby</span>
          </div>
        )}
        <OfficeGame />
      </div>

      <RightSidebar />
    </div>
  );
}
