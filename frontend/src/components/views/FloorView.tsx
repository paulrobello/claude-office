"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import type { RoomConfig, FloorConfig } from "@/types/navigation";

function RoomCard({
  room,
  floor,
  onClick,
}: {
  room: RoomConfig;
  floor: FloorConfig;
  onClick: () => void;
}): React.ReactNode {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col border border-slate-800 rounded-lg bg-slate-900 hover:border-slate-600 hover:bg-slate-800/80 transition-all duration-200 overflow-hidden w-56 flex-shrink-0"
    >
      {/* Room header with accent */}
      <div
        className="px-4 py-2 border-b border-slate-800 flex items-center gap-2"
        style={{ backgroundColor: floor.accent + "10" }}
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: floor.accent }}
        />
        <span className="text-sm font-bold text-white truncate">
          {room.repo_name}
        </span>
      </div>

      {/* Room content placeholder */}
      <div className="px-4 py-6 flex flex-col items-center gap-2">
        {/* Desk icons */}
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-5 h-4 bg-slate-800 rounded-sm group-hover:bg-slate-700 transition-colors"
            />
          ))}
        </div>
        <span className="text-xs text-slate-600 font-mono">idle</span>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-800 flex justify-between items-center">
        <span className="text-[10px] text-slate-600 font-mono uppercase">
          0 agents
        </span>
        <span className="text-slate-600 group-hover:text-slate-400 transition-colors">
          →
        </span>
      </div>
    </button>
  );
}

export function FloorView(): React.ReactNode {
  const { buildingConfig, floorId, goToRoom } = useNavigationStore();

  const floor = buildingConfig?.floors.find((f) => f.id === floorId);
  if (!floor) return null;

  return (
    <div className="flex flex-col h-full p-6">
      {/* Floor header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">{floor.icon}</span>
        <div>
          <h2 className="text-2xl font-bold" style={{ color: floor.accent }}>
            {floor.name}
          </h2>
          <p className="text-sm text-slate-500 font-mono">
            Floor {floor.floor_number} — {floor.rooms.length} room
            {floor.rooms.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Room cards */}
      <div className="flex-grow flex items-start gap-3 overflow-x-auto pb-4">
        {floor.rooms.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            floor={floor}
            onClick={() => goToRoom(floor.id, room.id)}
          />
        ))}
      </div>
    </div>
  );
}
