"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import type { ViewMode } from "@/types/navigation";

const TRANSITION_DURATION = 400;

interface ViewTransitionProps {
  view: ViewMode;
  /** Lightweight building view (DOM only, safe to duplicate during transition) */
  buildingView: ReactNode;
  /** Floor view with PixiJS canvas — always mounted once, never duplicated */
  floorView: ReactNode;
}

/**
 * Animated view switcher that avoids duplicating PixiJS components.
 *
 * BuildingView is lightweight (DOM only) and CAN be duplicated during the
 * outgoing animation. FloorView contains PixiJS and must only exist once —
 * it's always mounted and toggled via CSS display.
 *
 * Zoom-in:  BuildingView scales up 1->3x + fades out,
 *           FloorView wrapper fades in from scale 0.3->1x.
 * Zoom-out: reverse.
 */
export function ViewTransition({
  view,
  buildingView,
  floorView,
}: ViewTransitionProps): ReactNode {
  const transitionOrigin = useNavigationStore((s) => s.transitionOrigin);
  const transitionDirection = useNavigationStore((s) => s.transitionDirection);
  const isTransitioning = useNavigationStore((s) => s.isTransitioning);
  const completeTransition = useNavigationStore((s) => s.completeTransition);

  const [phase, setPhase] = useState<"idle" | "animating">("idle");
  const [outgoingView, setOutgoingView] = useState<ViewMode | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const originStyle = transitionOrigin
    ? `${transitionOrigin.x}px ${transitionOrigin.y}px`
    : "center center";

  const startTransition = useCallback(() => {
    if (!transitionDirection) return;
    setPhase("animating");
    timeoutRef.current = setTimeout(() => {
      setPhase("idle");
      setOutgoingView(null);
      completeTransition();
    }, TRANSITION_DURATION);
  }, [transitionDirection, completeTransition]);

  const prevViewRef = useRef<ViewMode>(view);
  useEffect(() => {
    if (isTransitioning && view !== prevViewRef.current) {
      setOutgoingView(prevViewRef.current);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          startTransition();
        });
      });
    }
    prevViewRef.current = view;
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [view, isTransitioning, startTransition]);

  const isZoomIn = transitionDirection === "zoom-in";

  // Outgoing BuildingView snapshot (only during zoom-in, when leaving building)
  const showOutgoingBuilding =
    phase === "animating" && outgoingView === "building";

  // Outgoing style for the BuildingView copy that scales away
  const outgoingStyle: React.CSSProperties = {
    transformOrigin: originStyle,
    transform: isZoomIn ? "scale(3)" : "scale(0.3)",
    opacity: 0,
    filter: "blur(4px)",
    transition: `transform ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${TRANSITION_DURATION * 0.5}ms ease-out, filter ${TRANSITION_DURATION}ms ease-out`,
    position: "absolute",
    inset: 0,
    zIndex: 1,
    pointerEvents: "none",
  };

  // Incoming animation for whichever view is appearing
  const incomingAnimation =
    phase === "animating"
      ? `${isZoomIn ? "zoomInView" : "zoomOutView"} ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`
      : undefined;

  const incomingOrigin = phase === "animating" ? originStyle : undefined;

  return (
    <div className="relative flex-grow flex overflow-hidden min-h-0">
      {/* Outgoing BuildingView copy (safe to duplicate — no PixiJS) */}
      {showOutgoingBuilding && (
        <div style={outgoingStyle} className="flex gap-2">
          {buildingView}
        </div>
      )}

      {/* BuildingView: conditionally rendered */}
      {view === "building" && (
        <div
          className="flex-grow flex gap-2 overflow-hidden min-h-0"
          style={
            incomingAnimation
              ? {
                  animation: incomingAnimation,
                  transformOrigin: incomingOrigin,
                  position: "relative",
                  zIndex: 2,
                }
              : undefined
          }
        >
          {buildingView}
        </div>
      )}

      {/* FloorView: only rendered when in floor view to avoid duplicate Pixi canvases */}
      {view === "floor" && (
        <div
          className="flex-grow flex gap-2 overflow-hidden min-h-0"
          style={
            incomingAnimation
              ? {
                  animation: incomingAnimation,
                  transformOrigin: incomingOrigin,
                  position: "relative",
                  zIndex: 2,
                }
              : undefined
          }
        >
          {floorView}
        </div>
      )}

      {/* Outgoing FloorView overlay (zoom-out: dimming effect) */}
      {phase === "animating" && outgoingView === "floor" && (
        <div
          style={{
            ...outgoingStyle,
            background: "#0a0a0a",
          }}
        />
      )}
    </div>
  );
}
