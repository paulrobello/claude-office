"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import type { FloorConfig } from "@/types/navigation";

function FloorRow({
  floor,
  onClick,
  activeRooms: _activeRooms,
  totalSessions,
}: {
  floor: FloorConfig;
  onClick: () => void;
  activeRooms: number;
  totalSessions: number;
}): React.ReactNode {
  const roomCount = floor.rooms.length;
  const isPlaceholder = roomCount <= 1;

  return (
    <button
      onClick={onClick}
      className={`group flex items-stretch w-full rounded-lg border transition-all duration-200 ${
        isPlaceholder
          ? "border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900"
          : "border-slate-700 bg-slate-900 hover:border-slate-500 hover:bg-slate-800"
      }`}
    >
      {/* Floor number badge */}
      <div
        className="flex items-center justify-center w-16 rounded-l-lg text-2xl font-bold font-mono"
        style={{ backgroundColor: floor.accent + "20", color: floor.accent }}
      >
        {floor.floor_number}F
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
            {totalSessions > 0 && (
              <span className="text-emerald-500">
                {" "}
                · {totalSessions} active
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Room windows preview */}
      <div className="flex items-center gap-1.5 px-4">
        {floor.rooms.map((room) => (
          <div
            key={room.id}
            className={`w-3 h-5 rounded-sm ${
              isPlaceholder
                ? "bg-slate-800"
                : "bg-slate-700 group-hover:bg-slate-600"
            }`}
            title={room.repo_name}
          />
        ))}
      </div>

      {/* Arrow */}
      <div className="flex items-center px-4 text-slate-600 group-hover:text-slate-400 transition-colors">
        →
      </div>
    </button>
  );
}

export function BuildingView(): React.ReactNode {
  const { buildingConfig, goToFloor, allSessions } = useNavigationStore();

  if (!buildingConfig) return null;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {/* Building header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight mb-1">
          {buildingConfig.building_name}
        </h2>
        <p className="text-sm text-slate-500 font-mono">
          {buildingConfig.floors.length} floors
        </p>
      </div>

      {/* Building cross-section */}
      <div className="w-full max-w-2xl flex flex-col gap-2">
        {/* Roof */}
        <div className="h-2 bg-slate-800 rounded-t-lg mx-4" />

        {/* Floors (sorted top-down by floor_number) */}
        {buildingConfig.floors.map((floor) => {
          const floorRoomIds = new Set(floor.rooms.map((r) => r.id));
          const floorSessions = allSessions.filter(
            (s) => s.roomId && floorRoomIds.has(s.roomId),
          );
          const activeRooms = new Set(
            floorSessions
              .filter((s) => s.status === "active")
              .map((s) => s.roomId),
          ).size;
          return (
            <FloorRow
              key={floor.id}
              floor={floor}
              onClick={() => goToFloor(floor.id)}
              activeRooms={activeRooms}
              totalSessions={
                floorSessions.filter((s) => s.status === "active").length
              }
            />
          );
        })}

        {/* Lobby / Ground */}
        <div className="flex items-center gap-3 px-5 py-3 border border-dashed border-slate-800 rounded-lg">
          <span className="text-slate-600">🚪</span>
          <span className="text-sm text-slate-600 font-mono">
            Lobby — agents awaiting room assignment
          </span>
        </div>

        {/* Foundation */}
        <div className="h-2 bg-slate-800 rounded-b-lg mx-4" />
      </div>
    </div>
  );
}
