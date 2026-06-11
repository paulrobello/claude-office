/**
 * Command Center layout — "Open Plan / Columns".
 *
 * A single open office floor (matching the main office) with a decorated top
 * wall. The floor is split into four vertical status columns (left→right by
 * priority): Needs-you, Working, Done, Ended. Each column holds a 2×4 grid of
 * workstations; overflow is summarised as "+N more".
 */

import type { OverviewBucket, Position } from "@/types";
import type { TranslationKey } from "@/i18n";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";

/** Status columns, including the frontend-only "ended" bucket. */
export type ZoneKey = OverviewBucket | "ended";

/** What fixed furniture a column shows. */
export type ZoneKind = "desks" | "lounge" | "exit";

export interface ZoneDef {
  key: ZoneKey;
  kind: ZoneKind;
  labelKey: TranslationKey;
  emoji: string;
  color: number; // PixiJS hex
  cssColor: string;
  x: number; // column left
  y: number; // column top (floor top)
  w: number; // column width
  h: number; // column height
}

/** Height of the decorated top wall strip. */
export const TOP_WALL_H = 140;
/** Floor furniture strip begins here (below the desk grid). */
export const FLOOR_DECOR_Y = CANVAS_HEIGHT - 96;

const COL_W = CANVAS_WIDTH / 4; // 320
const FLOOR_TOP = TOP_WALL_H;
const FLOOR_H = CANVAS_HEIGHT - TOP_WALL_H;

const COL_DEFS: Array<{
  key: ZoneKey;
  kind: ZoneKind;
  labelKey: TranslationKey;
  emoji: string;
  color: number;
  cssColor: string;
}> = [
  {
    key: "needs_you",
    kind: "desks",
    labelKey: "commandCenter.zone.needsYou",
    emoji: "⚠",
    color: 0xfbbf24,
    cssColor: "#fbbf24",
  },
  {
    key: "working",
    kind: "desks",
    labelKey: "commandCenter.zone.working",
    emoji: "\u{1F7E2}",
    color: 0x22c55e,
    cssColor: "#22c55e",
  },
  {
    key: "done",
    kind: "lounge",
    labelKey: "commandCenter.zone.done",
    emoji: "✅",
    color: 0x3b82f6,
    cssColor: "#3b82f6",
  },
  {
    key: "ended",
    kind: "exit",
    labelKey: "commandCenter.zone.ended",
    emoji: "⚪",
    color: 0x64748b,
    cssColor: "#64748b",
  },
];

export const ZONES: ZoneDef[] = COL_DEFS.map((c, i) => ({
  ...c,
  x: i * COL_W,
  y: FLOOR_TOP,
  w: COL_W,
  h: FLOOR_H,
}));

export const ZONE_ORDER: ZoneKey[] = ["needs_you", "working", "done", "ended"];

export const ZONE_BY_KEY: Record<ZoneKey, ZoneDef> = ZONES.reduce(
  (acc, z) => {
    acc[z.key] = z;
    return acc;
  },
  {} as Record<ZoneKey, ZoneDef>,
);

// Workstation grid within a column: 2 sub-columns × 4 rows.
const SLOT_COLS = 2;
const HEADER_H = 44;
const COL_PAD_X = 16;
const SUB_COL_GAP = 152;
const ROW_TOP = FLOOR_TOP + HEADER_H + 70; // first row's feet
const ROW_GAP = 168;

/** Max visible workstations per column before collapsing to "+N more". */
export const MAX_SLOTS = SLOT_COLS * 4; // 8

/** Pixel position (agent feet) for the slot at *index* within *zone* (column). */
export function slotPosition(zone: ZoneDef, index: number): Position {
  const col = index % SLOT_COLS;
  const row = Math.floor(index / SLOT_COLS);
  const x = zone.x + COL_PAD_X + 68 + col * SUB_COL_GAP;
  const y = ROW_TOP + row * ROW_GAP;
  return { x, y };
}
