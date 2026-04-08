"use client";

import {
  Activity,
  Play,
  RefreshCw,
  Bug,
  Trash2,
  HelpCircle,
  Settings,
  UserX,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "next-themes";

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
  onCleanupAgents: () => void;
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
  onCleanupAgents,
  onToggleDebug,
  onOpenSettings,
  onOpenHelp,
}: HeaderControlsProps): React.ReactNode {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const themeLabel = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";

  return (
    <div className="flex gap-4 items-center">
      <button
        onClick={onSimulate}
        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 rounded text-xs font-bold transition-colors"
      >
        <Play size={14} fill="currentColor" />
        {t("header.simulate")}
      </button>

      <button
        onClick={onReset}
        className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded text-xs font-bold transition-colors"
      >
        <RefreshCw size={14} />
        {t("header.reset")}
      </button>

      <button
        onClick={onClearDB}
        className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded text-xs font-bold transition-colors"
      >
        <Trash2 size={14} />
        {t("header.clearDb")}
      </button>

      <button
        onClick={onCleanupAgents}
        className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 rounded text-xs font-bold transition-colors"
      >
        <UserX size={14} />
        {t("header.cleanupAgents")}
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
        {debugMode ? t("header.debugOn") : t("header.debugOff")}
      </button>

      <button
        onClick={cycleTheme}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors"
        title={`Theme: ${themeLabel}`}
      >
        <ThemeIcon size={14} />
      </button>

      <button
        onClick={onOpenSettings}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors"
      >
        <Settings size={14} />
        {t("header.settings")}
      </button>

      <button
        onClick={onOpenHelp}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors"
      >
        <HelpCircle size={14} />
        {t("header.help")}
      </button>

      {/* Connection and AI status */}
      <div className="flex flex-col items-end border-l border-slate-800 pl-4">
        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest leading-none mb-1">
          {t("header.status")}
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
            {isConnected ? t("header.connected") : t("header.disconnected")}
          </div>
          <div
            className={`flex items-center gap-1.5 font-mono text-xs ${
              aiSummaryEnabled ? "text-violet-400" : "text-slate-500"
            }`}
          >
            <span className="text-[10px]">AI</span>
            {aiSummaryEnabled ? t("header.aiOn") : t("header.aiOff")}
          </div>
        </div>
      </div>
    </div>
  );
}
