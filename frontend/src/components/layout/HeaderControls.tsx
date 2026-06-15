"use client";

import { Activity, HelpCircle, Settings, Bell, LayoutGrid } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useNavigationStore } from "@/stores/navigationStore";
import { useAttentionStore, selectUnreadCount } from "@/stores/attentionStore";
import { HeaderMoreMenu } from "@/components/layout/HeaderMoreMenu";

// ============================================================================
// TYPES
// ============================================================================

interface HeaderControlsProps {
  isConnected: boolean;
  debugMode: boolean;
  aiSummaryEnabled: boolean | null;
  /** Number of active sessions — gates the Command Center button (>= 2). */
  activeSessionCount: number;
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
 * Desktop-only header controls. Frequently-used entry points (Command Center,
 * Settings, Help, attention queue) stay visible; the rarely-used
 * developer/maintenance actions live in the "⋯" overflow menu, and the tour
 * moved into the Help modal — keeping the header readable.
 *
 * Hidden on mobile — the MobileDrawer handles those actions instead.
 */
export function HeaderControls({
  isConnected,
  debugMode,
  aiSummaryEnabled,
  activeSessionCount,
  onSimulate,
  onReset,
  onClearDB,
  onToggleDebug,
  onOpenSettings,
  onOpenHelp,
}: HeaderControlsProps): React.ReactNode {
  const { t } = useTranslation();
  const view = useNavigationStore((s) => s.view);
  const goToCommand = useNavigationStore((s) => s.goToCommand);
  const unreadCount = useAttentionStore(selectUnreadCount);
  const openCommandBar = useAttentionStore((s) => s.openCommandBar);

  return (
    <div className="flex gap-3 items-center">
      {unreadCount > 0 && (
        <button
          onClick={openCommandBar}
          className="relative flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 rounded text-xs font-bold transition-colors"
          title="Attention Queue"
        >
          <Bell className="w-3.5 h-3.5" />
          <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        </button>
      )}

      {/* Command Center — cross-terminal overview (>= 2 active sessions) */}
      {activeSessionCount >= 2 && (
        <button
          onClick={goToCommand}
          title={t("commandCenter.title")}
          className={`flex items-center gap-2 px-3 py-1.5 border rounded text-xs font-bold transition-colors ${
            view === "command"
              ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
              : "bg-sky-500/10 text-sky-500 border-sky-500/30 hover:bg-sky-500/20"
          }`}
        >
          <LayoutGrid size={14} />
          {t("header.commandCenter")}
        </button>
      )}

      <button
        onClick={onOpenSettings}
        data-tour-id="settings-btn"
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

      {/* Rarely-used developer/maintenance actions */}
      <HeaderMoreMenu
        debugMode={debugMode}
        onSimulate={onSimulate}
        onReset={onReset}
        onClearDB={onClearDB}
        onToggleDebug={onToggleDebug}
      />

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
