"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";

interface SpotlightDimProps {
  targetTourId: string | null;
  wide: boolean;
}

export function SpotlightDim({ targetTourId, wide }: SpotlightDimProps): ReactNode {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const updatePosition = useCallback(() => {
    if (!targetTourId || wide) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour-id="${targetTourId}"]`);
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [targetTourId, wide]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const interval = setInterval(updatePosition, 500);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      clearInterval(interval);
    };
  }, [updatePosition]);

  if (wide) {
    return (
      <div
        className="fixed inset-0 z-[50] pointer-events-none"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.25)" }}
      />
    );
  }

  if (!rect) {
    return (
      <div
        className="fixed inset-0 z-[50] pointer-events-none"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      />
    );
  }

  // Use four divs to create the dim border, leaving the cutout area clickable
  const padding = 10;
  const x = rect.left - padding;
  const y = rect.top - padding;
  const w = rect.width + padding * 2;
  const h = rect.height + padding * 2;

  const dimStyle = "fixed z-[50] bg-black/60 pointer-events-none";

  return (
    <>
      {/* Top */}
      <div className={dimStyle} style={{ top: 0, left: 0, right: 0, height: y }} />
      {/* Bottom */}
      <div className={dimStyle} style={{ top: y + h, left: 0, right: 0, bottom: 0 }} />
      {/* Left */}
      <div className={dimStyle} style={{ top: y, left: 0, width: x, height: h }} />
      {/* Right */}
      <div className={dimStyle} style={{ top: y, left: x + w, right: 0, height: h }} />
    </>
  );
}
