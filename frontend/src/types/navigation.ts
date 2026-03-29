/** View modes for the two-tier navigation */
export type ViewMode = "building" | "floor";

/** Room configuration from backend */
export interface RoomConfig {
  id: string;
  repo_name: string;
}

/** Floor configuration from backend */
export interface FloorConfig {
  id: string;
  name: string;
  floor_number: number;
  accent: string;
  icon: string;
  rooms: RoomConfig[];
}

/** Full building configuration from backend */
export interface BuildingConfig {
  building_name: string;
  floors: FloorConfig[];
}

/** Direction of the view transition animation */
export type TransitionDirection = "zoom-in" | "zoom-out" | null;
