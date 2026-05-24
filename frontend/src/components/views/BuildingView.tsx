"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import { useBuildingFeed } from "@/hooks/useBuildingFeed";
import { useBuildingStore } from "@/stores/buildingStore";
import { LOBBY_FLOOR_ID } from "@/types/navigation";
import type { FloorConfig } from "@/types/navigation";
import type { Session } from "@/hooks/useSessions";
import { FloorRowLive } from "./building/FloorRowLive";

// ============================================================================
// MATCHING HELPERS
// ============================================================================

/** Check if a session belongs to a specific floor's rooms. */
function sessionMatchesFloor(session: Session, floor: FloorConfig): boolean {
  return floor.rooms.some((room) => {
    if (!room.repoName) return false;
    if (session.projectRoot) {
      const basename = session.projectRoot.split("/").pop();
      if (basename === room.repoName) return true;
    }
    return session.projectName === room.repoName;
  });
}

/** Check if a session belongs to ANY floor. */
function sessionMatchesAnyFloor(
  session: Session,
  floors: FloorConfig[],
): boolean {
  return floors.some((floor) => sessionMatchesFloor(session, floor));
}

// ============================================================================
// BUILDING VIEW
// ============================================================================

export interface BuildingViewProps {
  sessions: Session[];
}

export function BuildingView({ sessions }: BuildingViewProps): React.ReactNode {
  const buildingConfig = useNavigationStore((s) => s.buildingConfig);
  const goToFloor = useNavigationStore((s) => s.goToFloor);
  const requestEditBuilding = useNavigationStore((s) => s.requestEditBuilding);
  const view = useNavigationStore((s) => s.view);
  useBuildingFeed({ enabled: view === "building" });
  const live = useBuildingStore((s) => s.buildingState);
  const feedConnected = useBuildingStore((s) => s.isConnected);

  // Prefer live lobby count from feed; fall back to prop-based unmatched count.
  const lobbyCount =
    live?.lobby?.sessions?.length ??
    (buildingConfig
      ? sessions.filter(
          (s) =>
            s.status === "active" &&
            !sessionMatchesAnyFloor(s, buildingConfig.floors),
        ).length
      : 0);

  if (!buildingConfig) return null;

  const sortedFloors = [...buildingConfig.floors].sort(
    (a, b) => b.floorNumber - a.floorNumber,
  );

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {/* Building header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight mb-1">
          {buildingConfig.buildingName}
          <span
            className={`inline-block w-2 h-2 rounded-full ml-2 align-middle ${
              feedConnected ? "bg-emerald-500" : "bg-slate-600"
            }`}
            title={feedConnected ? "Feed ao vivo conectado" : "Feed desconectado"}
          />
        </h2>
        <div className="flex items-center justify-center gap-3">
          <p className="text-sm text-slate-500 font-mono">
            {buildingConfig.floors.length} floor
            {buildingConfig.floors.length !== 1 ? "s" : ""}
          </p>
          <button
            type="button"
            onClick={requestEditBuilding}
            className="text-xs text-slate-500 hover:text-purple-400 font-mono px-2 py-0.5 border border-slate-700 hover:border-purple-500 rounded transition-colors"
          >
            Edit
          </button>
        </div>
        {live?.totals && (
          <p className="text-xs text-emerald-400 font-mono mt-1">
            {live.totals.activeAgents} agentes ativos em{" "}
            {live.totals.activeFloors}{" "}
            {live.totals.activeFloors === 1 ? "andar" : "andares"}
          </p>
        )}
      </div>

      {/* Building cross-section */}
      <div className="w-full max-w-2xl flex flex-col gap-2">
        {/* Roof */}
        <div className="h-2 bg-slate-800 rounded-t-lg mx-4" />

        {/* Floors sorted top-down by floor number (highest first) */}
        {sortedFloors.map((floor) => {
          const liveFloor = live?.floors?.find((f) => f.floorId === floor.id);
          return (
            <FloorRowLive
              key={floor.id}
              floor={floor}
              live={liveFloor}
              onClick={(origin) => {
                useNavigationStore.getState().setTransitionOrigin(origin);
                goToFloor(floor.id);
              }}
            />
          );
        })}

        {/* Lobby / Ground — click to view unmatched sessions */}
        <button
          onClick={(e) => {
            useNavigationStore.getState().setTransitionOrigin({
              x: e.clientX,
              y: e.clientY,
            });
            goToFloor(LOBBY_FLOOR_ID);
          }}
          className="group flex items-stretch w-full rounded-lg border border-dashed border-slate-800 hover:border-slate-600 bg-slate-900/30 hover:bg-slate-900/60 transition-all duration-200"
        >
          {/* Badge */}
          <div className="flex items-center justify-center w-16 rounded-l-lg text-2xl">
            {"\u{1F6AA}"}
          </div>

          {/* Info */}
          <div className="flex-grow flex items-center gap-4 px-5 py-3">
            <div className="flex flex-col items-start">
              <span className="text-sm text-slate-400 font-bold group-hover:text-slate-300 transition-colors">
                Lobby
              </span>
              <span className="text-xs text-slate-600 font-mono">
                {lobbyCount > 0
                  ? `${lobbyCount} active unassigned`
                  : "All sessions assigned"}
              </span>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center px-4 text-slate-700 group-hover:text-slate-500 transition-colors">
            &rarr;
          </div>
        </button>

        {/* Foundation */}
        <div className="h-2 bg-slate-800 rounded-b-lg mx-4" />
      </div>
    </div>
  );
}
