"use client";

/**
 * Cell Palette Component
 *
 * Displays extracted cells in a grid with drag-and-drop reordering.
 */

import { useState } from "react";
import type { CellData } from "../lib/types";

interface CellPaletteProps {
  cells: CellData[];
  selectedCellIds: string[];
  outputOrder: string[];
  onToggleSelection: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function CellPalette({
  cells,
  selectedCellIds,
  outputOrder,
  onToggleSelection,
  onReorder,
}: CellPaletteProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Get ordered selected cells
  const orderedCells = outputOrder
    .map((id) => cells.find((c) => c.id === id))
    .filter((c): c is CellData => c !== undefined);

  // Handle drag start
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && index !== draggedIndex) {
      setDragOverIndex(index);
    }
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      onReorder(draggedIndex, toIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  if (cells.length === 0) {
    return (
      <div className="bg-gray-800 rounded p-4">
        <h3 className="text-sm font-semibold mb-2 text-gray-300">
          Extracted Cells
        </h3>
        <p className="text-gray-500 text-sm">
          Click &quot;Extract Cells&quot; to extract frames from the grid
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded p-4">
      <h3 className="text-sm font-semibold mb-2 text-gray-300">
        Selected Cells ({selectedCellIds.length}/{cells.length})
      </h3>

      {/* All cells grid */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">
          All cells (click to toggle):
        </p>
        <div className="flex flex-wrap gap-1">
          {cells.map((cell) => (
            <button
              key={cell.id}
              onClick={() => onToggleSelection(cell.id)}
              className={`relative w-12 h-12 border-2 rounded overflow-hidden ${
                selectedCellIds.includes(cell.id)
                  ? "border-green-500"
                  : "border-gray-600 opacity-50"
              } ${cell.hasContent ? "" : "bg-gray-700"}`}
              title={`${cell.id} (${cell.position.col}, ${cell.position.row})`}
            >
              {cell.imageData ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={cell.imageData}
                  alt={cell.id}
                  className="w-full h-full object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <span className="text-xs text-gray-500">∅</span>
              )}
              {!cell.hasContent && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800/70">
                  <span className="text-gray-500 text-xs">Empty</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Output order (drag-and-drop) */}
      {orderedCells.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">
            Output order (drag to reorder):
          </p>
          <div className="flex flex-wrap gap-1">
            {orderedCells.map((cell, index) => (
              <div
                key={cell.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`relative w-12 h-12 border-2 rounded overflow-hidden cursor-move ${
                  draggedIndex === index
                    ? "border-blue-500 opacity-50"
                    : dragOverIndex === index
                      ? "border-blue-400 bg-blue-500/20"
                      : "border-gray-600"
                }`}
              >
                {cell.imageData && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={cell.imageData}
                    alt={cell.id}
                    className="w-full h-full object-contain pointer-events-none"
                    style={{ imageRendering: "pixelated" }}
                  />
                )}
                <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[8px] text-center text-white">
                  {index + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
