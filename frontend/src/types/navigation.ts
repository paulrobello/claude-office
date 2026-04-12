/**
 * Navigation types for building/floor view system.
 *
 * "single" mode is the default — no building navigation, just the office.
 * "building" and "floor" modes activate when the user configures floors.
 */

/** Current view mode */
export type ViewMode = "single" | "building" | "floor";

/** Room configuration mapped to a repository */
export interface RoomConfig {
  id: string;
  repoName: string;
}

/** Floor configuration from building config */
export interface FloorConfig {
  id: string;
  name: string;
  floorNumber: number;
  accent: string;
  icon: string;
  rooms: RoomConfig[];
}

/** Full building configuration */
export interface BuildingConfig {
  buildingName: string;
  floors: FloorConfig[];
}

/** Direction of view transition animation */
export type TransitionDirection = "zoom-in" | "zoom-out" | null;
