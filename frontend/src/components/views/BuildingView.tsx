"use client";

import { useMemo } from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import { LOBBY_FLOOR_ID } from "@/types/navigation";
import type { FloorConfig } from "@/types/navigation";
import type { Session } from "@/hooks/useSessions";

// ============================================================================
// FLOOR ROW
// ============================================================================

interface FloorRowProps {
  floor: FloorConfig;
  activeSessionCount: number;
  onClick: (origin: { x: number; y: number }) => void;
}

function FloorRow({
  floor,
  activeSessionCount,
  onClick,
}: FloorRowProps): React.ReactNode {
  const roomCount = floor.rooms.length;

  return (
    <button
      onClick={(e) => onClick({ x: e.clientX, y: e.clientY })}
      data-tour-id={`floor-${floor.id}`}
      data-floor-id={floor.id}
      className="group flex items-stretch w-full rounded-lg border border-slate-700 bg-slate-900 hover:border-slate-500 hover:bg-slate-800 transition-all duration-200"
    >
      {/* Floor number badge */}
      <div
        className="flex items-center justify-center w-16 rounded-l-lg text-2xl font-bold font-mono"
        style={{ backgroundColor: floor.accent + "20", color: floor.accent }}
      >
        {floor.floorNumber}F
      </div>

      {/* Floor info */}
      <div className="flex-grow flex items-center gap-4 px-5 py-4">
        <span className="text-2xl">{floor.icon}</span>
        <div className="flex flex-col items-start">
          <span className="text-lg font-bold" style={{ color: floor.accent }}>
            {floor.name}
          </span>
          <span className="text-xs text-slate-500 font-mono">
            {roomCount} room{roomCount !== 1 ? "s" : ""}
            {activeSessionCount > 0 && (
              <>
                {" "}
                &middot; {activeSessionCount} session
                {activeSessionCount !== 1 ? "s" : ""}
              </>
            )}
          </span>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center px-4 text-slate-600 group-hover:text-slate-400 transition-colors">
        &rarr;
      </div>
    </button>
  );
}

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

  // Active sessions that don't match any floor
  const unmatchedSessions = useMemo(
    () =>
      buildingConfig
        ? sessions.filter(
            (s) =>
              s.status === "active" &&
              !sessionMatchesAnyFloor(s, buildingConfig.floors),
          )
        : [],
    [sessions, buildingConfig],
  );

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
      </div>

      {/* Building cross-section */}
      <div className="w-full max-w-2xl flex flex-col gap-2">
        {/* Roof */}
        <div className="h-2 bg-slate-800 rounded-t-lg mx-4" />

        {/* Floors sorted top-down by floor number (highest first) */}
        {sortedFloors.map((floor) => {
          const floorSessions = sessions.filter((s) =>
            sessionMatchesFloor(s, floor),
          );
          return (
            <FloorRow
              key={floor.id}
              floor={floor}
              activeSessionCount={
                floorSessions.filter((s) => s.status === "active").length
              }
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
                {unmatchedSessions.length > 0
                  ? `${unmatchedSessions.length} active unassigned`
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
