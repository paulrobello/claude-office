"use client";

/**
 * Grid Overlay Component
 *
 * Displays the source image with a visual grid overlay.
 * Supports clicking cells to select/deselect them.
 */

import { useRef, useEffect, useCallback, useState } from "react";
import type { GridConfig, CellPosition } from "../lib/types";
import {
  getGridLines,
  getCellAtPoint,
  getCellId,
} from "../lib/gridCalculations";

/**
 * Custom hook to load an image from a URL.
 * Returns the loaded image or null if loading/failed.
 */
function useImage(url: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) {
        setImage(img);
        setLoadedUrl(url);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        console.error("Failed to load image");
      }
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Return null when URL is null, otherwise return the loaded image
  // Only return image if it matches the current URL
  return url && url === loadedUrl ? image : null;
}

interface GridOverlayProps {
  imageUrl: string | null;
  imageSize: { width: number; height: number } | null;
  gridConfig: GridConfig;
  selectedCellIds: string[];
  onCellClick: (id: string) => void;
  scale?: number;
}

export function GridOverlay({
  imageUrl,
  imageSize,
  gridConfig,
  selectedCellIds,
  onCellClick,
  scale = 1,
}: GridOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredCell, setHoveredCell] = useState<CellPosition | null>(null);
  const image = useImage(imageUrl);

  // Draw the canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !imageSize) return;

    const scaledWidth = imageSize.width * scale;
    const scaledHeight = imageSize.height * scale;

    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    // Clear
    ctx.clearRect(0, 0, scaledWidth, scaledHeight);

    // Draw checkerboard background (for transparency)
    const checkSize = 10;
    for (let y = 0; y < scaledHeight; y += checkSize) {
      for (let x = 0; x < scaledWidth; x += checkSize) {
        const isLight = (x / checkSize + y / checkSize) % 2 === 0;
        ctx.fillStyle = isLight ? "#3a3a3a" : "#2a2a2a";
        ctx.fillRect(x, y, checkSize, checkSize);
      }
    }

    // Draw image
    if (image) {
      ctx.drawImage(image, 0, 0, scaledWidth, scaledHeight);
    }

    // Draw grid lines
    const { vertical, horizontal } = getGridLines(gridConfig);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Vertical lines
    vertical.forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x * scale, 0);
      ctx.lineTo(x * scale, scaledHeight);
      ctx.stroke();
    });

    // Horizontal lines
    horizontal.forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(0, y * scale);
      ctx.lineTo(scaledWidth, y * scale);
      ctx.stroke();
    });

    ctx.setLineDash([]);

    // Draw selected cells
    ctx.fillStyle = "rgba(34, 197, 94, 0.3)";
    ctx.strokeStyle = "rgba(34, 197, 94, 0.8)";
    ctx.lineWidth = 2;

    for (let row = 0; row < gridConfig.rows; row++) {
      for (let col = 0; col < gridConfig.columns; col++) {
        const cellId = getCellId({ col, row });
        if (selectedCellIds.includes(cellId)) {
          const x = (gridConfig.xOffset + col * gridConfig.cellWidth) * scale;
          const y = (gridConfig.yOffset + row * gridConfig.cellHeight) * scale;
          const w = gridConfig.cellWidth * scale;
          const h = gridConfig.cellHeight * scale;

          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
        }
      }
    }

    // Draw hovered cell
    if (hoveredCell) {
      const x =
        (gridConfig.xOffset + hoveredCell.col * gridConfig.cellWidth) * scale;
      const y =
        (gridConfig.yOffset + hoveredCell.row * gridConfig.cellHeight) * scale;
      const w = gridConfig.cellWidth * scale;
      const h = gridConfig.cellHeight * scale;

      ctx.fillStyle = "rgba(59, 130, 246, 0.2)";
      ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
  }, [image, imageSize, gridConfig, selectedCellIds, hoveredCell, scale]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Handle mouse events
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    const cell = getCellAtPoint(x, y, gridConfig);
    setHoveredCell(cell);
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    const cell = getCellAtPoint(x, y, gridConfig);
    if (cell) {
      onCellClick(getCellId(cell));
    }
  };

  if (!imageUrl || !imageSize) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-800 rounded border border-gray-700 border-dashed">
        <p className="text-gray-500">No image loaded</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-auto bg-gray-900 rounded border border-gray-700"
      style={{ maxHeight: "500px" }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className="cursor-crosshair"
      />
      {hoveredCell && (
        <div className="absolute bottom-2 right-2 bg-gray-800/80 px-2 py-1 rounded text-xs">
          Cell: ({hoveredCell.col}, {hoveredCell.row})
        </div>
      )}
    </div>
  );
}
