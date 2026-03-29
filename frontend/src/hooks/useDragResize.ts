import { useState, useCallback } from "react";

interface UseDragResizeOptions {
  initialSize: number;
  minSize: number;
  /** Max size in pixels, or a function that returns max size (for viewport-relative values) */
  maxSize: number | (() => number);
  /** "horizontal" for left/right edge, "vertical" for top/bottom edge */
  direction: "horizontal" | "vertical";
  /**
   * Which edge is being dragged:
   * - "right" / "down": dragging in positive direction increases size
   * - "left" / "up": dragging in negative direction increases size
   */
  edge?: "left" | "right" | "up" | "down";
}

interface UseDragResizeReturn {
  size: number;
  setSize: (size: number) => void;
  isDragging: boolean;
  handleDragStart: (e: React.MouseEvent) => void;
}

/**
 * Custom hook for drag-to-resize functionality.
 * Handles mouse events, cursor management, and size constraints.
 */
export function useDragResize({
  initialSize,
  minSize,
  maxSize,
  direction,
  edge,
}: UseDragResizeOptions): UseDragResizeReturn {
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);

  // Default edge based on direction
  const resolvedEdge = edge ?? (direction === "horizontal" ? "right" : "down");

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const cursor = direction === "horizontal" ? "ew-resize" : "ns-resize";
      document.body.style.cursor = cursor;

      const startPos = direction === "horizontal" ? e.clientX : e.clientY;
      const startSize = size;

      const getMaxSize = () =>
        typeof maxSize === "function" ? maxSize() : maxSize;

      const onMouseMove = (ev: MouseEvent) => {
        const currentPos = direction === "horizontal" ? ev.clientX : ev.clientY;
        const delta = currentPos - startPos;

        // Calculate new size based on edge direction
        let newSize: number;
        if (direction === "horizontal") {
          // Horizontal: right edge = positive delta increases, left edge = negative delta increases
          newSize =
            resolvedEdge === "right" ? startSize + delta : startSize - delta;
        } else {
          // Vertical: down edge = positive delta increases, up edge = negative delta increases
          newSize =
            resolvedEdge === "down" ? startSize + delta : startSize - delta;
        }

        const constrainedSize = Math.min(
          getMaxSize(),
          Math.max(minSize, newSize),
        );
        setSize(constrainedSize);
      };

      const onMouseUp = () => {
        setIsDragging(false);
        document.body.style.cursor = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [size, minSize, maxSize, direction, resolvedEdge],
  );

  return { size, setSize, isDragging, handleDragStart };
}
