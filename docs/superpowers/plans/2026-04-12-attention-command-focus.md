# Attention/Command System & Click-to-Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified attention system with Cmd+K command bar, urgency-scored toasts, and canvas click-to-focus for agents.

**Architecture:** Single new Zustand `attentionStore` manages toast queue, command bar state, and focus popup state. Events from the existing WebSocket hook feed into the attention store for toast generation. Clicking agents in PixiJS opens a React portal popup. Settings toggles sync via existing `preferencesStore`.

**Tech Stack:** Zustand (store), React portals (popup), Tailwind CSS (toasts/command bar), PixiJS `pointertap` (click handler), existing `POST /sessions/{id}/focus` endpoint (terminal activation).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/stores/attentionStore.ts` | Create | Toast queue, command actions, focus popup state, urgency scoring |
| `frontend/src/components/attention/AttentionToasts.tsx` | Create | Stacked toast notifications in top-right |
| `frontend/src/components/attention/CommandBar.tsx` | Create | Cmd+K overlay with fuzzy search |
| `frontend/src/components/attention/AgentPopup.tsx` | Create | Agent info popup with focus terminal button |
| `frontend/src/hooks/useWebSocketEvents.ts` | Modify | Wire `processEvent` into attention store |
| `frontend/src/components/game/AgentSprite.tsx` | Modify | Add `pointertap` handler |
| `frontend/src/components/game/OfficeGame.tsx` | Modify | Pass transform ref for coordinate conversion |
| `frontend/src/app/page.tsx` | Modify | Mount new components, add Cmd+K listener |
| `frontend/src/components/layout/HeaderControls.tsx` | Modify | Add bell icon with unread count |
| `frontend/src/stores/preferencesStore.ts` | Modify | Add attention settings keys |
| `frontend/src/components/overlay/SettingsModal.tsx` | Modify | Add attention settings section |
| `frontend/src/i18n/en.ts` | Modify | Add attention/command/settings keys |
| `frontend/src/i18n/es.ts` | Modify | Add Spanish translations |
| `frontend/src/i18n/pt-BR.ts` | Modify | Add Portuguese translations |
| `frontend/src/stores/tourStore.ts` | Modify | Wire focus-popup advance condition |

---

### Task 1: i18n Keys

**Files:**
- Modify: `frontend/src/i18n/en.ts`
- Modify: `frontend/src/i18n/es.ts`
- Modify: `frontend/src/i18n/pt-BR.ts`

- [ ] **Step 1: Add English keys**

In `frontend/src/i18n/en.ts`, add the following keys after the `"tour.*"` block (before the closing `} as const`):

```ts
  // Attention System
  "attention.toast.permissionRequest": "{agentName} needs permission",
  "attention.toast.error": "{agentName} encountered an error",
  "attention.toast.taskCompleted": "{agentName} completed a task",
  "attention.toast.agentArrived": "{agentName} joined the office",
  "attention.toast.stop": "{agentName} stopped",
  "attention.toast.backgroundTask": "{agentName}: {taskDescription}",
  "attention.commandBar.placeholder": "Type a command...",
  "attention.commandBar.focusAgent": "Focus Agent: {name}",
  "attention.commandBar.focusBoss": "Focus Boss Terminal",
  "attention.commandBar.showAttention": "Show Attention Queue",
  "attention.commandBar.dismissAll": "Dismiss All Toasts",
  "attention.commandBar.toggleDebug": "Toggle Debug View",
  "attention.commandBar.togglePaths": "Toggle Path Display",
  "attention.commandBar.toggleQueueSlots": "Toggle Queue Slots",
  "attention.commandBar.togglePhaseLabels": "Toggle Phase Labels",
  "attention.commandBar.toggleObstacles": "Toggle Obstacles",
  "attention.commandBar.noResults": "No matching commands",
  "attention.popup.focusTerminal": "Focus Terminal",
  "attention.popup.close": "Close",
  "attention.popup.state": "State",
  "attention.popup.task": "Task",
  "attention.popup.type": "Type",
  "attention.popup.desk": "Desk",
  "attention.popup.boss": "Boss",
  "attention.popup.agent": "Agent",
  "settings.commandBar": "Command Bar (⌘K)",
  "settings.clickToFocus": "Click to Focus",
  "settings.toastFilters": "Toast Notifications",
  "settings.toastAutoDismiss": "Auto-dismiss Timing",
  "settings.filterPermission": "Permission requests",
  "settings.filterError": "Errors and stops",
  "settings.filterTaskComplete": "Task completions",
  "settings.filterArrival": "Agent arrivals",
```

- [ ] **Step 2: Add Spanish keys**

In `frontend/src/i18n/es.ts`, add the same keys with Spanish translations:

```ts
  // Attention System
  "attention.toast.permissionRequest": "{agentName} necesita permiso",
  "attention.toast.error": "{agentName} encontró un error",
  "attention.toast.taskCompleted": "{agentName} completó una tarea",
  "attention.toast.agentArrived": "{agentName} se unió a la oficina",
  "attention.toast.stop": "{agentName} se detuvo",
  "attention.toast.backgroundTask": "{agentName}: {taskDescription}",
  "attention.commandBar.placeholder": "Escribe un comando...",
  "attention.commandBar.focusAgent": "Enfocar Agente: {name}",
  "attention.commandBar.focusBoss": "Enfocar Terminal del Jefe",
  "attention.commandBar.showAttention": "Mostrar Cola de Atención",
  "attention.commandBar.dismissAll": "Descartar Todas las Notificaciones",
  "attention.commandBar.toggleDebug": "Alternar Vista de Depuración",
  "attention.commandBar.togglePaths": "Alternar Mostrar Rutas",
  "attention.commandBar.toggleQueueSlots": "Alternar Ranuras de Cola",
  "attention.commandBar.togglePhaseLabels": "Alternar Etiquetas de Fase",
  "attention.commandBar.toggleObstacles": "Alternar Obstáculos",
  "attention.commandBar.noResults": "Sin comandos coincidentes",
  "attention.popup.focusTerminal": "Enfocar Terminal",
  "attention.popup.close": "Cerrar",
  "attention.popup.state": "Estado",
  "attention.popup.task": "Tarea",
  "attention.popup.type": "Tipo",
  "attention.popup.desk": "Escritorio",
  "attention.popup.boss": "Jefe",
  "attention.popup.agent": "Agente",
  "settings.commandBar": "Barra de Comandos (⌘K)",
  "settings.clickToFocus": "Clic para Enfocar",
  "settings.toastFilters": "Notificaciones Toast",
  "settings.toastAutoDismiss": "Tiempo de Auto-descarte",
  "settings.filterPermission": "Solicitudes de permiso",
  "settings.filterError": "Errores y paradas",
  "settings.filterTaskComplete": "Tareas completadas",
  "settings.filterArrival": "Llegadas de agentes",
```

- [ ] **Step 3: Add Portuguese keys**

In `frontend/src/i18n/pt-BR.ts`, add the same keys with Portuguese translations:

```ts
  // Attention System
  "attention.toast.permissionRequest": "{agentName} precisa de permissão",
  "attention.toast.taskCompleted": "{agentName} completou uma tarefa",
  "attention.toast.error": "{agentName} encontrou um erro",
  "attention.toast.agentArrived": "{agentName} entrou no escritório",
  "attention.toast.stop": "{agentName} parou",
  "attention.toast.backgroundTask": "{agentName}: {taskDescription}",
  "attention.commandBar.placeholder": "Digite um comando...",
  "attention.commandBar.focusAgent": "Focar Agente: {name}",
  "attention.commandBar.focusBoss": "Focar Terminal do Chefe",
  "attention.commandBar.showAttention": "Mostrar Fila de Atenção",
  "attention.commandBar.dismissAll": "Descartar Todas as Notificações",
  "attention.commandBar.toggleDebug": "Alternar Depuração",
  "attention.commandBar.togglePaths": "Alternar Exibição de Caminhos",
  "attention.commandBar.toggleQueueSlots": "Alternar Slots de Fila",
  "attention.commandBar.togglePhaseLabels": "Alternar Rótulos de Fase",
  "attention.commandBar.toggleObstacles": "Alternar Obstáculos",
  "attention.commandBar.noResults": "Nenhum comando encontrado",
  "attention.popup.focusTerminal": "Focar Terminal",
  "attention.popup.close": "Fechar",
  "attention.popup.state": "Estado",
  "attention.popup.task": "Tarefa",
  "attention.popup.type": "Tipo",
  "attention.popup.desk": "Mesa",
  "attention.popup.boss": "Chefe",
  "attention.popup.agent": "Agente",
  "settings.commandBar": "Barra de Comandos (⌘K)",
  "settings.clickToFocus": "Clique para Focar",
  "settings.toastFilters": "Notificações Toast",
  "settings.toastAutoDismiss": "Tempo de Auto-descarte",
  "settings.filterPermission": "Pedidos de permissão",
  "settings.filterError": "Erros e paradas",
  "settings.filterTaskComplete": "Tarefas concluídas",
  "settings.filterArrival": "Chegadas de agentes",
```

- [ ] **Step 4: Run typecheck to verify keys**

Run: `cd frontend && bun run typecheck`
Expected: PASS (keys are valid strings)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/en.ts frontend/src/i18n/es.ts frontend/src/i18n/pt-BR.ts
git commit -m "feat(i18n): add attention/command/focus translation keys"
```

---

### Task 2: Attention Store

**Files:**
- Create: `frontend/src/stores/attentionStore.ts`

- [ ] **Step 1: Create the attention store**

Create `frontend/src/stores/attentionStore.ts`:

```ts
"use client";

import { create } from "zustand";
import type { EventType } from "@/types";

// ============================================================================
// TYPES
// ============================================================================

export type UrgencyLevel = "critical" | "high" | "low" | "info";

export interface AttentionToast {
  id: string;
  agentId: string | null;
  agentName: string;
  eventType: EventType;
  urgency: number;
  urgencyLevel: UrgencyLevel;
  title: string;
  description: string;
  createdAt: number;
  autoDismissMs: number | null;
  dismissed: boolean;
}

export interface FocusPopupState {
  agentId: string;
  screenX: number;
  screenY: number;
}

export interface CommandAction {
  id: string;
  label: string;
  icon: string;
  action: () => void;
  keywords: string[];
}

interface AttentionState {
  // Toast queue
  toastQueue: AttentionToast[];
  // Command bar
  isCommandBarOpen: boolean;
  commandFilter: string;
  // Focus popup
  focusPopup: FocusPopupState | null;

  // Actions
  processEvent: (event: {
    type: EventType;
    agentId?: string | null;
    agentName?: string | null;
    taskDescription?: string | null;
    errorType?: string | null;
    message?: string | null;
  }) => void;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
  openCommandBar: () => void;
  closeCommandBar: () => void;
  setCommandFilter: (filter: string) => void;
  openFocusPopup: (agentId: string, screenX: number, screenY: number) => void;
  closeFocusPopup: () => void;
  focusAgentTerminal: (sessionId: string, agentId: string | null) => Promise<void>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_VISIBLE_TOASTS = 5;

/** Map event types to urgency scores and auto-dismiss timing. */
function scoreEvent(eventType: EventType): {
  urgency: number;
  level: UrgencyLevel;
  autoDismissMs: number | null;
} {
  switch (eventType) {
    case "permission_request":
      return { urgency: 90, level: "critical", autoDismissMs: null };
    case "error":
    case "stop":
      return { urgency: 70, level: "high", autoDismissMs: null };
    case "task_completed":
      return { urgency: 30, level: "low", autoDismissMs: 5000 };
    case "subagent_start":
    case "background_task_notification":
      return { urgency: 10, level: "info", autoDismissMs: 3000 };
    default:
      return { urgency: 5, level: "info", autoDismissMs: 3000 };
  }
}

// ============================================================================
// STORE
// ============================================================================

export const useAttentionStore = create<AttentionState>()((set, get) => ({
  toastQueue: [],
  isCommandBarOpen: false,
  commandFilter: "",
  focusPopup: null,

  processEvent: (event) => {
    const { urgency, level, autoDismissMs } = scoreEvent(event.type);
    // Skip very low urgency events that aren't in our explicit list
    if (urgency <= 5) return;

    const toast: AttentionToast = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId: event.agentId ?? null,
      agentName: event.agentName ?? "Unknown",
      eventType: event.type,
      urgency,
      urgencyLevel: level,
      title: event.type.replace(/_/g, " "),
      description:
        event.taskDescription ?? event.errorType ?? event.message ?? "",
      createdAt: Date.now(),
      autoDismissMs,
      dismissed: false,
    };

    set((state) => {
      let queue = [...state.toastQueue, toast];
      // Sort by urgency descending
      queue.sort((a, b) => b.urgency - a.urgency);
      // Auto-dismiss oldest info toasts if over max
      if (queue.length > MAX_VISIBLE_TOASTS) {
        const dismissed = queue
          .filter((t) => !t.dismissed)
          .sort((a, b) => a.urgency - b.urgency);
        while (
          queue.filter((t) => !t.dismissed).length > MAX_VISIBLE_TOASTS &&
          dismissed.length > 0
        ) {
          const oldest = dismissed.shift()!;
          oldest.dismissed = true;
        }
      }
      return { toastQueue: queue };
    });
  },

  dismissToast: (id) =>
    set((state) => ({
      toastQueue: state.toastQueue.map((t) =>
        t.id === id ? { ...t, dismissed: true } : t,
      ),
    })),

  clearAllToasts: () =>
    set((state) => ({
      toastQueue: state.toastQueue.map((t) => ({ ...t, dismissed: true })),
    })),

  openCommandBar: () => set({ isCommandBarOpen: true, commandFilter: "" }),
  closeCommandBar: () => set({ isCommandBarOpen: false, commandFilter: "" }),
  setCommandFilter: (filter) => set({ commandFilter: filter }),

  openFocusPopup: (agentId, screenX, screenY) =>
    set({
      focusPopup: { agentId, screenX, screenY },
    }),

  closeFocusPopup: () => set({ focusPopup: null }),

  focusAgentTerminal: async (sessionId, _agentId) => {
    try {
      const res = await fetch(
        `http://localhost:8000/api/v1/sessions/${sessionId}/focus`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        console.error("Focus terminal failed:", res.statusText);
      }
    } catch (err) {
      console.error("Focus terminal error:", err);
    }
    get().closeFocusPopup();
  },
}));

// ============================================================================
// SELECTORS
// ============================================================================

export const selectActiveToasts = (state: AttentionState) =>
  state.toastQueue.filter((t) => !t.dismissed);

export const selectUnreadCount = (state: AttentionState) =>
  state.toastQueue.filter((t) => !t.dismissed).length;

export const selectFocusPopup = (state: AttentionState) => state.focusPopup;
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/attentionStore.ts
git commit -m "feat: add attention store with toast queue and focus popup state"
```

---

### Task 3: Preferences Store Updates

**Files:**
- Modify: `frontend/src/stores/preferencesStore.ts`

- [ ] **Step 1: Read the current file**

Read: `frontend/src/stores/preferencesStore.ts`

- [ ] **Step 2: Add attention settings to the state interface**

In `PreferencesState` interface (around line 13), add after `language: Locale`:

```ts
  // Attention settings
  commandBarEnabled: boolean;
  clickToFocusEnabled: boolean;
  toastFilterPermission: boolean;
  toastFilterError: boolean;
  toastFilterTaskComplete: boolean;
  toastFilterArrival: boolean;
  toastAutoDismissLow: number;
  toastAutoDismissInfo: number;
```

Add corresponding setters after `setLanguage`:

```ts
  setCommandBarEnabled: (enabled: boolean) => Promise<void>;
  setClickToFocusEnabled: (enabled: boolean) => Promise<void>;
  setToastFilterPermission: (enabled: boolean) => Promise<void>;
  setToastFilterError: (enabled: boolean) => Promise<void>;
  setToastFilterTaskComplete: (enabled: boolean) => Promise<void>;
  setToastFilterArrival: (enabled: boolean) => Promise<void>;
  setToastAutoDismissLow: (ms: number) => Promise<void>;
  setToastAutoDismissInfo: (ms: number) => Promise<void>;
```

- [ ] **Step 3: Add defaults in the store initial state**

In the store's initial state object (after `language: "en" as Locale`), add:

```ts
  commandBarEnabled: true,
  clickToFocusEnabled: true,
  toastFilterPermission: true,
  toastFilterError: true,
  toastFilterTaskComplete: true,
  toastFilterArrival: true,
  toastAutoDismissLow: 5000,
  toastAutoDismissInfo: 3000,
```

- [ ] **Step 4: Add setter implementations**

Add the setter functions following the same pattern as `setLanguage` — call `setPreference()` then `set()`:

```ts
  setCommandBarEnabled: async (enabled: boolean) => {
    await setPreference("commandBarEnabled", String(enabled));
    set({ commandBarEnabled: enabled });
  },
  setClickToFocusEnabled: async (enabled: boolean) => {
    await setPreference("clickToFocusEnabled", String(enabled));
    set({ clickToFocusEnabled: enabled });
  },
  setToastFilterPermission: async (enabled: boolean) => {
    await setPreference("toastFilterPermission", String(enabled));
    set({ toastFilterPermission: enabled });
  },
  setToastFilterError: async (enabled: boolean) => {
    await setPreference("toastFilterError", String(enabled));
    set({ toastFilterError: enabled });
  },
  setToastFilterTaskComplete: async (enabled: boolean) => {
    await setPreference("toastFilterTaskComplete", String(enabled));
    set({ toastFilterTaskComplete: enabled });
  },
  setToastFilterArrival: async (enabled: boolean) => {
    await setPreference("toastFilterArrival", String(enabled));
    set({ toastFilterArrival: enabled });
  },
  setToastAutoDismissLow: async (ms: number) => {
    await setPreference("toastAutoDismissLow", String(ms));
    set({ toastAutoDismissLow: ms });
  },
  setToastAutoDismissInfo: async (ms: number) => {
    await setPreference("toastAutoDismissInfo", String(ms));
    set({ toastAutoDismissInfo: ms });
  },
```

- [ ] **Step 5: Update loadPreferences to parse new keys**

In the `loadPreferences` action, after parsing existing keys like `clockType`, add parsing for the new keys. The prefs come from the backend as `Record<string, string>`, so parse booleans with `=== "true"` and numbers with `Number()`:

```ts
  // Attention settings
  commandBarEnabled: prefs.commandBarEnabled !== "false",
  clickToFocusEnabled: prefs.clickToFocusEnabled !== "false",
  toastFilterPermission: prefs.toastFilterPermission !== "false",
  toastFilterError: prefs.toastFilterError !== "false",
  toastFilterTaskComplete: prefs.toastFilterTaskComplete !== "false",
  toastFilterArrival: prefs.toastFilterArrival !== "false",
  toastAutoDismissLow: prefs.toastAutoDismissLow
    ? Number(prefs.toastAutoDismissLow)
    : 5000,
  toastAutoDismissInfo: prefs.toastAutoDismissInfo
    ? Number(prefs.toastAutoDismissInfo)
    : 3000,
```

- [ ] **Step 6: Run typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/stores/preferencesStore.ts
git commit -m "feat: add attention settings to preferences store"
```

---

### Task 4: AttentionToasts Component

**Files:**
- Create: `frontend/src/components/attention/AttentionToasts.tsx`

- [ ] **Step 1: Create the AttentionToasts component**

Create `frontend/src/components/attention/AttentionToasts.tsx`:

```tsx
"use client";

import { useEffect, useCallback, type ReactNode } from "react";
import { useAttentionStore, selectActiveToasts } from "@/stores/attentionStore";
import { useTranslation } from "@/hooks/useTranslation";
import type { UrgencyLevel } from "@/stores/attentionStore";

const URGENCY_COLORS: Record<UrgencyLevel, string> = {
  critical: "border-red-500 bg-red-500/10 text-red-400",
  high: "border-orange-500 bg-orange-500/10 text-orange-400",
  low: "border-green-500 bg-green-500/10 text-green-400",
  info: "border-blue-500 bg-blue-500/10 text-blue-400",
};

const URGENCY_ICONS: Record<UrgencyLevel, string> = {
  critical: "⚠️",
  high: "🔴",
  low: "✅",
  info: "🔵",
};

export default function AttentionToasts(): ReactNode {
  const toasts = useAttentionStore(selectActiveToasts);
  const dismissToast = useAttentionStore((s) => s.dismissToast);
  const openFocusPopup = useAttentionStore((s) => s.openFocusPopup);
  const { t } = useTranslation();

  const handleToastClick = useCallback(
    (toast: (typeof toasts)[number]) => {
      if (toast.agentId) {
        // Position popup roughly center-top of the page
        openFocusPopup(toast.agentId, window.innerWidth / 2, 120);
      }
      dismissToast(toast.id);
    },
    [dismissToast, openFocusPopup],
  );

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 w-80 pointer-events-none">
      {toasts.slice(0, 5).map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onClick={() => handleToastClick(toast)}
          onDismiss={() => dismissToast(toast.id)}
          t={t}
        />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onClick,
  onDismiss,
  t: _t,
}: {
  toast: ReturnType<typeof selectActiveToasts>[number];
  onClick: () => void;
  onDismiss: () => void;
  t: (key: string) => string;
}): ReactNode {
  const colorClass = URGENCY_COLORS[toast.urgencyLevel];
  const icon = URGENCY_ICONS[toast.urgencyLevel];

  // Auto-dismiss
  useEffect(() => {
    if (toast.autoDismissMs === null) return;
    const timer = setTimeout(onDismiss, toast.autoDismissMs);
    return () => clearTimeout(timer);
  }, [toast.autoDismissMs, toast.id, onDismiss]);

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer animate-in slide-in-from-right-2 duration-300 ${colorClass}`}
      onClick={onClick}
      role="alert"
    >
      <span className="text-sm shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold truncate">{toast.agentName}</p>
        {toast.description && (
          <p className="text-[11px] opacity-80 truncate">
            {toast.description}
          </p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="text-xs opacity-50 hover:opacity-100 shrink-0"
        aria-label={_t("attention.popup.close")}
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/attention/AttentionToasts.tsx
git commit -m "feat: add AttentionToasts component with urgency styling"
```

---

### Task 5: CommandBar Component

**Files:**
- Create: `frontend/src/components/attention/CommandBar.tsx`

- [ ] **Step 1: Create the CommandBar component**

Create `frontend/src/components/attention/CommandBar.tsx`:

```tsx
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
  keywords: string[];
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
  const toggleDebug = useGameStore((s) => s.toggleDebug);
  const showPaths = useGameStore((s) => s.showPaths);
  const toggleShowPaths = useGameStore((s) => {
    s.showPaths = !s.showPaths;
  });
  const showQueueSlots = useGameStore((s) => s.showQueueSlots);
  const showPhaseLabels = useGameStore((s) => s.showPhaseLabels);
  const showObstacles = useGameStore((s) => s.showObstacles);

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
        icon: "⚡",
        keywords: ["focus", "agent", agent.name ?? ""],
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
      icon: "👔",
      keywords: ["focus", "boss", "terminal"],
      action: () => {
        openFocusPopup("boss", window.innerWidth / 2, 200);
        closeCommandBar();
      },
    });

    // Utility commands
    cmds.push({
      id: "dismiss-all",
      label: t("attention.commandBar.dismissAll"),
      icon: "🗑️",
      keywords: ["dismiss", "clear", "toast", "notification"],
      action: () => {
        clearAllToasts();
        closeCommandBar();
      },
    });

    cmds.push({
      id: "toggle-debug",
      label: t("attention.commandBar.toggleDebug"),
      icon: "🐛",
      keywords: ["debug", "toggle"],
      action: () => {
        toggleDebug();
        closeCommandBar();
      },
    });

    cmds.push({
      id: "toggle-paths",
      label: t("attention.commandBar.togglePaths"),
      icon: "🛤️",
      keywords: ["path", "toggle"],
      action: () => {
        useGameStore.setState({ showPaths: !showPaths });
        closeCommandBar();
      },
    });

    cmds.push({
      id: "toggle-queue-slots",
      label: t("attention.commandBar.toggleQueueSlots"),
      icon: "🔢",
      keywords: ["queue", "slot", "toggle"],
      action: () => {
        useGameStore.setState({ showQueueSlots: !showQueueSlots });
        closeCommandBar();
      },
    });

    cmds.push({
      id: "toggle-phase-labels",
      label: t("attention.commandBar.togglePhaseLabels"),
      icon: "🏷️",
      keywords: ["phase", "label", "toggle"],
      action: () => {
        useGameStore.setState({
          showPhaseLabels: !showPhaseLabels,
        });
        closeCommandBar();
      },
    });

    cmds.push({
      id: "toggle-obstacles",
      label: t("attention.commandBar.toggleObstacles"),
      icon: "🚧",
      keywords: ["obstacle", "toggle"],
      action: () => {
        useGameStore.setState({ showObstacles: !showObstacles });
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
    toggleDebug,
    showPaths,
    showQueueSlots,
    showPhaseLabels,
    showObstacles,
  ]);

  // Filter commands
  const filtered = useMemo(() => {
    if (!filter) return commands;
    return commands.filter(
      (c) =>
        fuzzyMatch(filter, c.label) ||
        c.keywords.some((k) => fuzzyMatch(filter, k)),
    );
  }, [commands, filter]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

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
          <span className="text-neutral-500">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setCommandFilter(e.target.value)}
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
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS — may need to fix the `toggleShowPaths` unused variable or simplify the toggle pattern to use `useGameStore.setState()` consistently

Note: If typecheck fails on the toggle functions, the pattern should use `useGameStore.setState()` directly in actions rather than destructuring. The correct pattern is:

```ts
action: () => {
  useGameStore.setState((s) => ({ showPaths: !s.showPaths }));
  closeCommandBar();
},
```

- [ ] **Step 3: Fix any typecheck errors and re-run**

Run: `cd frontend && bun run typecheck`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/attention/CommandBar.tsx
git commit -m "feat: add CommandBar component with fuzzy search"
```

---

### Task 6: AgentPopup Component

**Files:**
- Create: `frontend/src/components/attention/AgentPopup.tsx`

- [ ] **Step 1: Create the AgentPopup component**

Create `frontend/src/components/attention/AgentPopup.tsx`:

```tsx
"use client";

import { useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAttentionStore, selectFocusPopup } from "@/stores/attentionStore";
import { useGameStore, selectSessionId } from "@/stores/gameStore";
import { useTranslation } from "@/hooks/useTranslation";
import type { AgentAnimationState } from "@/stores/gameStore";

const POPUP_WIDTH = 260;
const POPUP_MARGIN = 16;

export default function AgentPopup(): ReactNode {
  const focusPopup = useAttentionStore(selectFocusPopup);
  const closeFocusPopup = useAttentionStore((s) => s.closeFocusPopup);
  const focusAgentTerminal = useAttentionStore((s) => s.focusAgentTerminal);
  const agents = useGameStore((s) => s.agents);
  const boss = useGameStore((s) => s.boss);
  const sessionId = useGameStore(selectSessionId);
  const { t } = useTranslation();

  const handleFocusTerminal = useCallback(() => {
    if (!sessionId) return;
    focusAgentTerminal(sessionId, focusPopup?.agentId ?? null);
  }, [sessionId, focusAgentTerminal, focusPopup]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFocusPopup();
    },
    [closeFocusPopup],
  );

  useEffect(() => {
    if (focusPopup) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [focusPopup, handleKeyDown]);

  if (!focusPopup) return null;

  // Resolve agent data
  const isBoss = focusPopup.agentId === "boss";
  const agent: AgentAnimationState | null = isBoss
    ? null
    : agents.get(focusPopup.agentId) ?? null;

  // Viewport-clamped positioning
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = focusPopup.screenX + 20;
  let y = focusPopup.screenY - 60;
  if (x + POPUP_WIDTH > vw - POPUP_MARGIN) x = focusPopup.screenX - POPUP_WIDTH - 20;
  if (y + 200 > vh - POPUP_MARGIN) y = vh - 200 - POPUP_MARGIN;
  if (y < POPUP_MARGIN) y = POPUP_MARGIN;

  const displayName = isBoss
    ? "Boss"
    : agent?.name ?? focusPopup.agentId;
  const displayColor = isBoss ? "#f59e0b" : agent?.color ?? "#888";
  const displayState = isBoss
    ? boss.backendState
    : agent?.backendState ?? "unknown";
  const displayTask = isBoss ? boss.currentTask : agent?.currentTask;
  const displayType = isBoss ? "lead" : agent?.characterType ?? "subagent";
  const displayDesk = isBoss ? null : agent?.desk;

  const popup = (
    <div
      className="fixed inset-0 z-[90]"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeFocusPopup();
      }}
    >
      {/* Invisible backdrop to catch outside clicks */}
      <div className="absolute inset-0" />

      {/* Popup card */}
      <div
        className="absolute bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl p-4"
        style={{
          left: x,
          top: y,
          width: POPUP_WIDTH,
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: displayColor }}
          />
          <span className="text-white font-bold text-sm truncate flex-1">
            {displayName}
          </span>
          {displayDesk !== null && (
            <span className="text-neutral-500 text-[11px]">
              {t("attention.popup.desk")} #{displayDesk}
            </span>
          )}
        </div>

        {/* Info rows */}
        <div className="text-[12px] text-neutral-400 space-y-1 mb-3">
          <div>
            <span className="text-neutral-600">
              {t("attention.popup.state")}:
            </span>{" "}
            {displayState}
          </div>
          {displayTask && (
            <div className="truncate">
              <span className="text-neutral-600">
                {t("attention.popup.task")}:
              </span>{" "}
              {displayTask}
            </div>
          )}
          <div>
            <span className="text-neutral-600">
              {t("attention.popup.type")}:
            </span>{" "}
            {displayType}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleFocusTerminal}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
          >
            ⚡ {t("attention.popup.focusTerminal")}
          </button>
          <button
            onClick={closeFocusPopup}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
          >
            {t("attention.popup.close")}
          </button>
        </div>
      </div>
    </div>
  );

  // Use portal to render outside the PixiJS canvas
  if (typeof document === "undefined") return null;
  return createPortal(popup, document.body);
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/attention/AgentPopup.tsx
git commit -m "feat: add AgentPopup component with terminal focus action"
```

---

### Task 7: AgentSprite Click Handler

**Files:**
- Modify: `frontend/src/components/game/AgentSprite.tsx`
- Modify: `frontend/src/components/game/OfficeGame.tsx`

- [ ] **Step 1: Read AgentSprite.tsx**

Read: `frontend/src/components/game/AgentSprite.tsx` — focus on lines 190-229 (the main `<pixiContainer>` and its children).

- [ ] **Step 2: Add click handler to AgentSprite**

In `AgentSprite.tsx`, add import at the top:

```ts
import { useAttentionStore } from "@/stores/attentionStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
```

In the `AgentSpriteProps` interface (around line 25), add an optional `canvasScale` prop:

```ts
  canvasScale?: number;  // for converting canvas coords to screen coords
```

Inside the `AgentSpriteComponent` function, after existing hooks, add:

```ts
  const clickToFocusEnabled = usePreferencesStore((s) => s.clickToFocusEnabled);
  const openFocusPopup = useAttentionStore((s) => s.openFocusPopup);

  const handlePointerTap = useCallback(() => {
    if (!clickToFocusEnabled) return;
    // Convert canvas position to screen coordinates
    const canvas = document.querySelector(".pixi-canvas-container canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / 1280; // CANVAS_WIDTH = 1280
    const screenX = rect.left + position.x * scale;
    const screenY = rect.top + position.y * scale;
    openFocusPopup(id, screenX, screenY);
  }, [clickToFocusEnabled, id, position.x, position.y, openFocusPopup]);
```

On the main `<pixiContainer>` element (around line 190), add:

```tsx
<pixiContainer
  x={position.x}
  y={position.y}
  sortableChildren
  pointertap={handlePointerTap}
  interactive={clickToFocusEnabled}
>
```

- [ ] **Step 3: Run typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS (PixiJS React supports `pointertap` and `interactive` props on containers)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/game/AgentSprite.tsx
git commit -m "feat: add pointertap handler to AgentSprite for click-to-focus"
```

---

### Task 8: Wire useWebSocketEvents

**Files:**
- Modify: `frontend/src/hooks/useWebSocketEvents.ts`

- [ ] **Step 1: Read the current file**

Read: `frontend/src/hooks/useWebSocketEvents.ts` — focus on the `handleMessage` switch block (lines 288-413).

- [ ] **Step 2: Add attention store import**

At the top with other imports (around line 12):

```ts
import { useAttentionStore } from "@/stores/attentionStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
```

- [ ] **Step 3: Wire processEvent into event handling**

Inside `handleMessage`, in the `"event"` case (after the existing typing animation and compaction handling), add attention event processing. Insert after the `context_compaction` block (around line 377):

```ts
      // Attention toasts
      const attentionEventTypes = new Set([
        "permission_request",
        "error",
        "stop",
        "task_completed",
        "subagent_start",
        "background_task_notification",
      ]);
      if (attentionEventTypes.has(message.event.type)) {
        const prefs = usePreferencesStore.getState();
        // Check filter settings
        const filterMap: Record<string, boolean> = {
          permission_request: prefs.toastFilterPermission,
          error: prefs.toastFilterError,
          stop: prefs.toastFilterError,
          task_completed: prefs.toastFilterTaskComplete,
          subagent_start: prefs.toastFilterArrival,
          background_task_notification: prefs.toastFilterArrival,
        };
        if (filterMap[message.event.type] !== false) {
          useAttentionStore.getState().processEvent({
            type: message.event.type,
            agentId: message.event.agentId ?? null,
            agentName:
              message.event.detail?.agentName ?? message.event.agentName ?? null,
            taskDescription:
              message.event.detail?.taskDescription ?? null,
            errorType: message.event.detail?.errorType ?? null,
            message: message.event.detail?.message ?? null,
          });
        }
      }
```

- [ ] **Step 4: Run typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS — may need to check the exact shape of `message.event` fields (agentId, detail.agentName, etc.)

- [ ] **Step 5: Fix any type issues and re-run**

Run: `cd frontend && bun run typecheck`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useWebSocketEvents.ts
git commit -m "feat: wire attention store into WebSocket event processing"
```

---

### Task 9: Mount Components in page.tsx

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Read the current file**

Read: `frontend/src/app/page.tsx` — focus on imports (lines 15-50) and the component tree (lines 232-494).

- [ ] **Step 2: Add imports**

After the existing component imports (around line 47):

```ts
import CommandBar from "@/components/attention/CommandBar";
import AttentionToasts from "@/components/attention/AttentionToasts";
import AgentPopup from "@/components/attention/AgentPopup";
import { useAttentionStore } from "@/stores/attentionStore";
```

- [ ] **Step 3: Add Cmd+K keyboard listener**

Inside the `Home` component, after the existing `useEffect` hooks (around line 200), add:

```ts
  // Cmd+K / Ctrl+K command bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const prefs = usePreferencesStore.getState();
        if (!prefs.commandBarEnabled) return;
        const isOpen = useAttentionStore.getState().isCommandBarOpen;
        if (isOpen) {
          useAttentionStore.getState().closeCommandBar();
        } else {
          useAttentionStore.getState().openCommandBar();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
```

- [ ] **Step 4: Mount components in JSX**

In the component tree, right before the closing `</main>` tag (before `<TourOverlay />`), add:

```tsx
      <CommandBar />
      <AttentionToasts />
      <AgentPopup />
```

- [ ] **Step 5: Run typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: mount CommandBar, AttentionToasts, AgentPopup in page"
```

---

### Task 10: HeaderControls Bell Icon

**Files:**
- Modify: `frontend/src/components/layout/HeaderControls.tsx`

- [ ] **Step 1: Read the current file**

Read: `frontend/src/components/layout/HeaderControls.tsx`

- [ ] **Step 2: Add imports**

At the top, add to the lucide-react import:

```ts
import { Activity, Play, RefreshCw, Bug, Trash2, HelpCircle, Settings, Map, Bell } from "lucide-react";
```

Add:

```ts
import { useAttentionStore, selectUnreadCount } from "@/stores/attentionStore";
```

- [ ] **Step 3: Add bell button**

Inside the `HeaderControls` function, add:

```ts
  const unreadCount = useAttentionStore(selectUnreadCount);
  const openCommandBar = useAttentionStore((s) => s.openCommandBar);
```

In the button row JSX (after the Debug toggle button, before the Tour button), add:

```tsx
        {/* Attention Bell */}
        {unreadCount > 0 && (
          <button
            onClick={openCommandBar}
            className="relative flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 rounded text-xs font-bold transition-colors"
            title="Attention Queue"
          >
            <Bell className="w-3.5 h-3.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        )}
```

- [ ] **Step 4: Run typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/HeaderControls.tsx
git commit -m "feat: add attention bell icon with unread count badge"
```

---

### Task 11: Settings UI

**Files:**
- Modify: `frontend/src/components/overlay/SettingsModal.tsx`

- [ ] **Step 1: Read the current file**

Read: `frontend/src/components/overlay/SettingsModal.tsx`

- [ ] **Step 2: Add preference store subscriptions**

After the existing `usePreferencesStore` subscriptions (around line 53), add:

```ts
  const commandBarEnabled = usePreferencesStore((s) => s.commandBarEnabled);
  const clickToFocusEnabled = usePreferencesStore((s) => s.clickToFocusEnabled);
  const toastFilterPermission = usePreferencesStore((s) => s.toastFilterPermission);
  const toastFilterError = usePreferencesStore((s) => s.toastFilterError);
  const toastFilterTaskComplete = usePreferencesStore((s) => s.toastFilterTaskComplete);
  const toastFilterArrival = usePreferencesStore((s) => s.toastFilterArrival);
  const setCommandBarEnabled = usePreferencesStore((s) => s.setCommandBarEnabled);
  const setClickToFocusEnabled = usePreferencesStore((s) => s.setClickToFocusEnabled);
  const setToastFilterPermission = usePreferencesStore((s) => s.setToastFilterPermission);
  const setToastFilterError = usePreferencesStore((s) => s.setToastFilterError);
  const setToastFilterTaskComplete = usePreferencesStore((s) => s.setToastFilterTaskComplete);
  const setToastFilterArrival = usePreferencesStore((s) => s.setToastFilterArrival);
```

- [ ] **Step 3: Add toggle handler helper**

After the existing handler functions (around line 71):

```ts
  const makeToggle = (
    current: boolean,
    setter: (v: boolean) => Promise<void>,
  ) => () => setter(!current);
```

- [ ] **Step 4: Add Attention Settings section**

In the General tab content, after the "Session Settings" div and before the "Tip" div (around line 305), add:

```tsx
          {/* Attention Settings */}
          <div className="pt-4 border-t border-slate-800">
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
              {t("settings.toastFilters")}
            </label>
            <div className="space-y-2">
              {/* Command Bar Toggle */}
              <SettingsToggle
                label={t("settings.commandBar")}
                checked={commandBarEnabled}
                onChange={makeToggle(commandBarEnabled, setCommandBarEnabled)}
              />
              {/* Click to Focus Toggle */}
              <SettingsToggle
                label={t("settings.clickToFocus")}
                checked={clickToFocusEnabled}
                onChange={makeToggle(clickToFocusEnabled, setClickToFocusEnabled)}
              />
              {/* Toast Filter Toggles */}
              <div className="pt-2 border-t border-slate-800/50">
                <p className="text-slate-500 text-xs mb-2">Show toasts for:</p>
                <SettingsToggle
                  label={t("settings.filterPermission")}
                  checked={toastFilterPermission}
                  onChange={makeToggle(toastFilterPermission, setToastFilterPermission)}
                />
                <SettingsToggle
                  label={t("settings.filterError")}
                  checked={toastFilterError}
                  onChange={makeToggle(toastFilterError, setToastFilterError)}
                />
                <SettingsToggle
                  label={t("settings.filterTaskComplete")}
                  checked={toastFilterTaskComplete}
                  onChange={makeToggle(toastFilterTaskComplete, setToastFilterTaskComplete)}
                />
                <SettingsToggle
                  label={t("settings.filterArrival")}
                  checked={toastFilterArrival}
                  onChange={makeToggle(toastFilterArrival, setToastFilterArrival)}
                />
              </div>
            </div>
          </div>
```

- [ ] **Step 5: Add SettingsToggle sub-component**

Add inside the file (above the main component) or at the bottom before export:

```tsx
function SettingsToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}): ReactNode {
  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChange();
        }
      }}
      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer hover:border-slate-600 transition-colors"
    >
      <span className="text-slate-300 text-sm">{label}</span>
      <div
        className={`w-9 h-5 rounded-full relative transition-colors ${
          checked ? "bg-purple-500" : "bg-slate-600"
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </div>
    </div>
  );
}
```

Also add `ReactNode` to the import from React if not already there (it is — line 3).

- [ ] **Step 6: Run typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/overlay/SettingsModal.tsx
git commit -m "feat: add attention settings toggles in SettingsModal"
```

---

### Task 12: Tour Integration

**Files:**
- Modify: `frontend/src/components/tour/TourOverlay.tsx`

- [ ] **Step 1: Read TourOverlay.tsx**

Read: `frontend/src/components/tour/TourOverlay.tsx` — focus on the existing useEffect hooks that handle `advanceOn` conditions (lines 27-72).

- [ ] **Step 2: Add focus-popup advance condition**

Add import at the top:

```ts
import { useAttentionStore } from "@/stores/attentionStore";
```

Add a new `useEffect` after the existing advance condition effects (after the click handler effect, around line 72):

```ts
  // Advance on focus-popup
  useEffect(() => {
    if (!step || step.advanceOn.kind !== "focus-popup") return;
    const unsubscribe = useAttentionStore.subscribe(
      (state, prevState) => {
        if (state.focusPopup && !prevState.focusPopup) {
          setTimeout(advanceStep, 100);
        }
      },
    );
    return unsubscribe;
  }, [step, advanceStep]);
```

- [ ] **Step 3: Run typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tour/TourOverlay.tsx
git commit -m "feat: wire tour focus-popup advance condition to attention store"
```

---

### Task 13: Integration Test & Final Polish

**Files:**
- All modified files

- [ ] **Step 1: Run full typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS — fix any remaining issues

- [ ] **Step 2: Run linter**

Run: `cd frontend && bun run lint`
Expected: PASS — fix any warnings

- [ ] **Step 3: Run build**

Run: `cd frontend && bun run build`
Expected: PASS — no build errors

- [ ] **Step 4: Start dev server and manually test**

Run: `make dev-tmux`

Test the following scenarios:
1. Press `Cmd+K` — command bar should open
2. Type an agent name — should filter to that agent's focus command
3. Click an agent in the canvas — popup should appear near the agent
4. Click "Focus Terminal" in popup — should bring Terminal.app to foreground
5. Run simulation — toasts should appear for events (arrivals, completions)
6. Check Settings — all attention toggles should be present and functional
7. Dismiss toasts — clicking X or clicking toast should dismiss it
8. Run the tour — "Inspect an Agent" step should advance when clicking an agent

- [ ] **Step 5: Fix any issues found during testing**

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: attention/command system and click-to-focus integration"
```

---

## Self-Review

**1. Spec coverage:**
- Attention store with toast queue: Task 2 ✓
- Urgency scoring (4 levels): Task 2 ✓
- Command bar with fuzzy search: Task 5 ✓
- Attention toasts with auto-dismiss: Task 4 ✓
- Click-to-focus on canvas: Tasks 6, 7 ✓
- Agent popup with terminal focus: Task 6 ✓
- Settings toggles: Tasks 3, 11 ✓
- Tour integration: Task 12 ✓
- i18n keys: Task 1 ✓
- Header bell icon: Task 10 ✓

**2. Placeholder scan:** No TBDs, TODOs, or "implement later" patterns. All steps contain code.

**3. Type consistency:**
- `AttentionToast` interface defined in Task 2, used consistently in Task 4
- `FocusPopupState` defined in Task 2, used in Task 6
- `AgentAnimationState` imported from gameStore, used in Task 6
- `EventType` from generated types, used in Task 2
- Preferences setter pattern matches existing store (Task 3)
- `selectActiveToasts`, `selectUnreadCount`, `selectFocusPopup` exported from attentionStore, used in components
