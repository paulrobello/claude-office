"use client";

import dynamic from "next/dynamic";
import { useNavigationStore } from "@/stores/navigationStore";
import { SessionSidebar } from "@/components/layout/SessionSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import type { Session } from "@/hooks/useSessions";

const OfficeGame = dynamic(
  () =>
    import("@/components/game/OfficeGame").then((m) => ({
      default: m.OfficeGame,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-900 animate-pulse flex items-center justify-center text-white font-mono text-center">
        Initializing Room...
      </div>
    ),
  },
);

interface RoomViewProps {
  sessions: Session[];
  sessionsLoading: boolean;
  sessionId: string;
  leftSidebarCollapsed: boolean;
  onToggleLeftSidebar: () => void;
  onSessionSelect: (id: string) => Promise<void>;
  onDeleteSession: (session: Session) => void;
}

export function RoomView({
  sessions,
  sessionsLoading,
  sessionId,
  leftSidebarCollapsed,
  onToggleLeftSidebar,
  onSessionSelect,
  onDeleteSession,
}: RoomViewProps): React.ReactNode {
  const { floorId, roomId, buildingConfig } = useNavigationStore();
  const floor = buildingConfig?.floors.find((f) => f.id === floorId);
  const room = floor?.rooms.find((r) => r.id === roomId);

  return (
    <div className="flex-grow flex gap-2 overflow-hidden min-h-0">
      <SessionSidebar
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        sessionId={sessionId}
        isCollapsed={leftSidebarCollapsed}
        onToggleCollapsed={onToggleLeftSidebar}
        onSessionSelect={onSessionSelect}
        onDeleteSession={onDeleteSession}
      />

      <div className="flex-grow border border-slate-800 rounded-lg shadow-2xl bg-slate-900 overflow-hidden relative">
        {/* Room label overlay */}
        {room && floor && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 bg-black/60 rounded text-xs font-mono">
            <span>{floor.icon}</span>
            <span style={{ color: floor.accent }}>{room.repo_name}</span>
          </div>
        )}
        <OfficeGame />
      </div>

      <RightSidebar />
    </div>
  );
}
