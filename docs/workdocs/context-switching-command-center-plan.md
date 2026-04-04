# Context Switching Command Center — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AttentionEngine (urgency scoring) + CommandBar (CMD+K) + notification layer so the Panopticon user can instantly see which agents need attention and jump to them with full context.

**Architecture:** AttentionEngine is a Zustand store that subscribes to gameStore agents and derives urgency scores. CommandBar is a keyboard-driven modal overlay showing ranked agents. Notification layer adds a header badge and toast alerts. All frontend-only — no backend changes.

**Tech Stack:** React 18, Zustand (subscribeWithSelector), existing gameStore/navigationStore, lucide-react, Tailwind CSS.

---

### Task 1: AttentionEngine Zustand store

**Files:**
- Create: `frontend/src/stores/attentionStore.ts`

- [ ] **Step 1: Create the attention store with types and scoring logic**

Create `frontend/src/stores/attentionStore.ts`:

```typescript
"use client";

import { create } from "zustand";
import { useGameStore } from "@/stores/gameStore";
import type { AgentAnimationState } from "@/stores/gameStore";
import type { AgentState as BackendAgentState } from "@/types";

// ============================================================================
// TYPES
// ============================================================================

export interface TimelineAction {
  icon: string;
  label: string;
}

export type AttentionCategory = "blocked" | "waiting" | "completed" | "idle";

export interface AttentionEntry {
  agentId: string;
  agentName: string;
  floorId: string | null;
  floorName: string;
  urgencyScore: number;
  category: AttentionCategory;
  summary: string;
  timeline: TimelineAction[];
  lastActivityAt: number;
}

interface AttentionState {
  entries: AttentionEntry[];
  activeCount: number;
  highestUrgency: AttentionCategory | null;
  pendingToasts: AttentionEntry[];
  soundEnabled: boolean;

  setSoundEnabled: (enabled: boolean) => void;
  dismissToast: (agentId: string) => void;
  dismissAllToasts: () => void;
}

// ============================================================================
// SCORING
// ============================================================================

const BLOCKED_KEYWORDS = ["error", "permission", "denied", "failed", "failure", "crash", "exception"];
const WAITING_STATES: BackendAgentState[] = ["waiting", "waiting_permission"];
const COMPLETED_STATES: BackendAgentState[] = ["completed", "reporting_done"];

function categorizeAgent(agent: AgentAnimationState, now: number): { category: AttentionCategory; score: number } {
  const state = agent.backendState;
  const bubbleText = agent.bubble.content?.text?.toLowerCase() ?? "";

  // Priority 1: Blocked (90-100)
  if (
    state === "waiting_permission" ||
    BLOCKED_KEYWORDS.some((kw) => bubbleText.includes(kw))
  ) {
    return { category: "blocked", score: 95 };
  }

  // Priority 2: Waiting for input (70-89)
  if (WAITING_STATES.includes(state)) {
    return { category: "waiting", score: 80 };
  }

  // Priority 3: Completed (40-69)
  if (COMPLETED_STATES.includes(state)) {
    return { category: "completed", score: 55 };
  }

  // Priority 4: Idle — score scales with duration
  if (state === "idle" || state === "working") {
    // Use a simple heuristic: if agent is not typing and has no recent bubble, consider idle
    if (!agent.isTyping && !agent.bubble.content) {
      const idleMs = now - (agent.bubble.displayStartTime ?? now);
      const idleMinutes = idleMs / 60_000;
      if (idleMinutes >= 2) {
        const score = Math.min(39, 10 + Math.floor(idleMinutes * 2));
        return { category: "idle", score };
      }
    }
  }

  return { category: "idle", score: 0 };
}

function buildTimeline(agent: AgentAnimationState): TimelineAction[] {
  // Derive from agent's current state — in the future this can be expanded
  // to track actual event history per agent
  const timeline: TimelineAction[] = [];

  if (agent.currentTask) {
    timeline.push({ icon: "📋", label: agent.currentTask.slice(0, 20) });
  }

  if (agent.isTyping) {
    timeline.push({ icon: "⌨️", label: "typing" });
  }

  if (agent.bubble.content) {
    const icon = agent.bubble.content.icon ?? "💬";
    timeline.push({ icon, label: agent.bubble.content.text?.slice(0, 20) ?? "" });
  }

  return timeline.slice(-4);
}

// ============================================================================
// STORE
// ============================================================================

const MAX_TOASTS = 2;
const TOAST_DEBOUNCE_MS = 10_000;
const lastToastTime = new Map<string, number>();

export const useAttentionStore = create<AttentionState>()((set, get) => ({
  entries: [],
  activeCount: 0,
  highestUrgency: null,
  pendingToasts: [],
  soundEnabled: false,

  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),

  dismissToast: (agentId) =>
    set((state) => ({
      pendingToasts: state.pendingToasts.filter((t) => t.agentId !== agentId),
    })),

  dismissAllToasts: () => set({ pendingToasts: [] }),
}));

// ============================================================================
// SUBSCRIPTION — react to gameStore agent changes
// ============================================================================

function recomputeAttention(): void {
  const agents = useGameStore.getState().agents;
  const now = Date.now();

  const entries: AttentionEntry[] = [];

  for (const agent of agents.values()) {
    const { category, score } = categorizeAgent(agent, now);
    if (score <= 0) continue;

    entries.push({
      agentId: agent.id,
      agentName: agent.name ?? `Agent ${agent.number}`,
      floorId: null, // Floor association will come from session data
      floorName: "",
      urgencyScore: score,
      category,
      summary: agent.bubble.content?.text ?? agent.currentTask ?? "No activity",
      timeline: buildTimeline(agent),
      lastActivityAt: agent.bubble.displayStartTime ?? now,
    });
  }

  // Sort by urgency score descending
  entries.sort((a, b) => b.urgencyScore - a.urgencyScore);

  const highestUrgency = entries.length > 0 ? entries[0].category : null;
  const activeCount = entries.length;

  // Determine new toasts (blocked/waiting agents not recently toasted)
  const currentToasts = useAttentionStore.getState().pendingToasts;
  const newToasts = [...currentToasts];

  for (const entry of entries) {
    if (entry.category !== "blocked" && entry.category !== "waiting") continue;

    const lastTime = lastToastTime.get(entry.agentId) ?? 0;
    if (now - lastTime < TOAST_DEBOUNCE_MS) continue;

    const alreadyToasted = newToasts.some((t) => t.agentId === entry.agentId);
    if (alreadyToasted) continue;

    lastToastTime.set(entry.agentId, now);
    newToasts.push(entry);

    // Play sound for blocked agents
    if (entry.category === "blocked" && useAttentionStore.getState().soundEnabled) {
      try {
        const audio = new Audio("/sounds/ping.mp3");
        audio.volume = 0.3;
        audio.play().catch(() => {});
      } catch {
        // Ignore audio errors
      }
    }
  }

  useAttentionStore.setState({
    entries,
    activeCount,
    highestUrgency,
    pendingToasts: newToasts.slice(-MAX_TOASTS),
  });
}

// Subscribe to gameStore agent changes and recompute every 2 seconds
let attentionInterval: ReturnType<typeof setInterval> | null = null;

export function startAttentionEngine(): void {
  if (attentionInterval) return;
  recomputeAttention();
  attentionInterval = setInterval(recomputeAttention, 2000);
}

export function stopAttentionEngine(): void {
  if (attentionInterval) {
    clearInterval(attentionInterval);
    attentionInterval = null;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/m.cadilecaceres/dev/tesseron/panoptica/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/m.cadilecaceres/dev/tesseron/panoptica && git add frontend/src/stores/attentionStore.ts && git commit -m "feat: add AttentionEngine store with urgency scoring"
```

---

### Task 2: CommandBar component

**Files:**
- Create: `frontend/src/components/command/CommandBar.tsx`

- [ ] **Step 1: Create the CommandBar component**

Create `frontend/src/components/command/CommandBar.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Command } from "lucide-react";
import { useAttentionStore, type AttentionEntry, type AttentionCategory } from "@/stores/attentionStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useGameStore } from "@/stores/gameStore";

// ============================================================================
// HELPERS
// ============================================================================

const CATEGORY_CONFIG: Record<AttentionCategory, { dot: string; label: string; badge: string }> = {
  blocked: { dot: "bg-rose-500", label: "BLOCKED", badge: "bg-rose-500/20 text-rose-400 border-rose-500/40" },
  waiting: { dot: "bg-amber-500", label: "WAITING", badge: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  completed: { dot: "bg-emerald-500", label: "COMPLETED", badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
  idle: { dot: "bg-slate-500", label: "IDLE", badge: "bg-slate-500/20 text-slate-400 border-slate-500/40" },
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

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
        isSelected ? "bg-slate-700/60" : "hover:bg-slate-800/60"
      }`}
    >
      {/* Urgency dot */}
      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`} />

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
          ? `IDLE ${Math.round((Date.now() - entry.lastActivityAt) / 60_000)}m`
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
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Clamp selection when list changes
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/m.cadilecaceres/dev/tesseron/panoptica/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/m.cadilecaceres/dev/tesseron/panoptica && git add frontend/src/components/command/CommandBar.tsx && git commit -m "feat: add CommandBar component with keyboard navigation and fuzzy search"
```

---

### Task 3: Attention toast notifications

**Files:**
- Create: `frontend/src/components/command/AttentionToasts.tsx`

- [ ] **Step 1: Create the AttentionToasts component**

Create `frontend/src/components/command/AttentionToasts.tsx`:

```tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { useAttentionStore, type AttentionCategory } from "@/stores/attentionStore";

const DOT_COLOR: Record<AttentionCategory, string> = {
  blocked: "bg-rose-500",
  waiting: "bg-amber-500",
  completed: "bg-emerald-500",
  idle: "bg-slate-500",
};

interface AttentionToastsProps {
  onOpenCommandBar: (agentId?: string) => void;
}

export function AttentionToasts({ onOpenCommandBar }: AttentionToastsProps): ReactNode {
  const pendingToasts = useAttentionStore((s) => s.pendingToasts);
  const dismissToast = useAttentionStore((s) => s.dismissToast);

  // Auto-dismiss toasts after 8 seconds
  useEffect(() => {
    if (pendingToasts.length === 0) return;
    const timers = pendingToasts.map((toast) =>
      setTimeout(() => dismissToast(toast.agentId), 8000),
    );
    return () => timers.forEach(clearTimeout);
  }, [pendingToasts, dismissToast]);

  if (pendingToasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-5 z-[65] flex flex-col gap-2 pointer-events-auto">
      {pendingToasts.map((toast) => (
        <button
          key={toast.agentId}
          onClick={() => {
            dismissToast(toast.agentId);
            onOpenCommandBar(toast.agentId);
          }}
          className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 border border-slate-700 rounded-lg shadow-2xl backdrop-blur-sm animate-slide-up hover:bg-slate-800 transition-colors max-w-xs"
        >
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLOR[toast.category]}`} />
          <div className="min-w-0 text-left">
            <div className="text-white text-xs font-mono font-bold truncate">
              {toast.agentName}
            </div>
            <div className="text-slate-400 text-[10px] truncate">
              {toast.summary}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/m.cadilecaceres/dev/tesseron/panoptica/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/m.cadilecaceres/dev/tesseron/panoptica && git add frontend/src/components/command/AttentionToasts.tsx && git commit -m "feat: add AttentionToasts notification component"
```

---

### Task 4: Wire CommandBar + AttentionEngine into HeaderControls and page.tsx

**Files:**
- Modify: `frontend/src/components/layout/HeaderControls.tsx`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Add ⌘K button to HeaderControls**

In `frontend/src/components/layout/HeaderControls.tsx`:

Add `Command` to the lucide-react import:

```typescript
import {
  Activity,
  Play,
  RefreshCw,
  Bug,
  Trash2,
  HelpCircle,
  Settings,
  Compass,
  Command,
} from "lucide-react";
```

Add new props to the interface:

```typescript
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
  onStartTour: () => void;
  tourBounce: boolean;
  onOpenCommandBar: () => void;
  attentionCount: number;
  highestUrgency: "blocked" | "waiting" | "completed" | "idle" | null;
}
```

Add the new props to the destructured parameters.

Add the ⌘K button right before the TOUR button:

```tsx
      <button
        onClick={onOpenCommandBar}
        className="relative flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors"
      >
        <Command size={14} />
        <span className="text-[10px] font-mono">⌘K</span>
        {attentionCount > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white ${
              highestUrgency === "blocked"
                ? "bg-rose-500"
                : highestUrgency === "waiting"
                  ? "bg-amber-500"
                  : "bg-emerald-500"
            }`}
          >
            {attentionCount}
          </span>
        )}
      </button>
```

- [ ] **Step 2: Wire everything in page.tsx**

In `frontend/src/app/page.tsx`:

Add imports:

```typescript
import { CommandBar } from "@/components/command/CommandBar";
import { AttentionToasts } from "@/components/command/AttentionToasts";
import { useAttentionStore, startAttentionEngine } from "@/stores/attentionStore";
```

Add state and store subscriptions inside the component (after existing tour subscriptions):

```typescript
  const [isCommandBarOpen, setIsCommandBarOpen] = useState(false);
  const attentionCount = useAttentionStore((s) => s.activeCount);
  const highestUrgency = useAttentionStore((s) => s.highestUrgency);
```

Add useEffect to start the attention engine (after other init effects):

```typescript
  useEffect(() => {
    startAttentionEngine();
  }, []);
```

Add CMD+K global keyboard shortcut (after other effects):

```typescript
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandBarOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
```

Add the handler:

```typescript
  const handleOpenCommandBar = () => setIsCommandBarOpen(true);
```

Update the `<HeaderControls>` props:

```tsx
          <HeaderControls
            isConnected={isConnected}
            debugMode={debugMode}
            aiSummaryEnabled={aiSummaryEnabled}
            onSimulate={handleSimulate}
            onReset={handleReset}
            onClearDB={() => setIsClearModalOpen(true)}
            onToggleDebug={handleToggleDebug}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onOpenHelp={() => setIsHelpModalOpen(true)}
            onStartTour={handleStartTour}
            tourBounce={!hasSeenTour && !isTourActive}
            onOpenCommandBar={handleOpenCommandBar}
            attentionCount={attentionCount}
            highestUrgency={highestUrgency}
          />
```

Add the CommandBar and AttentionToasts before `</main>`:

```tsx
      {/* Command bar */}
      <CommandBar
        isOpen={isCommandBarOpen}
        onClose={() => setIsCommandBarOpen(false)}
      />

      {/* Attention toasts */}
      <AttentionToasts onOpenCommandBar={handleOpenCommandBar} />

      {/* Tour overlay */}
      <TourOverlay />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/m.cadilecaceres/dev/tesseron/panoptica/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/m.cadilecaceres/dev/tesseron/panoptica && git add frontend/src/components/layout/HeaderControls.tsx frontend/src/app/page.tsx && git commit -m "feat: wire CommandBar, AttentionToasts, and ⌘K button into page"
```

---

Self-review:

**1. Spec coverage:**
- Section 1 (AttentionEngine store) → Task 1 ✅
- Section 2 (CommandBar UI) → Task 2 ✅
- Section 3 (Notification layer: badge + toasts + sound) → Task 3 + Task 4 ✅
- Section 4 (Context resumption / jump) → Task 2 `jumpToAgent` ✅
- Section 5 (Data attributes / integration) → Task 4 ✅

**2. Placeholder scan:** No TBD, TODO, or vague steps. All code complete.

**3. Type consistency:**
- `AttentionEntry` defined in Task 1, consumed in Task 2 and Task 3 ✅
- `AttentionCategory` defined in Task 1, used in Task 2 `CATEGORY_CONFIG` and Task 3 `DOT_COLOR` ✅
- `startAttentionEngine` exported in Task 1, called in Task 4 ✅
- `highestUrgency` type matches between store and HeaderControls props ✅
