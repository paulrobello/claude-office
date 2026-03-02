/**
 * Grid Calculation Utilities
 *
 * Provides utilities for calculating optimal grid dimensions,
 * cell positions, and grid snapping for sprite sheets.
 */

import type { GridConfig, CellPosition } from "./types";

// ============================================================================
// OPTIMAL DIMENSIONS
// ============================================================================

/**
 * Calculate optimal sheet dimensions that divide evenly into a grid.
 * This fixes issues like images not dividing evenly by the number of columns.
 *
 * @param cols - Number of columns
 * @param rows - Number of rows
 * @param cellW - Desired cell width
 * @param cellH - Desired cell height
 * @returns Optimal sheet dimensions
 */
export function optimalDimensions(
  cols: number,
  rows: number,
  cellW: number,
  cellH: number,
): { width: number; height: number; cellWidth: number; cellHeight: number } {
  return {
    width: cols * cellW,
    height: rows * cellH,
    cellWidth: cellW,
    cellHeight: cellH,
  };
}

/**
 * Given a sheet size, calculate the best cell dimensions for a given grid.
 *
 * @param sheetWidth - Source image width
 * @param sheetHeight - Source image height
 * @param cols - Number of columns
 * @param rows - Number of rows
 * @returns Recommended cell dimensions
 */
export function calculateCellDimensions(
  sheetWidth: number,
  sheetHeight: number,
  cols: number,
  rows: number,
): {
  cellWidth: number;
  cellHeight: number;
  remainder: { x: number; y: number };
} {
  const cellWidth = Math.floor(sheetWidth / cols);
  const cellHeight = Math.floor(sheetHeight / rows);

  return {
    cellWidth,
    cellHeight,
    remainder: {
      x: sheetWidth - cellWidth * cols,
      y: sheetHeight - cellHeight * rows,
    },
  };
}

/**
 * Auto-detect optimal grid configuration based on sheet dimensions.
 * Tries common grid sizes and returns the one with least remainder.
 *
 * @param sheetWidth - Source image width
 * @param sheetHeight - Source image height
 * @returns Best-fit grid configuration
 */
export function autoDetectGrid(
  sheetWidth: number,
  sheetHeight: number,
): GridConfig {
  // Common grid configurations to try
  const candidateGrids = [
    { cols: 6, rows: 8 }, // Standard character sheet
    { cols: 8, rows: 8 }, // Square grid
    { cols: 4, rows: 1 }, // Strip (4 frames)
    { cols: 6, rows: 1 }, // Strip (6 frames)
    { cols: 8, rows: 1 }, // Strip (8 frames)
    { cols: 4, rows: 4 }, // Small grid
    { cols: 3, rows: 4 }, // 12-frame grid
    { cols: 4, rows: 2 }, // 8-frame grid
    { cols: 2, rows: 4 }, // Vertical strip
  ];

  let bestConfig: GridConfig | null = null;
  let bestScore = Infinity;

  for (const { cols, rows } of candidateGrids) {
    const { cellWidth, cellHeight, remainder } = calculateCellDimensions(
      sheetWidth,
      sheetHeight,
      cols,
      rows,
    );

    // Score based on remainder (lower is better) and cell aspect ratio
    const remainderScore = Math.abs(remainder.x) + Math.abs(remainder.y);
    const aspectRatio = cellWidth / cellHeight;
    // Prefer roughly square or portrait cells (1:1 to 1:2)
    const aspectScore = Math.abs(aspectRatio - 1) * 10;

    const totalScore = remainderScore + aspectScore;

    if (totalScore < bestScore && cellWidth > 0 && cellHeight > 0) {
      bestScore = totalScore;
      bestConfig = {
        columns: cols,
        rows: rows,
        cellWidth,
        cellHeight,
        xOffset: 0,
        yOffset: 0,
      };
    }
  }

  // Fallback to single cell if nothing works
  return (
    bestConfig ?? {
      columns: 1,
      rows: 1,
      cellWidth: sheetWidth,
      cellHeight: sheetHeight,
      xOffset: 0,
      yOffset: 0,
    }
  );
}

// ============================================================================
// GRID SNAPPING
// ============================================================================

/**
 * Snap a value to the nearest grid line.
 *
 * @param value - Value to snap
 * @param gridSize - Grid cell size
 * @param offset - Grid offset
 * @returns Snapped value
 */
export function snapToGrid(
  value: number,
  gridSize: number,
  offset: number = 0,
): number {
  const relativeValue = value - offset;
  const snappedRelative = Math.round(relativeValue / gridSize) * gridSize;
  return snappedRelative + offset;
}

/**
 * Get the cell position for a point within the grid.
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param config - Grid configuration
 * @returns Cell position or null if outside grid
 */
export function getCellAtPoint(
  x: number,
  y: number,
  config: GridConfig,
): CellPosition | null {
  const relativeX = x - config.xOffset;
  const relativeY = y - config.yOffset;

  if (relativeX < 0 || relativeY < 0) {
    return null;
  }

  const col = Math.floor(relativeX / config.cellWidth);
  const row = Math.floor(relativeY / config.cellHeight);

  if (col >= config.columns || row >= config.rows) {
    return null;
  }

  return { col, row };
}

/**
 * Get the bounding rectangle for a cell.
 *
 * @param position - Cell position
 * @param config - Grid configuration
 * @returns Cell bounding rectangle
 */
export function getCellBounds(
  position: CellPosition,
  config: GridConfig,
): { x: number; y: number; width: number; height: number } {
  return {
    x: config.xOffset + position.col * config.cellWidth,
    y: config.yOffset + position.row * config.cellHeight,
    width: config.cellWidth,
    height: config.cellHeight,
  };
}

/**
 * Generate a unique ID for a cell based on its position.
 *
 * @param position - Cell position
 * @returns Cell ID string
 */
export function getCellId(position: CellPosition): string {
  return `cell_${position.row}_${position.col}`;
}

/**
 * Parse a cell ID back to a position.
 *
 * @param id - Cell ID string
 * @returns Cell position or null if invalid
 */
export function parseCellId(id: string): CellPosition | null {
  const match = id.match(/^cell_(\d+)_(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    row: parseInt(match[1], 10),
    col: parseInt(match[2], 10),
  };
}

// ============================================================================
// GRID LINES
// ============================================================================

/**
 * Get all grid line positions for rendering.
 *
 * @param config - Grid configuration
 * @returns Arrays of x and y positions for grid lines
 */
export function getGridLines(config: GridConfig): {
  vertical: number[];
  horizontal: number[];
} {
  const vertical: number[] = [];
  const horizontal: number[] = [];

  // Vertical lines
  for (let col = 0; col <= config.columns; col++) {
    vertical.push(config.xOffset + col * config.cellWidth);
  }

  // Horizontal lines
  for (let row = 0; row <= config.rows; row++) {
    horizontal.push(config.yOffset + row * config.cellHeight);
  }

  return { vertical, horizontal };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate that a grid configuration fits within sheet dimensions.
 *
 * @param config - Grid configuration
 * @param sheetWidth - Sheet width
 * @param sheetHeight - Sheet height
 * @returns Validation result
 */
export function validateGridConfig(
  config: GridConfig,
  sheetWidth: number,
  sheetHeight: number,
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if grid fits within sheet
  const gridWidth = config.xOffset + config.columns * config.cellWidth;
  const gridHeight = config.yOffset + config.rows * config.cellHeight;

  if (gridWidth > sheetWidth) {
    errors.push(
      `Grid width (${gridWidth}px) exceeds sheet width (${sheetWidth}px)`,
    );
  }

  if (gridHeight > sheetHeight) {
    errors.push(
      `Grid height (${gridHeight}px) exceeds sheet height (${sheetHeight}px)`,
    );
  }

  // Check for uneven division
  const { remainder } = calculateCellDimensions(
    sheetWidth,
    sheetHeight,
    config.columns,
    config.rows,
  );

  if (remainder.x !== 0 || remainder.y !== 0) {
    warnings.push(
      `Sheet doesn't divide evenly: ${remainder.x}px horizontal, ${remainder.y}px vertical remainder`,
    );
  }

  // Check for reasonable cell sizes
  if (config.cellWidth < 10 || config.cellHeight < 10) {
    warnings.push("Cell size is very small (< 10px)");
  }

  if (config.cellWidth > 500 || config.cellHeight > 500) {
    warnings.push("Cell size is very large (> 500px)");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
