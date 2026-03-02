"use client";

/**
 * Output Preview Component
 *
 * Shows the assembled sprite sheet and provides export options.
 */

import { useState, useEffect, useRef } from "react";
import type { CellData, GridConfig } from "../lib/types";
import {
  assembleSpriteSheetAsync,
  downloadDataUrl,
  generateTsConfig,
} from "../lib/imageProcessing";
import { NumberInput } from "./NumberInput";

interface OutputPreviewProps {
  cells: CellData[];
  outputOrder: string[];
  outputGridConfig: { columns: number; rows: number };
  gridConfig: GridConfig;
  onOutputGridChange: (config: { columns: number; rows: number }) => void;
}

export function OutputPreview({
  cells,
  outputOrder,
  outputGridConfig,
  gridConfig,
  onOutputGridChange,
}: OutputPreviewProps) {
  const [outputDataUrl, setOutputDataUrl] = useState<string | null>(null);
  const [animationName, setAnimationName] = useState("custom");
  const [durationMs, setDurationMs] = useState(1000);
  const [loop, setLoop] = useState(true);
  const previewRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Get ordered cells
  const orderedCells = outputOrder
    .map((id) => cells.find((c) => c.id === id))
    .filter((c): c is CellData => c !== undefined);

  // Calculate output dimensions
  const outputWidth = outputGridConfig.columns * gridConfig.cellWidth;
  const outputHeight =
    Math.ceil(orderedCells.length / outputGridConfig.columns) *
    gridConfig.cellHeight;

  // Track the number of ordered cells to reset output when cleared
  const orderedCellsCount = orderedCells.length;

  // Generate output when cells change
  useEffect(() => {
    // Skip generation when no cells are selected
    if (orderedCellsCount === 0) {
      return;
    }

    let cancelled = false;

    // Start a microtask to set generating state
    // This avoids the synchronous setState warning
    queueMicrotask(() => {
      if (!cancelled) {
        setIsGenerating(true);
      }
    });

    assembleSpriteSheetAsync(
      orderedCells,
      outputGridConfig.columns,
      gridConfig.cellWidth,
      gridConfig.cellHeight,
    )
      .then((dataUrl) => {
        if (!cancelled) {
          setOutputDataUrl(dataUrl);
          setIsGenerating(false);
        }
      })
      .catch((error) => {
        console.error("Failed to generate output:", error);
        if (!cancelled) {
          setOutputDataUrl(null);
          setIsGenerating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    orderedCells,
    orderedCellsCount,
    outputGridConfig.columns,
    gridConfig.cellWidth,
    gridConfig.cellHeight,
  ]);

  // Compute effective output URL - null if no cells selected
  const effectiveOutputDataUrl = orderedCellsCount === 0 ? null : outputDataUrl;

  // Handle export
  const handleExport = () => {
    if (!effectiveOutputDataUrl) return;
    downloadDataUrl(effectiveOutputDataUrl, `${animationName}_sheet.png`);
  };

  // Handle copy config
  const handleCopyConfig = () => {
    const config = generateTsConfig(
      {
        ...gridConfig,
        columns: outputGridConfig.columns,
        rows: Math.ceil(orderedCells.length / outputGridConfig.columns),
      },
      animationName,
      durationMs,
      loop,
    );
    navigator.clipboard.writeText(config);
  };

  if (outputOrder.length === 0) {
    return (
      <div className="bg-gray-800 rounded p-4">
        <h3 className="text-sm font-semibold mb-2 text-gray-300">
          Output Preview
        </h3>
        <p className="text-gray-500 text-sm">
          Select cells to include in the output
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-300">
        Output Preview ({orderedCells.length} cells)
      </h3>

      {/* Output Grid Config */}
      <div className="space-y-2">
        <NumberInput
          label="Columns"
          value={outputGridConfig.columns}
          onChange={(v) =>
            onOutputGridChange({ ...outputGridConfig, columns: v })
          }
          min={1}
          max={16}
          labelWidth="w-16"
        />
        <p className="text-xs text-gray-500">
          Output: {outputWidth} × {outputHeight}px
        </p>
      </div>

      {/* Preview Canvas */}
      <div
        ref={previewRef}
        className="overflow-auto bg-gray-900 rounded border border-gray-700"
        style={{ maxHeight: "300px" }}
      >
        {isGenerating ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-gray-500 animate-pulse">Generating...</p>
          </div>
        ) : effectiveOutputDataUrl ? (
          <div
            className="relative"
            style={{
              backgroundImage: `
                linear-gradient(45deg, #3a3a3a 25%, transparent 25%),
                linear-gradient(-45deg, #3a3a3a 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #3a3a3a 75%),
                linear-gradient(-45deg, transparent 75%, #3a3a3a 75%)
              `,
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={effectiveOutputDataUrl}
              alt="Output sprite sheet"
              className="max-w-none"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        ) : null}
      </div>

      {/* Export Options */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Animation Name
          </label>
          <input
            type="text"
            value={animationName}
            onChange={(e) => setAnimationName(e.target.value)}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
          />
        </div>

        <NumberInput
          label="Duration"
          value={durationMs}
          onChange={setDurationMs}
          min={100}
          max={5000}
          step={100}
          labelWidth="w-16"
        />

        <div className="flex items-center gap-2">
          <label className="w-16 text-sm text-gray-300">Loop</label>
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
            className="w-5 h-5"
          />
        </div>
      </div>

      {/* Export Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          disabled={!effectiveOutputDataUrl}
          className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium"
        >
          📥 Export PNG
        </button>
        <button
          onClick={handleCopyConfig}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
        >
          📋 Copy Config
        </button>
      </div>

      {/* Config Preview */}
      <div>
        <p className="text-xs text-gray-500 mb-1">TypeScript Config:</p>
        <pre className="text-xs bg-gray-900 p-2 rounded overflow-auto max-h-32">
          {generateTsConfig(
            {
              ...gridConfig,
              columns: outputGridConfig.columns,
              rows: Math.ceil(orderedCells.length / outputGridConfig.columns),
            },
            animationName,
            durationMs,
            loop,
          )}
        </pre>
      </div>
    </div>
  );
}
