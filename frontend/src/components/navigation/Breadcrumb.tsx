"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Two-level breadcrumb: Building name (clickable) > Floor name.
 * Only renders when not in "single" view.
 */
export function Breadcrumb(): React.ReactNode {
  const view = useNavigationStore((s) => s.view);
  const floorId = useNavigationStore((s) => s.floorId);
  const buildingConfig = useNavigationStore((s) => s.buildingConfig);
  const goToBuilding = useNavigationStore((s) => s.goToBuilding);
  const { t } = useTranslation();

  // Only show when in building or floor view
  if (view === "single") return null;

  const floor = buildingConfig?.floors.find((f) => f.id === floorId);

  return (
    <nav
      className="flex items-center gap-1.5 text-sm font-mono"
      aria-label="Building navigation"
    >
      <button
        onClick={(e) => {
          useNavigationStore
            .getState()
            .setTransitionOrigin({ x: e.clientX, y: e.clientY });
          goToBuilding();
        }}
        data-tour-id="breadcrumb-building"
        className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
          view === "building"
            ? "text-white bg-slate-800"
            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
        }`}
      >
        <span>{"\u{1F3E2}"}</span>
        <span>{buildingConfig?.buildingName ?? t("navigation.building")}</span>
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
