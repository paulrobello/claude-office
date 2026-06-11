"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import { LOBBY_FLOOR_ID } from "@/types/navigation";
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

  // Hidden in the single office view.
  if (view === "single") return null;

  const hasBuilding = (buildingConfig?.floors.length ?? 0) > 0;
  // In the Command Center, only show the crumb when there's a building to
  // return to (otherwise the header COMMAND button is the only entry point).
  if (view === "command" && !hasBuilding) return null;

  const isCommand = view === "command";
  const isLobby = floorId === LOBBY_FLOOR_ID;
  const floor = isLobby
    ? null
    : buildingConfig?.floors.find((f) => f.id === floorId);

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

      {isCommand && (
        <>
          <span className="text-slate-600">/</span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-white bg-slate-800">
            <span>{"\u{1F6F0}\u{FE0F}"}</span>
            <span>{t("commandCenter.title")}</span>
          </span>
        </>
      )}

      {isLobby && (
        <>
          <span className="text-slate-600">/</span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-white bg-slate-800">
            <span>{"\u{1F6AA}"}</span>
            <span>Lobby</span>
          </span>
        </>
      )}

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
