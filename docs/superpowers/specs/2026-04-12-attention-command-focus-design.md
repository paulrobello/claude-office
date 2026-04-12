# Attention/Command System & Click-to-Focus Design

**Date:** 2026-04-12
**Status:** Approved
**PR:** #20 remaining items

## Overview

Two features for the Claude Office Visualizer:

1. **Attention/Command System** — Zustand attention store with Cmd+K command bar (agent-focused, fuzzy search) and attention toasts with urgency scoring
2. **Click-to-Focus** — Click character in PixiJS canvas to open popup with agent info, then focus the agent's terminal via existing backend AppleScript endpoint

## Architecture

**Approach:** Unified attention store — one `attentionStore.ts` handles toasts, command actions, and focus state. The command bar is a UI layer over the same attention data.

### File Summary

| Category | Files |
|----------|-------|
| New store | `frontend/src/stores/attentionStore.ts` |
| New components | `CommandBar.tsx`, `AttentionToasts.tsx`, `AgentPopup.tsx` |
| Modified components | `page.tsx`, `useWebSocketEvents.ts`, `AgentSprite.tsx`, `HeaderControls.tsx` |
| Modified store | `preferencesStore.ts` (add settings keys) |
| i18n | 3 language files (en, es, pt-BR) |

### Component Tree Changes

```
page.tsx [modified - mount CommandBar, AttentionToasts]
├── HeaderControls.tsx [modified - add bell icon with unread count]
├── CommandBar.tsx [new - Cmd+K overlay with fuzzy search]
├── AttentionToasts.tsx [new - stacked toast notifications]
├── OfficeGame.tsx
│   ├── AgentSprite.tsx [modified - add pointertap handler]
│   ├── BossSprite.tsx (unchanged)
│   └── AgentPopup.tsx [new - agent info + focus button, React portal]
├── SessionSidebar.tsx (unchanged)
└── RightSidebar.tsx (unchanged)
```

## Feature 1: Attention Store

### State

```typescript
interface AttentionToast {
  id: string;
  agentId: string;
  agentName: string;
  eventType: EventType;
  urgency: number;       // 0-100
  title: string;
  description: string;
  createdAt: number;     // Date.now()
  autoDismissMs: number | null;  // null = persist until dismissed
  dismissed: boolean;
}

interface AttentionState {
  toastQueue: AttentionToast[];
  focusPopup: { agentId: string; screenX: number; screenY: number } | null;
  isCommandBarOpen: boolean;
  commandFilter: string;
}
```

### Urgency Scoring

Events are scored on arrival. Higher score = higher priority in queue and more prominent visual treatment.

| Event Type | Urgency | Color | Auto-Dismiss | Label |
|------------|---------|-------|--------------|-------|
| `permission_request` | 90 | Red (#f44336) | None (persist) | Critical |
| `error`, `stop` | 70 | Orange (#ff9800) | None (persist) | High |
| `task_completed` | 30 | Green (#4caf50) | 5000ms | Low |
| `subagent_start`, `background_task_notification` | 10 | Blue (#2196f3) | 3000ms | Info |

Toasts are sorted by urgency descending. Max 5 visible at once (oldest info-level dismissed first if overflow).

### Actions

- `processEvent(event)` — Called from `useWebSocketEvents`. Scores event, pushes toast if event type passes filter settings. Respects `commandBarEnabled` setting.
- `dismissToast(id)` — Remove specific toast.
- `clearAllToasts()` — Dismiss all active toasts.
- `openCommandBar()` / `closeCommandBar()` — Toggle command overlay.
- `setCommandFilter(filter)` — Update fuzzy search text.
- `openFocusPopup(agentId, screenX, screenY)` — Show agent popup at screen position.
- `closeFocusPopup()` — Hide agent popup.
- `focusAgentTerminal(agentId)` — Call `POST /api/v1/sessions/{sessionId}/focus` with optional message. Brings Terminal.app to foreground via backend AppleScript.

### Selectors

- `selectActiveToasts` — Visible toasts (not dismissed, sorted by urgency).
- `selectUnreadCount` — Count of undismissed toasts (for bell icon badge).
- `selectCommandActions` — Available commands filtered by fuzzy search text.
- `selectFocusPopupAgent` — Full agent data for popup display.

## Feature 2: CommandBar Component

**Trigger:** `Cmd+K` (macOS) / `Ctrl+K` (other). Global keyboard listener mounted in `page.tsx`.

**Layout:** Centered overlay, similar to VS Code command palette. Dark semi-transparent backdrop. Auto-focuses search input on open.

**Commands (10-15 total):**

| Command | Action |
|---------|--------|
| Focus Agent: {name} | Open focus popup for agent (one per active agent) |
| Show Attention Queue | Scroll to / highlight toast area |
| Toggle Debug View | Flip `debugMode` in gameStore |
| Toggle Path Display | Flip `showPaths` |
| Toggle Queue Slots | Flip `showQueueSlots` |
| Toggle Phase Labels | Flip `showPhaseLabels` |
| Toggle Obstacles | Flip `showObstacles` |
| Dismiss All Toasts | Clear toast queue |
| Navigate to Session: {name} | Switch active session |

**Fuzzy search:** Matches against command name and agent names. Uses simple character-by-character fuzzy matching (no library needed for this scale).

**Keyboard navigation:** Arrow keys to navigate list, Enter to execute, Escape to close.

**i18n:** All command names use translation keys. Added to all 3 language files.

## Feature 3: AttentionToasts Component

**Position:** Top-right corner of the page, stacked vertically (newest on top).

**Visual:** Color-coded left border by urgency level. Agent name + event summary. Close button (X) on each toast.

**Behavior:**
- Critical/High toasts persist until manually dismissed
- Low toasts auto-dismiss after 5 seconds
- Info toasts auto-dismiss after 3 seconds
- Clicking a toast opens the focus popup for that agent
- Max 5 visible; oldest info-level toast auto-dismissed when new one arrives and queue is full

**Animation:** Slide in from right, fade out on dismiss. CSS transitions.

## Feature 4: Click-to-Focus

### Canvas Click Handler

In `AgentSprite.tsx`, add `pointertap` event to the agent's PixiJS container:

1. On `pointertap`, get the agent's canvas position
2. Convert to screen coordinates using `react-zoom-pan-pinch` transform state
3. Call `openFocusPopup(agentId, screenX, screenY)` in attention store
4. Respects `clickToFocusEnabled` setting

### AgentPopup Component

**Positioning:** React portal rendered at document body level. Positioned near the clicked agent using screen coordinates, with viewport clamping (shifts left/up if near edges).

**Content:**
- Agent name + color dot
- Agent state (e.g., "working", "waiting_permission")
- Current task description
- Character type (subagent / lead / teammate)
- Desk number
- "Focus Terminal" button — calls `focusAgentTerminal(agentId)` which POSTs to backend
- "Close" button / Escape key / click outside

**Focus Terminal flow:**
1. User clicks "Focus Terminal" in popup
2. Frontend calls `POST /api/v1/sessions/{sessionId}/focus` (existing endpoint)
3. Backend runs AppleScript: `tell application "Terminal" to activate`
4. Optionally copies message to clipboard via `pbcopy`
5. Popup closes after focus action

### Tour Integration

The existing tour system already has `"focus-popup"` advance conditions and i18n strings. The new `AgentPopup` component's opening will trigger the tour advance, connecting the existing tour step ("Click on any character to inspect them") to the real implementation.

## Settings

All settings stored via existing `preferencesStore`, synced to backend `PUT /preferences/{key}`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `commandBarEnabled` | boolean | true | Enable Cmd+K command bar |
| `clickToFocusEnabled` | boolean | true | Enable canvas click-to-focus |
| `toastFilterPermission` | boolean | true | Show permission request toasts |
| `toastFilterError` | boolean | true | Show error/stop toasts |
| `toastFilterTaskComplete` | boolean | true | Show task completed toasts |
| `toastFilterArrival` | boolean | true | Show agent arrival toasts |
| `toastAutoDismissLow` | number | 5000 | Auto-dismiss timeout for low urgency (ms) |
| `toastAutoDismissInfo` | number | 3000 | Auto-dismiss timeout for info urgency (ms) |

These are exposed in the existing settings UI (gear icon in header).

## i18n Keys

New keys added to `frontend/src/i18n/locales/{en,es,pt-BR}.json`:

```
attention.toast.permissionRequest - "{agentName} needs permission"
attention.toast.error - "{agentName} encountered an error"
attention.toast.taskCompleted - "{agentName} completed a task"
attention.toast.agentArrived - "{agentName} joined the office"
attention.commandBar.placeholder - "Type a command..."
attention.commandBar.focusAgent - "Focus Agent: {name}"
attention.commandBar.showAttention - "Show Attention Queue"
attention.commandBar.dismissAll - "Dismiss All Toasts"
attention.commandBar.toggleDebug - "Toggle Debug View"
attention.popup.focusTerminal - "Focus Terminal"
attention.popup.close - "Close"
attention.popup.state - "State"
attention.popup.task - "Task"
attention.popup.type - "Type"
attention.popup.desk - "Desk"
settings.commandBar - "Command Bar (Cmd+K)"
settings.clickToFocus - "Click to Focus"
settings.toastFilters - "Toast Notifications"
settings.toastAutoDismiss - "Auto-dismiss Timing"
```

## Data Flow

```
WebSocket Event
    ↓
useWebSocketEvents.ts [modified]
    ↓ (calls attentionStore.processEvent)
attentionStore.ts [new]
    ├── score urgency → push toast if filter passes
    ├── AttentionToasts.tsx [new] ← subscribes to toastQueue
    ├── CommandBar.tsx [new] ← subscribes to commands + filter
    └── AgentPopup.tsx [new] ← subscribes to focusPopup
            ↓ (user clicks "Focus Terminal")
        POST /api/v1/sessions/{sessionId}/focus
            ↓
        Terminal.app activated via AppleScript
```

## Constraints

- Backend focus endpoint already exists — no backend changes needed for click-to-focus
- Settings use existing preferencesStore/backend sync — no new API needed
- PixiJS click handling uses `pointertap` (not `click`) for touch/mouse compatibility
- React portal for AgentPopup avoids PixiJS z-index issues
- Tour system integration uses existing `"focus-popup"` advance condition
