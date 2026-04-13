"use client";

import {
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { useAttentionStore } from "@/stores/attentionStore";
import { useGameStore } from "@/stores/gameStore";
import { useTranslation } from "@/hooks/useTranslation";

/** Simple character-by-character fuzzy match. */
function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

interface CommandEntry {
  id: string;
  label: string;
  icon: string;
  action: () => void;
}

export default function CommandBar(): ReactNode {
  const isOpen = useAttentionStore((s) => s.isCommandBarOpen);
  const filter = useAttentionStore((s) => s.commandFilter);
  const closeCommandBar = useAttentionStore((s) => s.closeCommandBar);
  const setCommandFilter = useAttentionStore((s) => s.setCommandFilter);
  const clearAllToasts = useAttentionStore((s) => s.clearAllToasts);
  const openFocusPopup = useAttentionStore((s) => s.openFocusPopup);

  const agents = useGameStore((s) => s.agents);
  const setDebugMode = useGameStore((s) => s.setDebugMode);
  const toggleDebugOverlay = useGameStore((s) => s.toggleDebugOverlay);

  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Build command list
  const commands: CommandEntry[] = useMemo(() => {
    const cmds: CommandEntry[] = [];

    // Per-agent focus commands
    agents.forEach((agent) => {
      if (!agent.name) return;
      cmds.push({
        id: `focus-${agent.id}`,
        label: t("attention.commandBar.focusAgent").replace(
          "{name}",
          agent.name,
        ),
        icon: "\u26A1",
        action: () => {
          openFocusPopup(agent.id, window.innerWidth / 2, 200);
          closeCommandBar();
        },
      });
    });

    // Focus boss terminal
    cmds.push({
      id: "focus-boss",
      label: t("attention.commandBar.focusBoss"),
      icon: "\uD83D\uDC54",
      action: () => {
        openFocusPopup("boss", window.innerWidth / 2, 200);
        closeCommandBar();
      },
    });

    // Utility commands
    cmds.push({
      id: "dismiss-all",
      label: t("attention.commandBar.dismissAll"),
      icon: "\uD83D\uDDD1\uFE0F",
      action: () => {
        clearAllToasts();
        closeCommandBar();
      },
    });

    cmds.push({
      id: "toggle-debug",
      label: t("attention.commandBar.toggleDebug"),
      icon: "\uD83D\uDC1B",
      action: () => {
        setDebugMode(!useGameStore.getState().debugMode);
        closeCommandBar();
      },
    });

    cmds.push({
      id: "toggle-paths",
      label: t("attention.commandBar.togglePaths"),
      icon: "\uD83D\uDEE4\uFE0F",
      action: () => {
        toggleDebugOverlay("paths");
        closeCommandBar();
      },
    });

    cmds.push({
      id: "toggle-queue-slots",
      label: t("attention.commandBar.toggleQueueSlots"),
      icon: "\uD83D\uDD22",
      action: () => {
        toggleDebugOverlay("queueSlots");
        closeCommandBar();
      },
    });

    cmds.push({
      id: "toggle-phase-labels",
      label: t("attention.commandBar.togglePhaseLabels"),
      icon: "\uD83C\uDFF7\uFE0F",
      action: () => {
        toggleDebugOverlay("phaseLabels");
        closeCommandBar();
      },
    });

    cmds.push({
      id: "toggle-obstacles",
      label: t("attention.commandBar.toggleObstacles"),
      icon: "\uD83D\uDEA7",
      action: () => {
        toggleDebugOverlay("obstacles");
        closeCommandBar();
      },
    });

    return cmds;
  }, [
    agents,
    t,
    closeCommandBar,
    clearAllToasts,
    openFocusPopup,
    setDebugMode,
    toggleDebugOverlay,
  ]);

  // Filter commands
  const filtered = useMemo(() => {
    if (!filter) return commands;
    return commands.filter((c) => fuzzyMatch(filter, c.label));
  }, [commands, filter]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        closeCommandBar();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
      }
    },
    [closeCommandBar, filtered, selectedIndex],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeCommandBar();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Command palette */}
      <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800">
          <span className="text-neutral-500">{"\uD83D\uDD0D"}</span>
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => {
              setCommandFilter(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("attention.commandBar.placeholder")}
            className="flex-1 bg-transparent text-neutral-200 placeholder-neutral-600 outline-none text-sm font-mono"
          />
          <kbd className="text-[10px] text-neutral-600 border border-neutral-700 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-neutral-600 text-sm">
              {t("attention.commandBar.noResults")}
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={cmd.action}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                  i === selectedIndex
                    ? "bg-purple-500/20 text-purple-300"
                    : "text-neutral-400 hover:bg-neutral-800"
                }`}
              >
                <span className="text-base">{cmd.icon}</span>
                <span className="font-mono">{cmd.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
