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
  /** Content that can safely be duplicated during transition (no PixiJS) */
  buildingView: ReactNode;
  /** Content with PixiJS — always mounted once, never duplicated */
  floorView: ReactNode;
  /** Campus Level 1 — DOM only, safe to duplicate */
  campusView: ReactNode;
  /** Run office Level 2 — DOM only, safe to duplicate */
  runOfficeView?: ReactNode;
  /** Nook drill-down Level 3 — contains PixiJS, not duplicated on transition out */
  nookView?: ReactNode;
}

/**
 * Animated view switcher that avoids duplicating PixiJS components.
 *
 * DOM-only views (building, campus, run-office, nook) CAN be duplicated
 * during outgoing animation. FloorView contains PixiJS and must only exist
 * once — always mounted and toggled via CSS display.
 *
 * Zoom-in:  outgoing view scales up 1→3x + fades out,
 *           incoming view fades in from scale 0.3→1x.
 * Zoom-out: reverse.
 */
export function ViewTransition({
  view,
  buildingView,
  floorView,
  campusView,
  runOfficeView,
  nookView,
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

  // DOM-only views can be safely duplicated during outgoing animation
  // "nook" is excluded — it contains PixiJS (OfficeGame) which must not be duplicated
  const domOnlyViews: ViewMode[] = ["building", "campus", "run-office"];
  const showOutgoingSnapshot =
    phase === "animating" &&
    outgoingView !== null &&
    domOnlyViews.includes(outgoingView);

  const outgoingContent = (() => {
    switch (outgoingView) {
      case "building":
        return buildingView;
      case "campus":
        return campusView;
      case "run-office":
        return runOfficeView ?? null;
      case "nook":
        return nookView ?? null;
      default:
        return null;
    }
  })();

  // Outgoing style for the DOM-only copy that scales away
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

  const incomingStyle: React.CSSProperties | undefined = incomingAnimation
    ? {
        animation: incomingAnimation,
        transformOrigin: incomingOrigin,
        position: "relative",
        zIndex: 2,
      }
    : undefined;

  return (
    <div className="relative flex-grow flex overflow-hidden min-h-0">
      {/* Outgoing DOM-only view snapshot (safe to duplicate) */}
      {showOutgoingSnapshot && outgoingContent && (
        <div style={outgoingStyle} className="flex gap-2">
          {outgoingContent}
        </div>
      )}

      {/* CampusView: conditionally rendered (DOM only) */}
      {view === "campus" && (
        <div
          className="flex-grow flex gap-2 overflow-hidden min-h-0"
          style={incomingStyle}
        >
          {campusView}
        </div>
      )}

      {/* RunOfficeView: conditionally rendered (DOM only) */}
      {view === "run-office" && (
        <div
          className="flex-grow flex gap-2 overflow-hidden min-h-0"
          style={incomingStyle}
        >
          {runOfficeView}
        </div>
      )}

      {/* NookView: conditionally rendered (DOM only for now) */}
      {view === "nook" && (
        <div
          className="flex-grow flex gap-2 overflow-hidden min-h-0"
          style={incomingStyle}
        >
          {nookView}
        </div>
      )}

      {/* BuildingView: conditionally rendered (DOM only) */}
      {view === "building" && (
        <div
          className="flex-grow flex gap-2 overflow-hidden min-h-0"
          style={incomingStyle}
        >
          {buildingView}
        </div>
      )}

      {/* FloorView: always mounted, toggled via CSS — never duplicated (PixiJS) */}
      <div
        className={
          view === "floor"
            ? "flex-grow flex gap-2 overflow-hidden min-h-0"
            : "hidden"
        }
        style={
          view === "floor" && incomingAnimation
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

      {/* Outgoing FloorView overlay (zoom-out: FloorView shrinks away) */}
      {phase === "animating" && outgoingView === "floor" && (
        <div
          style={{
            ...outgoingStyle,
            background: "var(--background, #0a0a0a)",
          }}
        />
      )}
    </div>
  );
}
