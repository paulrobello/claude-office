"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";

interface PointerRingProps {
  targetTourId: string | null;
  label: string | null;
}

export function PointerRing({
  targetTourId,
  label,
}: PointerRingProps): ReactNode {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const updatePosition = useCallback(() => {
    if (!targetTourId) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour-id="${targetTourId}"]`);
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [targetTourId]);

  useEffect(() => {
    queueMicrotask(() => updatePosition());
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const interval = setInterval(updatePosition, 500);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      clearInterval(interval);
    };
  }, [updatePosition]);

  if (!rect || !targetTourId) return null;

  const padding = 6;

  return (
    <div
      className="fixed z-[55] pointer-events-none"
      style={{
        left: rect.left - padding,
        top: rect.top - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      }}
    >
      <div className="absolute inset-0 rounded-lg animate-tour-ring" />
      {label && (
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-orange-400 text-xs font-mono font-bold">
          👆 {label}
        </div>
      )}
    </div>
  );
}
