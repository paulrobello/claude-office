/**
 * Sprite Builder Store
 *
 * Zustand store for managing sprite sheet builder state.
 */

import { create } from "zustand";
import type {
  GridConfig,
  CellData,
  ChromaKeyConfig,
  BuilderState,
} from "../lib/types";
import { DEFAULT_GRID_CONFIG, DEFAULT_CHROMA_KEY_CONFIG } from "../lib/types";
import {
  loadImage,
  extractAllCells,
  assembleSpriteSheetAsync,
} from "../lib/imageProcessing";
import { autoDetectGrid } from "../lib/gridCalculations";

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface SpriteBuilderStore extends BuilderState {
  // Source image actions
  setSourceImage: (url: string) => Promise<void>;
  clearSourceImage: () => void;

  // Grid configuration actions
  setGridConfig: (config: Partial<GridConfig>) => void;
  autoDetectGridConfig: () => void;

  // Cell actions
  extractCells: () => Promise<void>;
  selectCell: (id: string) => void;
  deselectCell: (id: string) => void;
  toggleCellSelection: (id: string) => void;
  selectAllCells: () => void;
  deselectAllCells: () => void;
  selectCellsWithContent: () => void;

  // Output order actions
  reorderCells: (fromIndex: number, toIndex: number) => void;
  setOutputGridConfig: (config: { columns: number; rows: number }) => void;

  // Chroma key actions
  setChromaKeyConfig: (config: Partial<ChromaKeyConfig>) => void;

  // Export actions
  generateOutputSheet: () => Promise<string | null>;

  // Internal state
  _sourceImage: HTMLImageElement | null;
  _isProcessing: boolean;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useSpriteBuilder = create<SpriteBuilderStore>((set, get) => ({
  // Initial state
  sourceImageUrl: null,
  sourceImageSize: null,
  gridConfig: DEFAULT_GRID_CONFIG,
  cells: [],
  selectedCellIds: [],
  chromaKeyConfig: DEFAULT_CHROMA_KEY_CONFIG,
  outputOrder: [],
  outputGridConfig: { columns: 6, rows: 8 },
  _sourceImage: null,
  _isProcessing: false,

  // Source image actions
  setSourceImage: async (url: string) => {
    set({ _isProcessing: true });
    try {
      const img = await loadImage(url);
      const detectedGrid = autoDetectGrid(img.width, img.height);

      set({
        sourceImageUrl: url,
        sourceImageSize: { width: img.width, height: img.height },
        gridConfig: detectedGrid,
        _sourceImage: img,
        cells: [],
        selectedCellIds: [],
        outputOrder: [],
      });
    } catch (error) {
      console.error("Failed to load image:", error);
    } finally {
      set({ _isProcessing: false });
    }
  },

  clearSourceImage: () => {
    set({
      sourceImageUrl: null,
      sourceImageSize: null,
      _sourceImage: null,
      cells: [],
      selectedCellIds: [],
      outputOrder: [],
    });
  },

  // Grid configuration actions
  setGridConfig: (config: Partial<GridConfig>) => {
    set((state) => ({
      gridConfig: { ...state.gridConfig, ...config },
      // Clear cells when grid changes (need to re-extract)
      cells: [],
      selectedCellIds: [],
      outputOrder: [],
    }));
  },

  autoDetectGridConfig: () => {
    const { sourceImageSize } = get();
    if (!sourceImageSize) return;

    const detected = autoDetectGrid(
      sourceImageSize.width,
      sourceImageSize.height,
    );
    set({
      gridConfig: detected,
      cells: [],
      selectedCellIds: [],
      outputOrder: [],
    });
  },

  // Cell actions
  extractCells: async () => {
    const { _sourceImage, gridConfig, chromaKeyConfig } = get();
    if (!_sourceImage) return;

    set({ _isProcessing: true });
    try {
      const cells = await extractAllCells(
        _sourceImage,
        gridConfig,
        chromaKeyConfig,
      );
      const selectedIds = cells.filter((c) => c.hasContent).map((c) => c.id);

      set({
        cells,
        selectedCellIds: selectedIds,
        outputOrder: selectedIds,
      });
    } catch (error) {
      console.error("Failed to extract cells:", error);
    } finally {
      set({ _isProcessing: false });
    }
  },

  selectCell: (id: string) => {
    set((state) => {
      if (state.selectedCellIds.includes(id)) return state;
      const newSelected = [...state.selectedCellIds, id];
      return {
        selectedCellIds: newSelected,
        outputOrder: [...state.outputOrder, id],
      };
    });
  },

  deselectCell: (id: string) => {
    set((state) => ({
      selectedCellIds: state.selectedCellIds.filter((cid) => cid !== id),
      outputOrder: state.outputOrder.filter((cid) => cid !== id),
    }));
  },

  toggleCellSelection: (id: string) => {
    const { selectedCellIds } = get();
    if (selectedCellIds.includes(id)) {
      get().deselectCell(id);
    } else {
      get().selectCell(id);
    }
  },

  selectAllCells: () => {
    const { cells } = get();
    const allIds = cells.map((c) => c.id);
    set({
      selectedCellIds: allIds,
      outputOrder: allIds,
    });
  },

  deselectAllCells: () => {
    set({
      selectedCellIds: [],
      outputOrder: [],
    });
  },

  selectCellsWithContent: () => {
    const { cells } = get();
    const contentIds = cells.filter((c) => c.hasContent).map((c) => c.id);
    set({
      selectedCellIds: contentIds,
      outputOrder: contentIds,
    });
  },

  // Output order actions
  reorderCells: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const newOrder = [...state.outputOrder];
      const [moved] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, moved);
      return { outputOrder: newOrder };
    });
  },

  setOutputGridConfig: (config: { columns: number; rows: number }) => {
    set({ outputGridConfig: config });
  },

  // Chroma key actions
  setChromaKeyConfig: (config: Partial<ChromaKeyConfig>) => {
    set((state) => ({
      chromaKeyConfig: { ...state.chromaKeyConfig, ...config },
    }));
  },

  // Export actions
  generateOutputSheet: async () => {
    const { cells, outputOrder, outputGridConfig, gridConfig } = get();

    if (outputOrder.length === 0) return null;

    // Get cells in order
    const orderedCells = outputOrder
      .map((id) => cells.find((c) => c.id === id))
      .filter((c): c is CellData => c !== undefined);

    try {
      const dataUrl = await assembleSpriteSheetAsync(
        orderedCells,
        outputGridConfig.columns,
        gridConfig.cellWidth,
        gridConfig.cellHeight,
      );
      return dataUrl;
    } catch (error) {
      console.error("Failed to generate output sheet:", error);
      return null;
    }
  },
}));
