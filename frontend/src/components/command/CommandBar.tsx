"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { Command } from "lucide-react";
import {
  useAttentionStore,
  type AttentionEntry,
  type AttentionCategory,
} from "@/stores/attentionStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useGameStore } from "@/stores/gameStore";

// ============================================================================
// HELPERS
// ============================================================================

const CATEGORY_CONFIG: Record<
  AttentionCategory,
  { dot: string; label: string; badge: string }
> = {
  blocked: {
    dot: "bg-rose-500",
    label: "BLOCKED",
    badge: "bg-rose-500/20 text-rose-400 border-rose-500/40",
  },
  waiting: {
    dot: "bg-amber-500",
    label: "WAITING",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  },
  completed: {
    dot: "bg-emerald-500",
    label: "COMPLETED",
    badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
  idle: {
    dot: "bg-slate-500",
    label: "IDLE",
    badge: "bg-slate-500/20 text-slate-400 border-slate-500/40",
  },
};

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function AgentRow({
  entry,
  isSelected,
  onClick,
}: {
  entry: AttentionEntry;
  isSelected: boolean;
  onClick: () => void;
}): ReactNode {
  const cfg = CATEGORY_CONFIG[entry.category];
  // Snapshot current time as state so Date.now is not called directly during render
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
        isSelected ? "bg-slate-700/60" : "hover:bg-slate-800/60"
      }`}
    >
      {/* Urgency dot */}
      <div
        className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-white text-sm font-bold font-mono truncate">
            {entry.agentName}
          </span>
          {entry.floorName && (
            <span className="text-slate-500 text-xs font-mono truncate">
              · {entry.floorName}
            </span>
          )}
        </div>
        <div className="text-slate-400 text-xs leading-snug truncate mb-1.5">
          {entry.summary}
        </div>
        {/* Timeline */}
        {entry.timeline.length > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
            {entry.timeline.map((action, i) => (
              <span key={i} className="flex items-center gap-0.5">
                {i > 0 && <span className="text-slate-700">→</span>}
                <span>{action.icon}</span>
                <span className="truncate max-w-[60px]">{action.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Category badge */}
      <span
        className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${cfg.badge}`}
      >
        {entry.category === "idle"
          ? `IDLE ${Math.round((now - entry.lastActivityAt) / 60_000)}m`
          : cfg.label}
      </span>
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface CommandBarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandBar({ isOpen, onClose }: CommandBarProps): ReactNode {
  const entries = useAttentionStore((s) => s.entries);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter entries by search query
  const filtered = query
    ? entries.filter(
        (e) =>
          fuzzyMatch(query, e.agentName) ||
          fuzzyMatch(query, e.floorName) ||
          fuzzyMatch(query, e.summary),
      )
    : entries;

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      queueMicrotask(() => {
        setQuery("");
        setSelectedIndex(0);
      });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Clamp selection when list changes
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      queueMicrotask(() => setSelectedIndex(Math.max(0, filtered.length - 1)));
    }
  }, [filtered.length, selectedIndex]);

  const jumpToAgent = useCallback(
    (entry: AttentionEntry) => {
      onClose();

      // Navigate to the agent's floor if needed
      const store = useNavigationStore.getState();
      if (entry.floorId && store.view !== "floor") {
        store.goToFloor(entry.floorId);
      }

      // Focus the agent character
      useGameStore.getState().setFocusedCharacter({
        agentId: entry.agentId,
        isBoss: false,
        name: entry.agentName,
        currentTask: entry.summary,
        sessionId: useGameStore.getState().sessionId,
      });
    },
    [onClose],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[selectedIndex]) {
            jumpToAgent(filtered[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, selectedIndex, filtered, jumpToAgent, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[71] flex items-start justify-center pt-[15vh] pointer-events-none">
        <div
          className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
            <Command size={16} className="text-slate-500 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Search agents..."
              className="flex-1 bg-transparent text-white text-sm font-mono placeholder-slate-500 focus:outline-none"
            />
            <kbd className="text-[10px] text-slate-600 font-mono px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">
              ESC
            </kbd>
          </div>

          {/* Agent list */}
          <div className="max-h-[50vh] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500 text-sm font-mono">
                {entries.length === 0
                  ? "No agents active"
                  : "No matching agents"}
              </div>
            ) : (
              filtered.map((entry, i) => (
                <AgentRow
                  key={entry.agentId}
                  entry={entry}
                  isSelected={i === selectedIndex}
                  onClick={() => jumpToAgent(entry)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-700 flex items-center gap-4 text-[10px] text-slate-600 font-mono">
            <span>↑↓ navigate</span>
            <span>⏎ jump</span>
            <span>esc close</span>
          </div>
        </div>
      </div>
    </>
  );
}
