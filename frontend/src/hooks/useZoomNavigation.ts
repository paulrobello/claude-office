"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigationStore } from "@/stores/navigationStore";

const SNAP_THRESHOLD = 2.5;
const SNAP_OUT_THRESHOLD = 0.4;
const ZOOM_SPEED = 0.008;
const SNAP_COOLDOWN_MS = 500;

interface ZoomState {
  scale: number;
  originX: number;
  originY: number;
}

/**
 * Adds scroll/pinch-to-zoom navigation between views.
 *
 * In Building view, scrolling in toward a floor scales the view with CSS
 * transforms. When the scale crosses SNAP_THRESHOLD, it triggers a view
 * transition to the floor under the cursor.
 *
 * In Floor view, this hook is inactive — react-zoom-pan-pinch handles zoom.
 */
export function useZoomNavigation(containerRef: React.RefObject<HTMLDivElement | null>): ZoomState {
  const view = useNavigationStore((s) => s.view);
  const isTransitioning = useNavigationStore((s) => s.isTransitioning);
  const [zoom, setZoom] = useState<ZoomState>({ scale: 1, originX: 0, originY: 0 });
  const lastSnapTime = useRef(0);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // Only handle zoom in building view; floor view uses react-zoom-pan-pinch
      if (view !== "building") return;
      // Don't interfere during transitions
      if (isTransitioning) return;
      // Cooldown after snap
      if (Date.now() - lastSnapTime.current < SNAP_COOLDOWN_MS) return;

      e.preventDefault();

      // deltaY: positive = scroll down = zoom in, negative = zoom out
      // Trackpad pinch: ctrlKey is true, deltaY is inverted
      const delta = e.ctrlKey ? -e.deltaY : e.deltaY;
      const zoomDelta = delta * ZOOM_SPEED;

      setZoom((prev) => {
        const newScale = Math.max(0.3, Math.min(4, prev.scale + zoomDelta));

        // Check for snap-in threshold (building → floor)
        if (newScale >= SNAP_THRESHOLD) {
          lastSnapTime.current = Date.now();

          const target = findTargetUnderCursor(e.clientX, e.clientY);
          if (target?.floorId) {
            const store = useNavigationStore.getState();
            store.setTransitionOrigin({ x: e.clientX, y: e.clientY });
            store.goToFloor(target.floorId);
          }

          return { scale: 1, originX: 0, originY: 0 };
        }

        return { scale: newScale, originX: e.clientX, originY: e.clientY };
      });
    },
    [view, isTransitioning],
  );

  // Reset zoom when view changes
  useEffect(() => {
    setZoom({ scale: 1, originX: 0, originY: 0 });
  }, [view]);

  // Attach wheel listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [containerRef, handleWheel]);

  return zoom;
}

/**
 * Find the floor element under the cursor using data attributes.
 */
function findTargetUnderCursor(
  clientX: number,
  clientY: number,
): { floorId?: string } | null {
  const elements = document.elementsFromPoint(clientX, clientY);

  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue;

    if (el.dataset.floorId) {
      return { floorId: el.dataset.floorId };
    }
  }

  return null;
}
