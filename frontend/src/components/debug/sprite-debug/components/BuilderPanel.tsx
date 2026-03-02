"use client";

/**
 * Builder Panel Component
 *
 * Main panel for the sprite sheet builder.
 * Combines source viewer, grid config, cell palette, and output preview.
 */

import { useCallback, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSpriteBuilder } from "../hooks/useSpriteBuilder";
import { GridOverlay } from "./GridOverlay";
import { CellPalette } from "./CellPalette";
import { OutputPreview } from "./OutputPreview";
import { NumberInput } from "./NumberInput";
import { PRESETS } from "../lib/types";

export function BuilderPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Store selectors
  const sourceImageUrl = useSpriteBuilder((s) => s.sourceImageUrl);
  const sourceImageSize = useSpriteBuilder((s) => s.sourceImageSize);
  const gridConfig = useSpriteBuilder(useShallow((s) => s.gridConfig));
  const cells = useSpriteBuilder(useShallow((s) => s.cells));
  const selectedCellIds = useSpriteBuilder(
    useShallow((s) => s.selectedCellIds),
  );
  const outputOrder = useSpriteBuilder(useShallow((s) => s.outputOrder));
  const outputGridConfig = useSpriteBuilder(
    useShallow((s) => s.outputGridConfig),
  );
  const chromaKeyConfig = useSpriteBuilder(
    useShallow((s) => s.chromaKeyConfig),
  );
  const _isProcessing = useSpriteBuilder((s) => s._isProcessing);

  // Store actions
  const setSourceImage = useSpriteBuilder((s) => s.setSourceImage);
  const clearSourceImage = useSpriteBuilder((s) => s.clearSourceImage);
  const setGridConfig = useSpriteBuilder((s) => s.setGridConfig);
  const autoDetectGridConfig = useSpriteBuilder((s) => s.autoDetectGridConfig);
  const extractCells = useSpriteBuilder((s) => s.extractCells);
  const toggleCellSelection = useSpriteBuilder((s) => s.toggleCellSelection);
  const selectAllCells = useSpriteBuilder((s) => s.selectAllCells);
  const deselectAllCells = useSpriteBuilder((s) => s.deselectAllCells);
  const selectCellsWithContent = useSpriteBuilder(
    (s) => s.selectCellsWithContent,
  );
  const reorderCells = useSpriteBuilder((s) => s.reorderCells);
  const setOutputGridConfig = useSpriteBuilder((s) => s.setOutputGridConfig);
  const setChromaKeyConfig = useSpriteBuilder((s) => s.setChromaKeyConfig);

  // Handle file drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        setSourceImage(url);
      }
    },
    [setSourceImage],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Handle file select
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        setSourceImage(url);
      }
    },
    [setSourceImage],
  );

  // Handle preset load
  const handleLoadPreset = useCallback(
    (preset: (typeof PRESETS)[0]) => {
      setSourceImage(preset.sheetPath);
      // Update grid config after image loads
      setTimeout(() => {
        setGridConfig({
          columns: preset.columns,
          rows: preset.rows,
          cellWidth: preset.frameWidth,
          cellHeight: preset.frameHeight,
          xOffset: preset.xOffset,
          yOffset: preset.yOffset,
        });
      }, 100);
    },
    [setSourceImage, setGridConfig],
  );

  return (
    <div className="flex gap-4" onDrop={handleDrop} onDragOver={handleDragOver}>
      {/* Left Column: Source & Grid */}
      <div className="flex-1 space-y-4">
        {/* Source Image */}
        <div className="bg-gray-800 rounded p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-300">
              Source Image
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
              >
                📁 Browse
              </button>
              {sourceImageUrl && (
                <button
                  onClick={clearSourceImage}
                  className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {!sourceImageUrl && (
            <div className="border-2 border-dashed border-gray-600 rounded p-8 text-center">
              <p className="text-gray-500 mb-2">
                Drag & drop an image here, or click Browse
              </p>
              <p className="text-xs text-gray-600">Supports PNG, JPG, WebP</p>
            </div>
          )}

          {/* Presets */}
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-2">Quick Load Preset:</p>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handleLoadPreset(preset)}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid Overlay */}
        <GridOverlay
          imageUrl={sourceImageUrl}
          imageSize={sourceImageSize}
          gridConfig={gridConfig}
          selectedCellIds={selectedCellIds}
          onCellClick={toggleCellSelection}
          scale={0.5}
        />

        {/* Cell Palette */}
        <CellPalette
          cells={cells}
          selectedCellIds={selectedCellIds}
          outputOrder={outputOrder}
          onToggleSelection={toggleCellSelection}
          onReorder={reorderCells}
        />
      </div>

      {/* Right Column: Config & Output */}
      <div className="w-80 space-y-4">
        {/* Grid Configuration */}
        <div className="bg-gray-800 rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">Grid Config</h3>
            <button
              onClick={autoDetectGridConfig}
              disabled={!sourceImageSize}
              className="px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-xs"
            >
              ✨ Auto-detect
            </button>
          </div>

          {sourceImageSize && (
            <p className="text-xs text-gray-500">
              Source: {sourceImageSize.width} × {sourceImageSize.height}px
            </p>
          )}

          <NumberInput
            label="Columns"
            value={gridConfig.columns}
            onChange={(v) => setGridConfig({ columns: v })}
            min={1}
            max={16}
            labelWidth="w-16"
          />
          <NumberInput
            label="Rows"
            value={gridConfig.rows}
            onChange={(v) => setGridConfig({ rows: v })}
            min={1}
            max={16}
            labelWidth="w-16"
          />
          <NumberInput
            label="Cell W"
            value={gridConfig.cellWidth}
            onChange={(v) => setGridConfig({ cellWidth: v })}
            max={sourceImageSize?.width ?? 1000}
            labelWidth="w-16"
          />
          <NumberInput
            label="Cell H"
            value={gridConfig.cellHeight}
            onChange={(v) => setGridConfig({ cellHeight: v })}
            max={sourceImageSize?.height ?? 1000}
            labelWidth="w-16"
          />
          <NumberInput
            label="X Offset"
            value={gridConfig.xOffset}
            onChange={(v) => setGridConfig({ xOffset: v })}
            max={sourceImageSize?.width ?? 1000}
            labelWidth="w-16"
          />
          <NumberInput
            label="Y Offset"
            value={gridConfig.yOffset}
            onChange={(v) => setGridConfig({ yOffset: v })}
            max={sourceImageSize?.height ?? 1000}
            labelWidth="w-16"
          />

          {/* Calculated dimensions */}
          <div className="pt-2 border-t border-gray-700">
            <p className="text-xs text-gray-500">
              Grid covers:{" "}
              {gridConfig.xOffset + gridConfig.columns * gridConfig.cellWidth} ×{" "}
              {gridConfig.yOffset + gridConfig.rows * gridConfig.cellHeight}px
            </p>
            {sourceImageSize && (
              <p
                className={`text-xs ${
                  gridConfig.xOffset +
                    gridConfig.columns * gridConfig.cellWidth >
                    sourceImageSize.width ||
                  gridConfig.yOffset + gridConfig.rows * gridConfig.cellHeight >
                    sourceImageSize.height
                    ? "text-red-400"
                    : "text-green-400"
                }`}
              >
                {gridConfig.xOffset +
                  gridConfig.columns * gridConfig.cellWidth <=
                  sourceImageSize.width &&
                gridConfig.yOffset + gridConfig.rows * gridConfig.cellHeight <=
                  sourceImageSize.height
                  ? "✓ Grid fits within source"
                  : "⚠ Grid exceeds source bounds"}
              </p>
            )}
          </div>
        </div>

        {/* Chroma Key Config */}
        <div className="bg-gray-800 rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">Chroma Key</h3>
            <input
              type="checkbox"
              checked={chromaKeyConfig.enabled}
              onChange={(e) =>
                setChromaKeyConfig({ enabled: e.target.checked })
              }
              className="w-4 h-4"
            />
          </div>

          {chromaKeyConfig.enabled && (
            <>
              <div className="flex items-center gap-2">
                <label className="w-16 text-sm text-gray-300">Color</label>
                <input
                  type="color"
                  value={chromaKeyConfig.targetColor}
                  onChange={(e) =>
                    setChromaKeyConfig({ targetColor: e.target.value })
                  }
                  className="w-8 h-8 rounded cursor-pointer"
                />
                <span className="text-xs text-gray-400">
                  {chromaKeyConfig.targetColor}
                </span>
              </div>

              <NumberInput
                label="Tolerance"
                value={chromaKeyConfig.tolerance}
                onChange={(v) => setChromaKeyConfig({ tolerance: v })}
                min={0}
                max={255}
                labelWidth="w-16"
              />

              <div className="flex items-center gap-2">
                <label className="w-16 text-sm text-gray-300">Flood Fill</label>
                <input
                  type="checkbox"
                  checked={chromaKeyConfig.useFloodFill}
                  onChange={(e) =>
                    setChromaKeyConfig({ useFloodFill: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <span className="text-xs text-gray-500">(from corners)</span>
              </div>
            </>
          )}
        </div>

        {/* Extract Actions */}
        <div className="bg-gray-800 rounded p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">
            Cell Extraction
          </h3>

          <button
            onClick={extractCells}
            disabled={!sourceImageUrl || _isProcessing}
            className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
          >
            {_isProcessing ? "Processing..." : "🔲 Extract Cells"}
          </button>

          {cells.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={selectAllCells}
                className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
              >
                Select All
              </button>
              <button
                onClick={selectCellsWithContent}
                className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
              >
                With Content
              </button>
              <button
                onClick={deselectAllCells}
                className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
              >
                Deselect
              </button>
            </div>
          )}
        </div>

        {/* Output Preview */}
        <OutputPreview
          cells={cells}
          outputOrder={outputOrder}
          outputGridConfig={outputGridConfig}
          gridConfig={gridConfig}
          onOutputGridChange={setOutputGridConfig}
        />
      </div>
    </div>
  );
}
