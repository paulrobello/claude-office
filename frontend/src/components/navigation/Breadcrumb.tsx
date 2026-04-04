"use client";

import { useNavigationStore } from "@/stores/navigationStore";

export function Breadcrumb(): React.ReactNode {
  const { view, floorId, buildingConfig, goToBuilding } =
    useNavigationStore();

  const floor = buildingConfig?.floors.find((f) => f.id === floorId);

  return (
    <nav className="flex items-center gap-1.5 text-sm font-mono">
      <button
        onClick={(e) => {
          useNavigationStore.getState().setTransitionOrigin({ x: e.clientX, y: e.clientY });
          goToBuilding();
        }}
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
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-white bg-slate-800">
            <span>{floor.icon}</span>
            <span>{floor.name}</span>
          </span>
        </>
      )}
    </nav>
  );
}
