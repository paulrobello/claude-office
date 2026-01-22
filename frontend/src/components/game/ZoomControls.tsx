/**
 * ZoomControls Component
 *
 * Provides zoom in/out and reset controls for the game canvas.
 * Uses react-zoom-pan-pinch hooks for control.
 */

import { type ReactNode } from "react";
import { useControls } from "react-zoom-pan-pinch";

export function ZoomControls(): ReactNode {
  const { zoomIn, zoomOut, resetTransform } = useControls();

  return (
    <div className="absolute bottom-3 right-3 flex flex-row gap-1 z-10">
      <button
        onClick={() => zoomIn()}
        className="w-10 h-10 bg-slate-800/90 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center text-xl font-bold border border-slate-600 shadow-lg active:scale-95 transition-transform"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        onClick={() => zoomOut()}
        className="w-10 h-10 bg-slate-800/90 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center text-xl font-bold border border-slate-600 shadow-lg active:scale-95 transition-transform"
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        onClick={() => resetTransform()}
        className="w-10 h-10 bg-slate-800/90 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center text-xs font-bold border border-slate-600 shadow-lg active:scale-95 transition-transform"
        aria-label="Reset zoom"
      >
        1:1
      </button>
    </div>
  );
}
