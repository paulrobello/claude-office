"use client";

import dynamic from "next/dynamic";
import { useNavigationStore } from "@/stores/navigationStore";
import { useFloorSessions } from "@/hooks/useFloorSessions";
import { useWebSocketEvents } from "@/hooks/useWebSocketEvents";
import { SessionSidebar } from "@/components/layout/SessionSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";

const OfficeGame = dynamic(
  () =>
    import("@/components/game/OfficeGame").then((m) => ({
      default: m.OfficeGame,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-900 animate-pulse flex items-center justify-center text-white font-mono text-center">
        Initializing Floor...
      </div>
    ),
  },
);

export function FloorView(): React.ReactNode {
  const { floorId, buildingConfig } = useNavigationStore();
  const floor = buildingConfig?.floors.find((f) => f.id === floorId);

  const { sessions, loading, sessionId, selectSession } =
    useFloorSessions(floorId);

  // Connect WebSocket to the floor
  useWebSocketEvents({ sessionId });

  return (
    <div className="flex-grow flex gap-2 overflow-hidden min-h-0">
      <SessionSidebar
        sessions={sessions}
        sessionsLoading={loading}
        sessionId={sessionId}
        isCollapsed={false}
        onToggleCollapsed={() => {}}
        onSessionSelect={async (id) => selectSession(id)}
        onDeleteSession={() => {}}
      />

      <div className="flex-grow border border-slate-800 rounded-lg shadow-2xl bg-slate-900 overflow-hidden relative">
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
