"use client";

/**
 * Preview Panel Component
 *
 * Displays animated sprite preview with playback controls and configuration.
 * Extracted from the original sprite-debug page.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Application,
  Assets,
  Sprite,
  Texture,
  Rectangle,
  Graphics,
} from "pixi.js";
import { NumberInput } from "./NumberInput";
import type { PresetConfig } from "../lib/types";
import { PRESETS, DIRECTIONS } from "../lib/types";

// ============================================================================
// TYPES
// ============================================================================

interface SpriteConfig {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  yOffset: number;
  xOffset: number;
  durationMs: number;
  loop: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PreviewPanel() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const spriteRef = useRef<Sprite | null>(null);
  const gridRef = useRef<Graphics | null>(null);
  const textureRef = useRef<Texture | null>(null);

  // State
  const [appReady, setAppReady] = useState(false);
  const [sheetPath, setSheetPath] = useState("/sprites/agent1_idle_sheet.png");
  const [config, setConfig] = useState<SpriteConfig>({
    columns: 8,
    rows: 8,
    frameWidth: 116,
    frameHeight: 144,
    xOffset: 0,
    yOffset: 0,
    durationMs: 2000,
    loop: true,
  });
  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentRow, setCurrentRow] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [scale, setScale] = useState(1);
  const [sheetSize, setSheetSize] = useState({ width: 0, height: 0 });

  // Initialize PixiJS
  useEffect(() => {
    if (!canvasRef.current || appRef.current) return;

    const app = new Application();
    app
      .init({
        width: 800,
        height: 600,
        backgroundColor: 0x1a1a2e,
        antialias: false,
      })
      .then(() => {
        if (canvasRef.current && app.canvas) {
          canvasRef.current.appendChild(app.canvas);
          appRef.current = app;

          // Create grid graphics
          const grid = new Graphics();
          app.stage.addChild(grid);
          gridRef.current = grid;

          // Create sprite
          const sprite = new Sprite();
          sprite.anchor.set(0.5);
          sprite.x = 400;
          sprite.y = 300;
          app.stage.addChild(sprite);
          spriteRef.current = sprite;

          setAppReady(true);
        }
      });

    return () => {
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, []);

  // Update frame display function
  const updateFrame = useCallback(
    (frame: number, row: number, texture?: Texture) => {
      const tex = texture ?? textureRef.current;
      if (!spriteRef.current || !tex) return;

      const x = config.xOffset + frame * config.frameWidth;
      const y = config.yOffset + row * config.frameHeight;

      try {
        const frameTexture = new Texture({
          source: tex.source,
          frame: new Rectangle(x, y, config.frameWidth, config.frameHeight),
        });
        spriteRef.current.texture = frameTexture;
        spriteRef.current.scale.set(scale);
      } catch (err) {
        console.error("Failed to create frame texture:", err);
      }
    },
    [config, scale],
  );

  // Load sprite sheet
  useEffect(() => {
    if (!appReady) return;

    Assets.load<Texture>(sheetPath)
      .then((texture: Texture) => {
        textureRef.current = texture;
        setSheetSize({ width: texture.width, height: texture.height });
        // Pass texture directly to avoid stale ref
        updateFrame(currentFrame, currentRow, texture);
      })
      .catch((err: Error) => {
        console.error("Failed to load sprite sheet:", err);
      });
  }, [sheetPath, appReady, updateFrame, currentFrame, currentRow]);

  // Draw grid overlay
  useEffect(() => {
    if (!gridRef.current || !showGrid) {
      if (gridRef.current) gridRef.current.clear();
      return;
    }

    const g = gridRef.current;
    g.clear();

    // Draw frame boundaries
    g.rect(0, 0, config.frameWidth * scale, config.frameHeight * scale);
    g.stroke({ width: 2, color: 0x00ff00 });

    // Position at sprite location
    g.x = 400 - (config.frameWidth * scale) / 2;
    g.y = 300 - (config.frameHeight * scale) / 2;
  }, [config, scale, showGrid]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) return;

    const frameDuration = config.durationMs / config.columns;
    let lastTime = performance.now();
    let rafId: number;

    const tick = () => {
      const now = performance.now();
      if (now - lastTime >= frameDuration) {
        lastTime = now;
        setCurrentFrame((prev) => {
          const next = prev + 1;
          if (next >= config.columns) {
            return config.loop ? 0 : config.columns - 1;
          }
          return next;
        });
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, config.durationMs, config.columns, config.loop]);

  // Update sprite when frame/row changes
  useEffect(() => {
    updateFrame(currentFrame, currentRow);
  }, [currentFrame, currentRow, updateFrame]);

  // Load preset
  const loadPreset = (preset: PresetConfig) => {
    setSheetPath(preset.sheetPath);
    setConfig({
      columns: preset.columns,
      rows: preset.rows,
      frameWidth: preset.frameWidth,
      frameHeight: preset.frameHeight,
      xOffset: preset.xOffset,
      yOffset: preset.yOffset,
      durationMs: preset.durationMs,
      loop: preset.loop,
    });
    setCurrentFrame(0);
    setCurrentRow(0);
  };

  return (
    <div className="flex gap-4">
      {/* Canvas */}
      <div className="flex-1">
        <div
          ref={canvasRef}
          className="border border-gray-700 rounded overflow-hidden"
        />

        {/* Playback controls */}
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <button
            onClick={() => {
              setCurrentFrame(0);
              setIsPlaying(false);
            }}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
          >
            ⏹ Reset
          </button>
          <span className="text-gray-400">
            Frame: {currentFrame + 1}/{config.columns} | Row: {currentRow + 1}/
            {config.rows}
            {config.rows === 8 && ` (${DIRECTIONS[currentRow]})`}
          </span>
        </div>

        {/* Frame navigation */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setCurrentFrame((p) => Math.max(0, p - 1))}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
          >
            ◀ Prev Frame
          </button>
          <button
            onClick={() =>
              setCurrentFrame((p) => Math.min(config.columns - 1, p + 1))
            }
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
          >
            Next Frame ▶
          </button>
          <span className="mx-4 text-gray-500">|</span>
          <button
            onClick={() => setCurrentRow((p) => Math.max(0, p - 1))}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
          >
            ▲ Prev Row
          </button>
          <button
            onClick={() =>
              setCurrentRow((p) => Math.min(config.rows - 1, p + 1))
            }
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
          >
            Next Row ▼
          </button>
        </div>

        {/* Direction buttons for 8-direction sheets */}
        {config.rows === 8 && (
          <div className="mt-4">
            <p className="text-sm text-gray-400 mb-2">
              Quick Direction Select:
            </p>
            <div className="flex gap-2">
              {DIRECTIONS.map((dir, idx) => (
                <button
                  key={dir}
                  onClick={() => setCurrentRow(idx)}
                  className={`px-3 py-1 rounded ${
                    currentRow === idx
                      ? "bg-green-600"
                      : "bg-gray-700 hover:bg-gray-600"
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="w-80 space-y-4">
        {/* Presets */}
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">Presets</h2>
          <div className="space-y-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => loadPreset(preset)}
                className="w-full px-3 py-2 text-left bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Sheet Path */}
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">Sheet Path</h2>
          <input
            type="text"
            value={sheetPath}
            onChange={(e) => setSheetPath(e.target.value)}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Sheet size: {sheetSize.width} x {sheetSize.height}
          </p>
        </div>

        {/* Grid Config */}
        <div className="bg-gray-800 p-4 rounded space-y-3">
          <h2 className="text-lg font-semibold mb-2">Grid Configuration</h2>
          <NumberInput
            label="Columns"
            value={config.columns}
            onChange={(v) => setConfig({ ...config, columns: v })}
            min={1}
            max={16}
          />
          <NumberInput
            label="Rows"
            value={config.rows}
            onChange={(v) => setConfig({ ...config, rows: v })}
            min={1}
            max={16}
          />
          <NumberInput
            label="Frame W"
            value={config.frameWidth}
            onChange={(v) => setConfig({ ...config, frameWidth: v })}
            max={sheetSize.width || 1000}
          />
          <NumberInput
            label="Frame H"
            value={config.frameHeight}
            onChange={(v) => setConfig({ ...config, frameHeight: v })}
            max={sheetSize.height || 1000}
          />
          <NumberInput
            label="X Offset"
            value={config.xOffset}
            onChange={(v) => setConfig({ ...config, xOffset: v })}
            max={sheetSize.width || 1000}
          />
          <NumberInput
            label="Y Offset"
            value={config.yOffset}
            onChange={(v) => setConfig({ ...config, yOffset: v })}
            max={sheetSize.height || 1000}
          />
        </div>

        {/* Animation Config */}
        <div className="bg-gray-800 p-4 rounded space-y-3">
          <h2 className="text-lg font-semibold mb-2">Animation</h2>
          <NumberInput
            label="Duration (ms)"
            value={config.durationMs}
            onChange={(v) => setConfig({ ...config, durationMs: v })}
            min={100}
            max={5000}
            step={100}
          />
          <div className="flex items-center gap-2">
            <label className="w-24 text-sm text-gray-300">Loop</label>
            <input
              type="checkbox"
              checked={config.loop}
              onChange={(e) => setConfig({ ...config, loop: e.target.checked })}
              className="w-5 h-5"
            />
          </div>
        </div>

        {/* Display Options */}
        <div className="bg-gray-800 p-4 rounded space-y-3">
          <h2 className="text-lg font-semibold mb-2">Display</h2>
          <NumberInput
            label="Scale"
            value={scale}
            onChange={setScale}
            min={0.25}
            max={4}
            step={0.25}
          />
          <div className="flex items-center gap-2">
            <label className="w-24 text-sm text-gray-300">Show Grid</label>
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
              className="w-5 h-5"
            />
          </div>
        </div>

        {/* Export Config */}
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">Export Config</h2>
          <pre className="text-xs bg-gray-900 p-2 rounded overflow-auto max-h-40">
            {`{
  columns: ${config.columns},
  rows: ${config.rows},
  frameWidth: ${config.frameWidth},
  frameHeight: ${config.frameHeight},
  xOffset: ${config.xOffset},
  yOffset: ${config.yOffset},
  durationMs: ${config.durationMs},
  loop: ${config.loop},
}`}
          </pre>
        </div>
      </div>
    </div>
  );
}
