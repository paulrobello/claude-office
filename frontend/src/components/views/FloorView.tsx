"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import type { RoomConfig, FloorConfig } from "@/types/navigation";

function RoomCard({
  room,
  floor,
  onClick,
  sessionCount,
  isActive,
}: {
  room: RoomConfig;
  floor: FloorConfig;
  onClick: () => void;
  sessionCount: number;
  isActive: boolean;
}): React.ReactNode {
  const accent = floor.accent;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col rounded-lg overflow-hidden w-56 flex-shrink-0 transition-all duration-200"
      style={
        isActive
          ? {
              border: `1px solid ${accent}60`,
              background: `linear-gradient(160deg, ${accent}14 0%, #0f1117 60%)`,
              boxShadow: `0 0 0 1px ${accent}30, 0 0 20px ${accent}20, 0 4px 24px rgba(0,0,0,0.6)`,
            }
          : {
              border: "1px solid rgb(30 41 59)",
              background: "#0d111a",
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }
      }
    >
      {/* Header */}
      <div
        className="px-4 py-2.5 flex items-center gap-2 border-b"
        style={
          isActive
            ? {
                borderColor: `${accent}30`,
                background: `linear-gradient(90deg, ${accent}20, transparent)`,
              }
            : { borderColor: "rgb(30 41 59)" }
        }
      >
        {/* Live indicator */}
        <div className="relative flex-shrink-0">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: isActive ? accent : "#334155" }}
          />
          {isActive && (
            <div
              className="absolute inset-0 rounded-full animate-ping"
              style={{ backgroundColor: accent, opacity: 0.5 }}
            />
          )}
        </div>
        <span
          className="text-sm font-bold truncate"
          style={{ color: isActive ? "#f8fafc" : "#64748b" }}
        >
          {room.repo_name}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-5 flex flex-col items-center gap-3">
        {/* Desk / activity icons */}
        <div className="flex gap-1.5 items-end">
          {[0, 1, 2].map((i) =>
            isActive ? (
              /* Active: colored bars with staggered height & animation */
              <div
                key={i}
                className="w-5 rounded-sm"
                style={{
                  height: i === 1 ? "20px" : "14px",
                  background: `linear-gradient(180deg, ${accent}, ${accent}88)`,
                  boxShadow: `0 0 6px ${accent}60`,
                  animation: `pulse ${1.2 + i * 0.3}s ease-in-out infinite alternate`,
                  opacity: 0.85 + i * 0.05,
                }}
              />
            ) : (
              /* Idle: flat dark squares */
              <div key={i} className="w-5 h-4 bg-slate-800/60 rounded-sm" />
            ),
          )}
        </div>

        {/* Status badge */}
        {isActive ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider"
            style={{
              background: `${accent}22`,
              border: `1px solid ${accent}50`,
              color: accent,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: accent }}
            />
            live
          </div>
        ) : (
          <span className="text-[10px] text-slate-700 font-mono uppercase tracking-wider">
            idle
          </span>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2 border-t flex justify-between items-center"
        style={
          isActive
            ? { borderColor: `${accent}25` }
            : { borderColor: "rgb(30 41 59)" }
        }
      >
        <span
          className="text-[10px] font-mono uppercase tracking-wider"
          style={{ color: isActive ? `${accent}cc` : "#334155" }}
        >
          {sessionCount} session{sessionCount !== 1 ? "s" : ""}
        </span>
        <span
          className="transition-colors"
          style={{ color: isActive ? `${accent}cc` : "#334155" }}
        >
          →
        </span>
      </div>
    </button>
  );
}

export function FloorView(): React.ReactNode {
  const { buildingConfig, floorId, goToRoom, allSessions } =
    useNavigationStore();

  const floor = buildingConfig?.floors.find((f) => f.id === floorId);
  if (!floor) return null;

  const roomStats = new Map<string, { count: number; active: boolean }>();
  for (const room of floor.rooms) {
    const roomSessions = allSessions.filter((s) => s.roomId === room.id);
    roomStats.set(room.id, {
      count: roomSessions.length,
      active: roomSessions.some((s) => s.status === "active"),
    });
  }

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
        {floor.rooms.map((room) => {
          const stats = roomStats.get(room.id) ?? { count: 0, active: false };
          return (
            <RoomCard
              key={room.id}
              room={room}
              floor={floor}
              onClick={() => goToRoom(floor.id, room.id)}
              sessionCount={stats.count}
              isActive={stats.active}
            />
          );
        })}
      </div>
    </div>
  );
}
