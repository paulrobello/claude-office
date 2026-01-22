/**
 * Sprite Sheet Builder Types
 *
 * Core type definitions for the sprite sheet builder tool.
 */

// ============================================================================
// GRID CONFIGURATION
// ============================================================================

export interface GridConfig {
  /** Number of columns in the grid */
  columns: number;
  /** Number of rows in the grid */
  rows: number;
  /** Width of each cell in pixels */
  cellWidth: number;
  /** Height of each cell in pixels */
  cellHeight: number;
  /** X offset where grid starts */
  xOffset: number;
  /** Y offset where grid starts */
  yOffset: number;
}

// ============================================================================
// CELL DATA
// ============================================================================

export interface CellPosition {
  /** Column index (0-based) */
  col: number;
  /** Row index (0-based) */
  row: number;
}

export interface CellData {
  /** Unique identifier for the cell */
  id: string;
  /** Position in the source grid */
  position: CellPosition;
  /** Extracted image data (base64 data URL) */
  imageData: string | null;
  /** Whether this cell has content (non-empty) */
  hasContent: boolean;
  /** Content bounds within the cell (if auto-detected) */
  contentBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// ============================================================================
// CHROMA KEY CONFIG
// ============================================================================

export interface ChromaKeyConfig {
  /** Whether chroma key removal is enabled */
  enabled: boolean;
  /** Target color to remove (hex format, e.g., "#FF00FF") */
  targetColor: string;
  /** Tolerance for color matching (0-255) */
  tolerance: number;
  /** Edge feathering amount in pixels */
  feathering: number;
  /** Use flood fill from corners vs global replace */
  useFloodFill: boolean;
}

export const DEFAULT_CHROMA_KEY_CONFIG: ChromaKeyConfig = {
  enabled: true,
  targetColor: "#FF00FF",
  tolerance: 30,
  feathering: 1,
  useFloodFill: true,
};

// ============================================================================
// BUILDER STATE
// ============================================================================

export interface BuilderState {
  /** Source image URL (can be local path or blob URL) */
  sourceImageUrl: string | null;
  /** Source image dimensions */
  sourceImageSize: { width: number; height: number } | null;
  /** Grid configuration */
  gridConfig: GridConfig;
  /** Extracted cells */
  cells: CellData[];
  /** Selected cell IDs for export */
  selectedCellIds: string[];
  /** Chroma key configuration */
  chromaKeyConfig: ChromaKeyConfig;
  /** Output arrangement (order of cells in export) */
  outputOrder: string[];
  /** Output grid configuration */
  outputGridConfig: {
    columns: number;
    rows: number;
  };
}

export const DEFAULT_GRID_CONFIG: GridConfig = {
  columns: 8,
  rows: 8,
  cellWidth: 116,
  cellHeight: 144,
  xOffset: 0,
  yOffset: 0,
};

// ============================================================================
// EXPORT CONFIG
// ============================================================================

export interface ExportConfig {
  /** Output format */
  format: "png" | "webp";
  /** Output filename (without extension) */
  filename: string;
  /** Whether to include transparency */
  transparent: boolean;
  /** Scale factor for output */
  scale: number;
}

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  format: "png",
  filename: "sprite_sheet",
  transparent: true,
  scale: 1,
};

// ============================================================================
// ANIMATION CONFIG (for Preview tab)
// ============================================================================

export interface AnimationConfig {
  /** Total animation duration in ms */
  durationMs: number;
  /** Whether the animation loops */
  loop: boolean;
}

// ============================================================================
// PRESET CONFIG
// ============================================================================

export interface PresetConfig {
  name: string;
  sheetPath: string;
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  xOffset: number;
  yOffset: number;
  durationMs: number;
  loop: boolean;
}

export const PRESETS: PresetConfig[] = [
  {
    name: "Idle (8x8 grid)",
    sheetPath: "/sprites/agent1_idle_sheet.png",
    columns: 8,
    rows: 8,
    frameWidth: 116,
    frameHeight: 144,
    xOffset: 0,
    yOffset: 5,
    durationMs: 2000,
    loop: true,
  },
  {
    name: "Walk (8x8 grid)",
    sheetPath: "/sprites/agent1_walk_sheet.png",
    columns: 8,
    rows: 8,
    frameWidth: 116,
    frameHeight: 144,
    xOffset: 0,
    yOffset: 0,
    durationMs: 800,
    loop: true,
  },
  {
    name: "Typing (8x1 strip)",
    sheetPath: "/sprites/agent1_typing_sheet.png",
    columns: 8,
    rows: 1,
    frameWidth: 116,
    frameHeight: 144,
    xOffset: 0,
    yOffset: 0,
    durationMs: 400,
    loop: true,
  },
  {
    name: "Handoff (4x1 strip)",
    sheetPath: "/sprites/agent1_handoff_sheet.png",
    columns: 4,
    rows: 1,
    frameWidth: 232,
    frameHeight: 411,
    xOffset: 0,
    yOffset: 343,
    durationMs: 600,
    loop: false,
  },
  {
    name: "Coffee (4x1 strip)",
    sheetPath: "/sprites/agent1_coffee_sheet.png",
    columns: 4,
    rows: 1,
    frameWidth: 232,
    frameHeight: 699,
    xOffset: 0,
    yOffset: 0,
    durationMs: 400,
    loop: true,
  },
];

export const DIRECTIONS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"] as const;
export type DirectionLabel = (typeof DIRECTIONS)[number];
