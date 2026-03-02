"use client";

import {
  Activity,
  Play,
  RefreshCw,
  Bug,
  Trash2,
  HelpCircle,
  Settings,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface HeaderControlsProps {
  isConnected: boolean;
  debugMode: boolean;
  aiSummaryEnabled: boolean | null;
  onSimulate: () => Promise<void>;
  onReset: () => void;
  onClearDB: () => void;
  onToggleDebug: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Desktop-only header controls: action buttons (Simulate, Reset, Clear DB,
 * Debug, Settings, Help) and the connection/AI status display.
 *
 * Hidden on mobile — the MobileDrawer handles those actions instead.
 */
export function HeaderControls({
  isConnected,
  debugMode,
  aiSummaryEnabled,
  onSimulate,
  onReset,
  onClearDB,
  onToggleDebug,
  onOpenSettings,
  onOpenHelp,
}: HeaderControlsProps): React.ReactNode {
  return (
    <div className="flex gap-4 items-center">
      <button
        onClick={onSimulate}
        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 rounded text-xs font-bold transition-colors"
      >
        <Play size={14} fill="currentColor" />
        SIMULATE
      </button>

      <button
        onClick={onReset}
        className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded text-xs font-bold transition-colors"
      >
        <RefreshCw size={14} />
        RESET
      </button>

      <button
        onClick={onClearDB}
        className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded text-xs font-bold transition-colors"
      >
        <Trash2 size={14} />
        CLEAR DB
      </button>

      <button
        onClick={onToggleDebug}
        className={`flex items-center gap-2 px-3 py-1.5 border rounded text-xs font-bold transition-colors ${
          debugMode
            ? "bg-green-500/20 text-green-400 border-green-500/30"
            : "bg-slate-500/10 text-slate-400 border-slate-500/30 hover:bg-slate-500/20"
        }`}
      >
        <Bug size={14} />
        DEBUG {debugMode ? "ON" : "OFF"}
      </button>

      <button
        onClick={onOpenSettings}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors"
      >
        <Settings size={14} />
        SETTINGS
      </button>

      <button
        onClick={onOpenHelp}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors"
      >
        <HelpCircle size={14} />
        HELP
      </button>

      {/* Connection and AI status */}
      <div className="flex flex-col items-end border-l border-slate-800 pl-4">
        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest leading-none mb-1">
          Status
        </span>
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-1.5 font-mono text-xs ${
              isConnected ? "text-emerald-400" : "text-rose-500"
            }`}
          >
            <Activity
              size={12}
              className={isConnected ? "animate-pulse" : ""}
            />
            {isConnected ? "CONNECTED" : "DISCONNECTED"}
          </div>
          <div
            className={`flex items-center gap-1.5 font-mono text-xs ${
              aiSummaryEnabled ? "text-violet-400" : "text-slate-500"
            }`}
          >
            <span className="text-[10px]">AI</span>
            {aiSummaryEnabled ? "ON" : "OFF"}
          </div>
        </div>
      </div>
    </div>
  );
}
