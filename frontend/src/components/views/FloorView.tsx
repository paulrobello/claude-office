"use client";

import dynamic from "next/dynamic";
import { useNavigationStore } from "@/stores/navigationStore";
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
  const floor = buildingConfig?.floors.find((f) => f.id === floorId);

  // Filter sessions to only those belonging to this floor's rooms.
  // Match by projectRoot basename (real filesystem path) — project_name is
  // lossy because Claude Code converts slashes to dashes in transcript paths.
  const matchedSessions =
    floor && floor.rooms.length > 0
      ? sessions.filter((s) =>
          floor.rooms.some((room) => {
            if (!room.repoName) return false;
            // Primary: basename of projectRoot (e.g. "/Users/me/Repos/my-app" → "my-app")
            if (s.projectRoot) {
              const basename = s.projectRoot.split("/").pop();
              if (basename === room.repoName) return true;
            }
            // Fallback: exact projectName match
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
        <OfficeGame />
      </div>

      <RightSidebar />
    </div>
  );
}
