/**
 * Image Processing Utilities
 *
 * Client-side image processing using Canvas API.
 * Handles cell extraction, chroma key removal, and sheet assembly.
 */

import type { GridConfig, CellData, ChromaKeyConfig } from "./types";
import { getCellBounds, getCellId } from "./gridCalculations";

// ============================================================================
// IMAGE LOADING
// ============================================================================

/**
 * Load an image from a URL and return as HTMLImageElement.
 */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Load an image from a File object.
 */
export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return img;
  } finally {
    // Clean up blob URL after image is loaded
    URL.revokeObjectURL(url);
  }
}

/**
 * Get image data from an image element.
 */
export function getImageData(
  img: HTMLImageElement,
  x: number = 0,
  y: number = 0,
  width?: number,
  height?: number,
): ImageData {
  const w = width ?? img.width;
  const h = height ?? img.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context");
  }

  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Parse a hex color string to RGB values.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Convert RGB to hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Calculate color distance (Euclidean distance in RGB space).
 */
export function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  return Math.sqrt(
    Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2),
  );
}

// ============================================================================
// CHROMA KEY REMOVAL
// ============================================================================

/**
 * Remove chroma key background using global color replacement.
 * Makes all pixels matching the target color transparent.
 */
export function removeChromaKeyGlobal(
  imageData: ImageData,
  config: ChromaKeyConfig,
): ImageData {
  const { targetColor, tolerance, feathering } = config;
  const target = hexToRgb(targetColor);
  const data = imageData.data;

  // Max distance for the tolerance (sqrt(3) * 255 ≈ 441.67)
  const maxDistance = Math.sqrt(3) * 255;
  const toleranceDistance = (tolerance / 255) * maxDistance;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const dist = colorDistance(r, g, b, target.r, target.g, target.b);

    if (dist <= toleranceDistance) {
      // Calculate alpha based on distance (for feathering)
      if (feathering > 0 && dist > toleranceDistance - feathering) {
        const featherRange = feathering;
        const distFromEdge = toleranceDistance - dist;
        const alpha = Math.round((distFromEdge / featherRange) * 255);
        data[i + 3] = Math.max(0, 255 - alpha);
      } else {
        data[i + 3] = 0; // Fully transparent
      }
    }
  }

  return imageData;
}

/**
 * Remove chroma key background using flood fill from corners.
 * More precise than global replacement - only removes connected regions.
 */
export function removeChromaKeyFloodFill(
  imageData: ImageData,
  config: ChromaKeyConfig,
): ImageData {
  const { targetColor, tolerance } = config;
  const target = hexToRgb(targetColor);
  const { width, height, data } = imageData;

  const maxDistance = Math.sqrt(3) * 255;
  const toleranceDistance = (tolerance / 255) * maxDistance;

  // Track visited pixels
  const visited = new Set<number>();

  // Helper to get pixel index
  const getIndex = (x: number, y: number) => (y * width + x) * 4;

  // Helper to check if pixel matches target color
  const matchesTarget = (idx: number) => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const dist = colorDistance(r, g, b, target.r, target.g, target.b);
    return dist <= toleranceDistance;
  };

  // Flood fill from a starting point
  const floodFill = (startX: number, startY: number) => {
    const stack: [number, number][] = [[startX, startY]];

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;

      // Skip if out of bounds or already visited
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const pixelKey = y * width + x;
      if (visited.has(pixelKey)) continue;
      visited.add(pixelKey);

      const idx = getIndex(x, y);
      if (!matchesTarget(idx)) continue;

      // Make transparent
      data[idx + 3] = 0;

      // Add neighbors (4-connected)
      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }
  };

  // Start flood fill from all four corners
  floodFill(0, 0);
  floodFill(width - 1, 0);
  floodFill(0, height - 1);
  floodFill(width - 1, height - 1);

  return imageData;
}

/**
 * Apply chroma key removal based on configuration.
 */
export function applyChromaKey(
  imageData: ImageData,
  config: ChromaKeyConfig,
): ImageData {
  if (!config.enabled) {
    return imageData;
  }

  if (config.useFloodFill) {
    return removeChromaKeyFloodFill(imageData, config);
  } else {
    return removeChromaKeyGlobal(imageData, config);
  }
}

// ============================================================================
// CELL EXTRACTION
// ============================================================================

/**
 * Extract a single cell from an image.
 */
export function extractCell(
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  chromaConfig?: ChromaKeyConfig,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context");
  }

  // Draw the cell portion
  ctx.drawImage(img, x, y, width, height, 0, 0, width, height);

  // Apply chroma key if configured
  if (chromaConfig?.enabled) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const processed = applyChromaKey(imageData, chromaConfig);
    ctx.putImageData(processed, 0, 0);
  }

  return canvas.toDataURL("image/png");
}

/**
 * Check if a cell has any non-transparent content.
 */
export function cellHasContent(
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  chromaConfig?: ChromaKeyConfig,
): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }

  ctx.drawImage(img, x, y, width, height, 0, 0, width, height);

  // Apply chroma key if configured
  if (chromaConfig?.enabled) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const processed = applyChromaKey(imageData, chromaConfig);
    ctx.putImageData(processed, 0, 0);
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Check for any non-transparent pixels
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Detect content bounds within a cell (auto-crop).
 */
export function detectContentBounds(
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  chromaConfig?: ChromaKeyConfig,
): { x: number; y: number; width: number; height: number } | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.drawImage(img, x, y, width, height, 0, 0, width, height);

  // Apply chroma key if configured
  if (chromaConfig?.enabled) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const processed = applyChromaKey(imageData, chromaConfig);
    ctx.putImageData(processed, 0, 0);
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let hasContent = false;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = (py * width + px) * 4;
      if (data[idx + 3] > 0) {
        hasContent = true;
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
    }
  }

  if (!hasContent) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Extract all cells from a sprite sheet.
 */
export async function extractAllCells(
  img: HTMLImageElement,
  gridConfig: GridConfig,
  chromaConfig?: ChromaKeyConfig,
): Promise<CellData[]> {
  const cells: CellData[] = [];

  for (let row = 0; row < gridConfig.rows; row++) {
    for (let col = 0; col < gridConfig.columns; col++) {
      const position = { col, row };
      const bounds = getCellBounds(position, gridConfig);

      const hasContent = cellHasContent(
        img,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        chromaConfig,
      );

      const contentBounds = hasContent
        ? detectContentBounds(
            img,
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            chromaConfig,
          )
        : undefined;

      const imageData = hasContent
        ? extractCell(
            img,
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            chromaConfig,
          )
        : null;

      cells.push({
        id: getCellId(position),
        position,
        imageData,
        hasContent,
        contentBounds: contentBounds ?? undefined,
      });
    }
  }

  return cells;
}

// ============================================================================
// SHEET ASSEMBLY
// ============================================================================

/**
 * Assemble cells into a new sprite sheet.
 */
export function assembleSpriteSheet(
  cells: CellData[],
  columns: number,
  cellWidth: number,
  cellHeight: number,
): string {
  const rows = Math.ceil(cells.length / columns);
  const width = columns * cellWidth;
  const height = rows * cellHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context");
  }

  // Clear with transparency
  ctx.clearRect(0, 0, width, height);

  // Draw each cell
  cells.forEach((cell, index) => {
    if (!cell.imageData) return;

    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * cellWidth;
    const y = row * cellHeight;

    const img = new Image();
    img.src = cell.imageData;

    // Note: This is synchronous since imageData is a data URL
    ctx.drawImage(img, x, y, cellWidth, cellHeight);
  });

  return canvas.toDataURL("image/png");
}

/**
 * Assemble cells asynchronously (for large sheets).
 */
export async function assembleSpriteSheetAsync(
  cells: CellData[],
  columns: number,
  cellWidth: number,
  cellHeight: number,
): Promise<string> {
  const rows = Math.ceil(cells.length / columns);
  const width = columns * cellWidth;
  const height = rows * cellHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context");
  }

  // Clear with transparency
  ctx.clearRect(0, 0, width, height);

  // Load and draw each cell
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    if (!cell.imageData) continue;

    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * cellWidth;
    const y = row * cellHeight;

    try {
      const img = await loadImage(cell.imageData);
      ctx.drawImage(img, x, y, cellWidth, cellHeight);
    } catch (error) {
      console.warn(`Failed to load cell ${cell.id}:`, error);
    }
  }

  return canvas.toDataURL("image/png");
}

// ============================================================================
// EXPORT
// ============================================================================

/**
 * Export canvas as downloadable file.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/**
 * Export canvas as blob.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Generate TypeScript config for the sprite sheet.
 */
export function generateTsConfig(
  gridConfig: GridConfig,
  animationName: string,
  durationMs: number = 1000,
  loop: boolean = true,
): string {
  return `{
  // ${animationName}
  columns: ${gridConfig.columns},
  rows: ${gridConfig.rows},
  frameWidth: ${gridConfig.cellWidth},
  frameHeight: ${gridConfig.cellHeight},
  yOffset: ${gridConfig.yOffset},
  durationMs: ${durationMs},
  loop: ${loop},
}`;
}
