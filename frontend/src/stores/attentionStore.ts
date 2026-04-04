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

export const useAttentionStore = create<AttentionState>()((set) => ({
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
      floorId: null,
      floorName: "",
      urgencyScore: score,
      category,
      summary: agent.bubble.content?.text ?? agent.currentTask ?? "No activity",
      timeline: buildTimeline(agent),
      lastActivityAt: agent.bubble.displayStartTime ?? now,
    });
  }

  entries.sort((a, b) => b.urgencyScore - a.urgencyScore);

  const highestUrgency = entries.length > 0 ? entries[0].category : null;
  const activeCount = entries.length;

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
