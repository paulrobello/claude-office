"use client";

import { useNavigationStore } from "@/stores/navigationStore";

export function Breadcrumb(): React.ReactNode {
  const { view, floorId, roomId, buildingConfig, goToBuilding, goToFloor } =
    useNavigationStore();

  const floor = buildingConfig?.floors.find((f) => f.id === floorId);

  return (
    <nav className="flex items-center gap-1.5 text-sm font-mono">
      <button
        onClick={goToBuilding}
        data-tour-id="breadcrumb-building"
        className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
          view === "building"
            ? "text-white bg-slate-800"
            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
        }`}
      >
        <span>🏢</span>
        <span>{buildingConfig?.building_name ?? "Building"}</span>
      </button>

      {floor && (
        <>
          <span className="text-slate-600">/</span>
          <button
            onClick={() => goToFloor(floor.id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
              view === "floor"
                ? "text-white bg-slate-800"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <span>{floor.icon}</span>
            <span>{floor.name}</span>
          </button>
        </>
      )}

      {roomId && floor && (
        <>
          <span className="text-slate-600">/</span>
          <span className="px-2 py-0.5 rounded text-white bg-slate-800">
            {roomId}
          </span>
        </>
      )}
    </nav>
  );
}
