# Context Switching Command Center — Design Spec

**Goal:** Reduce context switching cost for the Panopticon (user) managing multiple AI agents across products, by surfacing what needs attention, enabling instant agent access, and providing context resumption on jump.

**Architecture:** Two components — AttentionEngine (Zustand store deriving urgency scores from existing gameStore data) and CommandBar (CMD+K popup with ranked agents + passive notification layer). No new backend endpoints required.

**Tech Stack:** React, Zustand (subscribeWithSelector), existing gameStore + SummaryService, lucide-react.

---

## 1. AttentionEngine (Zustand store)

Subscribes to `gameStore.agents` and recomputes a ranked attention list on every state change. Purely derived state — no polling, no new WebSocket.

### AttentionEntry type

```typescript
interface AttentionEntry {
  agentId: string;
  agentName: string;
  floorId: string;
  floorName: string;
  urgencyScore: number;        // 0-100
  category: "blocked" | "waiting" | "completed" | "idle";
  summary: string;             // Haiku-generated, ~60 chars
  timeline: TimelineAction[];  // Last 4 actions
  lastActivityAt: number;      // Timestamp of last event
}

interface TimelineAction {
  icon: string;   // emoji: 📖 Read, ✏️ Edit, 💻 Bash, etc.
  label: string;  // short: "auth.ts", "npm test", etc.
}
```

### Urgency scoring

| Priority | Category | Signal | Score | Notification |
|----------|----------|--------|-------|-------------|
| 1 | **Blocked** | Error state, permission denied, tool failure | 90-100 | Immediate toast + optional sound |
| 2 | **Waiting** | Question asked, needs confirmation | 70-89 | Toast after 5s debounce |
| 3 | **Completed** | Task finished, PR ready, tests passing | 40-69 | Silent badge only |
| 4 | **Idle** | No events for 2+ min while session active | 10-39 | Silent badge, scales with duration |

### Signal detection from existing gameStore data

- **Blocked**: `agent.backendState === "error"` or bubble text contains "error"/"permission"/"failed"
- **Waiting**: `agent.backendState === "waiting"` or bubble type is question/confirmation
- **Completed**: `agent.backendState === "completed"` or `"finished"`
- **Idle**: Time since last state change exceeds threshold

### Idle scoring scales with duration

- 2 min idle = score 10
- 5 min = 20
- 10 min = 30
- 15+ min = 39

### Score decay

Completed notifications drop from 60 to 40 over 30 seconds if not acted on, keeping the list fresh.

### Store interface

```typescript
interface AttentionState {
  entries: AttentionEntry[];
  activeCount: number;           // agents with score > 0
  highestUrgency: "blocked" | "waiting" | "completed" | "idle" | null;

  // Notification state
  pendingToasts: AttentionEntry[];
  soundEnabled: boolean;

  setSoundEnabled: (enabled: boolean) => void;
  dismissToast: (agentId: string) => void;
}
```

---

## 2. CommandBar (React component)

### Trigger

- CMD+K (Mac) / Ctrl+K (Windows) keyboard shortcut
- Clickable `⌘K` badge in HeaderControls (next to TOUR button)

### Layout

Centered modal overlay, ~500px wide, max 60vh tall. Dark theme matching existing UI.

### Structure

Each row in the ranked list shows:
- Urgency dot (red/yellow/green/gray)
- Agent name + floor name
- Category badge (BLOCKED / WAITING / COMPLETED / IDLE + duration)
- Haiku-generated summary (one line)
- Action timeline (last 3-4 actions as emoji icons)

### Keyboard interaction

- Arrow keys move selection (highlighted row)
- Enter: jump to selected agent (navigate + focus)
- Typing: fuzzy filters by agent name, floor name, task, or summary
- Escape: close

### Mouse interaction

- Click any row to jump
- Scroll to navigate long lists
- Hover shows subtle highlight

### Search

Client-side fuzzy match against agent name, floor name, current task, and summary text. No backend call.

---

## 3. Notification Layer

### Header badge

Small counter next to the `⌘K` button showing agents needing attention. Color matches highest urgency:
- Red: any agent blocked
- Yellow: any agent waiting
- Green: only completed
- No badge: no attention needed

### Toast notifications

- Triggered when an agent crosses into BLOCKED or WAITING
- Slim toast slides in from bottom-right (above existing status toast)
- Shows: urgency dot + agent name + one-line reason
- Auto-dismisses after 8 seconds
- Clickable: opens command bar with that agent pre-selected
- Max 2 toasts stacked (older ones collapse into badge count)
- Debounced: same agent re-triggering within 10 seconds = no duplicate

### Sound

- Optional single "ping" for BLOCKED events only
- Controlled by preference toggle (default: off)
- Stored in preferencesStore alongside existing preferences

### No interruption guarantee

Toasts and badges never block interaction. `pointer-events-none` except click targets. Command bar never auto-opens.

---

## 4. Context Resumption — "Jump to Agent"

When selecting an agent from the command bar:

1. **Navigate**: If not on the agent's floor, trigger `goToFloor(floorId)` with zoom transition (~400ms). Skip if already there.
2. **Focus**: Set `focusedCharacter` in gameStore to open the focus popup on that agent.
3. **Dismiss**: Command bar closes immediately on selection.

Total time from "which agent?" to "looking at that agent with context": under 1 second.

### Timeline data source

Derived from existing `eventLog` in gameStore. When a tool_use, error, completion, or question event fires for an agent, it's appended to that agent's timeline in the AttentionEngine. Icons:

| Icon | Action |
|------|--------|
| 📖 | Read |
| ✏️ | Edit |
| 💻 | Bash |
| 🔍 | Search (Grep/Glob) |
| 🤖 | Agent/Task spawn |
| ✅ | Test pass |
| ❌ | Error/Fail |
| ❓ | Question/Waiting |
| 🎉 | Completed |

### Summary source

Reuses `SummaryService.summarize_bubble_text()` already in the system. The AttentionEngine reads the latest bubble text from each agent as the summary. No new API calls needed.

---

## 5. Data attributes and integration points

### New keyboard shortcut

- CMD+K / Ctrl+K: global listener on `window`, opens CommandBar
- Must not conflict with browser's address bar (CMD+L) or existing shortcuts (D, P, Q, L)

### HeaderControls changes

- Add `⌘K` button with urgency badge counter
- Props: `onOpenCommandBar`, `attentionCount`, `highestUrgency`

### gameStore integration

- AttentionEngine subscribes to `agents` map changes via `subscribeWithSelector`
- Reads `agent.backendState`, `agent.bubble`, `agent.phase`, `agent.currentTask`
- No modifications to gameStore needed

### preferencesStore addition

- `attentionSoundEnabled: boolean` (default: false)
