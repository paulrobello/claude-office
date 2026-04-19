"use client";

import dynamic from "next/dynamic";
import { useNavigationStore } from "@/stores/navigationStore";
import { useGameStore, selectAgents } from "@/stores/gameStore";
import { useTourStore } from "@/stores/tourStore";
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
        Initializing Floor...
      </div>
    ),
  },
);

function ElevatorWaiting(): React.ReactNode {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
      <div className="bg-slate-900/80 border border-slate-700 rounded-lg px-6 py-4 flex flex-col items-center gap-3 backdrop-blur-sm">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-orange-500"
              style={{
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
        <span className="text-slate-400 text-xs font-mono">
          Waiting for the elevator to arrive...
        </span>
      </div>
    </div>
  );
}

export interface FloorViewProps {
  sessions: Session[];
  sessionsLoading: boolean;
  sessionId: string;
  onSessionSelect: (id: string) => Promise<void>;
  onDeleteSession: (session: Session) => Promise<void>;
  onRenameSession: (sessionId: string, displayName: string) => Promise<void>;
}

export function FloorView({
  sessions,
  sessionsLoading,
  sessionId,
  onSessionSelect,
  onDeleteSession,
  onRenameSession,
}: FloorViewProps): React.ReactNode {
  const { floorId, buildingConfig } = useNavigationStore();
  const floor = buildingConfig?.floors.find((f) => f.id === floorId);

  // Show elevator waiting indicator during tour when no agents yet
  const agents = useGameStore(selectAgents);
  const isTourActive = useTourStore((s) => s.isActive);
  const tourStepIndex = useTourStore((s) => s.currentStepIndex);
  const showElevatorWaiting =
    isTourActive && tourStepIndex >= 2 && agents.size === 0;

  return (
    <div
      className="flex-grow flex gap-2 overflow-hidden min-h-0"
      style={{ maxHeight: "calc(100vh - 60px)" }}
    >
      <SessionSidebar
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        sessionId={sessionId}
        isCollapsed={false}
        onToggleCollapsed={() => {}}
        onSessionSelect={onSessionSelect}
        onDeleteSession={onDeleteSession}
        onRenameSession={onRenameSession}
      />

      <div className="flex-grow border border-slate-800 rounded-lg shadow-2xl bg-slate-900 overflow-hidden relative">
        {/* Floor label overlay */}
        {floor && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 bg-black/60 rounded text-xs font-mono">
            <span>{floor.icon}</span>
            <span style={{ color: floor.accent }}>{floor.name}</span>
          </div>
        )}
        {showElevatorWaiting && <ElevatorWaiting />}
        <OfficeGame />
      </div>

      <RightSidebar />
    </div>
  );
}
