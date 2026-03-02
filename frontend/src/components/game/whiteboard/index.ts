/**
 * Whiteboard sub-components barrel export.
 *
 * Exports all 11 display mode components and the mode registry so that
 * Whiteboard.tsx can import everything from a single path.
 */

export { TodoListMode } from "./TodoListMode";
export type { TodoListModeProps } from "./TodoListMode";

export { RemoteWorkersMode } from "./RemoteWorkersMode";
export type { RemoteWorkersModeProps } from "./RemoteWorkersMode";

export { ToolPizzaMode, PIZZA_COLORS } from "./ToolPizzaMode";
export type { ToolPizzaModeProps } from "./ToolPizzaMode";

export { OrgChartMode } from "./OrgChartMode";
export type { OrgChartModeProps } from "./OrgChartMode";

export { StonksMode } from "./StonksMode";
export type { StonksModeProps } from "./StonksMode";

export { WeatherMode } from "./WeatherMode";
export type { WeatherModeProps } from "./WeatherMode";

export { SafetyBoardMode } from "./SafetyBoardMode";
export type { SafetyBoardModeProps } from "./SafetyBoardMode";

export { TimelineMode } from "./TimelineMode";
export type { TimelineModeProps } from "./TimelineMode";

export { NewsTickerMode } from "./NewsTickerMode";
export type { NewsTickerModeProps } from "./NewsTickerMode";

export { CoffeeMode } from "./CoffeeMode";
export type { CoffeeModeProps } from "./CoffeeMode";

export { HeatMapMode } from "./HeatMapMode";
export type { HeatMapModeProps } from "./HeatMapMode";

export {
  MODE_INFO,
  WHITEBOARD_MODE_COUNT,
  getNextMode,
  getModeInfo,
} from "./WhiteboardModeRegistry";
export type { ModeInfo } from "./WhiteboardModeRegistry";
