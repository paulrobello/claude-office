"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import type { ViewMode } from "@/types/navigation";

const TRANSITION_DURATION = 400;

interface ViewTransitionProps {
  view: ViewMode;
  children: (view: ViewMode) => ReactNode;
}

/**
 * Animated wrapper for view transitions. Keeps both old and new views
 * mounted during a 400ms zoom animation, then unmounts the old one.
 *
 * Zoom-in:  old view scales up 1→3x + fades out + blurs,
 *           new view scales up 0.3→1x + fades in + sharpens.
 * Zoom-out: reverse.
 */
export function ViewTransition({ view, children }: ViewTransitionProps): ReactNode {
  const transitionOrigin = useNavigationStore((s) => s.transitionOrigin);
  const transitionDirection = useNavigationStore((s) => s.transitionDirection);
  const isTransitioning = useNavigationStore((s) => s.isTransitioning);
  const completeTransition = useNavigationStore((s) => s.completeTransition);

  // Track the outgoing view during a transition
  const [outgoingView, setOutgoingView] = useState<ViewMode | null>(null);
  const [phase, setPhase] = useState<"idle" | "animating">("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute transform-origin from the click position relative to viewport
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

  // Track the previous view to know what to animate out
  const prevViewRef = useRef<ViewMode>(view);
  useEffect(() => {
    if (isTransitioning && view !== prevViewRef.current) {
      setOutgoingView(prevViewRef.current);
      // Use rAF to ensure outgoing view is painted before animation starts
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

  // CSS for the outgoing layer during animation
  const outgoingStyle: React.CSSProperties =
    phase === "animating"
      ? {
          transformOrigin: originStyle,
          transform: isZoomIn ? "scale(3)" : "scale(0.3)",
          opacity: 0,
          filter: "blur(4px)",
          transition: `transform ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${TRANSITION_DURATION * 0.5}ms ease-out, filter ${TRANSITION_DURATION}ms ease-out`,
          position: "absolute" as const,
          inset: 0,
          zIndex: 1,
          pointerEvents: "none" as const,
        }
      : {};

  // CSS for the incoming layer during animation
  const incomingStyle: React.CSSProperties =
    phase === "animating"
      ? {
          transformOrigin: originStyle,
          animation: `${isZoomIn ? "zoomInView" : "zoomOutView"} ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
          position: "relative" as const,
          zIndex: 2,
        }
      : {};

  return (
    <>
      {/* Global keyframes */}
      <style jsx global>{`
        @keyframes zoomInView {
          from {
            transform: scale(0.3);
            opacity: 0;
            filter: blur(4px);
          }
          to {
            transform: scale(1);
            opacity: 1;
            filter: blur(0px);
          }
        }
        @keyframes zoomOutView {
          from {
            transform: scale(3);
            opacity: 0;
            filter: blur(4px);
          }
          to {
            transform: scale(1);
            opacity: 1;
            filter: blur(0px);
          }
        }
      `}</style>

      <div className="relative flex-grow flex overflow-hidden min-h-0">
        {/* Outgoing view (during animation only) */}
        {phase === "animating" && outgoingView && (
          <div style={outgoingStyle} className="flex gap-2">
            {children(outgoingView)}
          </div>
        )}

        {/* Current (incoming) view */}
        <div
          style={incomingStyle}
          className="flex-grow flex gap-2 overflow-hidden min-h-0"
        >
          {children(view)}
        </div>
      </div>
    </>
  );
}
