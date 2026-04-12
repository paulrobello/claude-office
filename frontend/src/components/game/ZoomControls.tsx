/**
 * ZoomControls Component
 *
 * Provides zoom in/out and reset controls for the game canvas.
 * Uses react-zoom-pan-pinch hooks for control.
 */

import { type ReactNode } from "react";
import { useControls } from "react-zoom-pan-pinch";
import { useTranslation } from "@/hooks/useTranslation";

export function ZoomControls(): ReactNode {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const { t } = useTranslation();

  return (
    <div className="absolute bottom-14 right-4 flex flex-row gap-1 z-10">
      <button
        onClick={() => zoomIn()}
        className="w-10 h-10 bg-slate-800/90 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center text-xl font-bold border border-slate-600 shadow-lg active:scale-95 transition-transform"
        aria-label={t("zoom.in")}
      >
        +
      </button>
      <button
        onClick={() => zoomOut()}
        className="w-10 h-10 bg-slate-800/90 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center text-xl font-bold border border-slate-600 shadow-lg active:scale-95 transition-transform"
        aria-label={t("zoom.out")}
      >
        −
      </button>
      <button
        onClick={() => resetTransform()}
        className="w-10 h-10 bg-slate-800/90 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center text-xs font-bold border border-slate-600 shadow-lg active:scale-95 transition-transform"
        aria-label={t("zoom.reset")}
      >
        1:1
      </button>
    </div>
  );
}
