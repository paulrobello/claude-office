# Session Rename UI + AI Bubble Summarization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add double-click inline rename for sessions in the sidebar and truncate long bubble text with ellipsis while ensuring tool emoji badges render consistently.

**Architecture:** Session rename adds a PATCH handler in `useSessionSwitch.ts` and inline-edit UI in `SessionSidebar.tsx`. Bubble summarization adds a shared truncation utility used by both `AgentSprite.tsx` and `BossSprite.tsx` Bubble components.

**Tech Stack:** React, TypeScript, PIXI.js, fetch API

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/utils/bubbleText.ts` | Shared truncation utility for bubble text |
| Modify | `frontend/src/hooks/useSessionSwitch.ts` | Add `handleRenameSession` handler |
| Modify | `frontend/src/components/layout/SessionSidebar.tsx` | Add inline edit UI with double-click |
| Modify | `frontend/src/components/game/AgentSprite.tsx` | Apply truncation to Bubble component |
| Modify | `frontend/src/components/game/BossSprite.tsx` | Apply truncation to Bubble component |
| Modify | `frontend/src/components/views/FloorView.tsx` | Pass onRenameSession through to SessionSidebar |

---

### Task 1: Create shared bubble text truncation utility

**Files:**
- Create: `frontend/src/utils/bubbleText.ts`

- [ ] **Step 1: Create the utility file**

```typescript
/**
 * Shared bubble text utilities for speech/thought bubbles.
 *
 * Truncates text that exceeds the max character limit, appending "..."
 * to indicate truncation. Used by both AgentSprite and BossSprite bubbles.
 */

/** Maximum characters shown in a bubble before truncation. */
const BUBBLE_MAX_CHARS = 60;

/**
 * Truncate bubble text to a maximum character length.
 * Text at or below the limit is returned unchanged.
 *
 * @param text - The bubble text to potentially truncate.
 * @param maxLen - Maximum character count (default 60).
 * @returns Truncated text with "..." suffix if over limit, otherwise original.
 */
export function truncateBubbleText(
  text: string,
  maxLen: number = BUBBLE_MAX_CHARS,
): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && bun run typecheck`
Expected: PASS (no imports yet, just verifying the file)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/bubbleText.ts
git commit -m "feat: add shared bubble text truncation utility"
```

---

### Task 2: Apply truncation to AgentSprite Bubble

**Files:**
- Modify: `frontend/src/components/game/AgentSprite.tsx:83-158`

- [ ] **Step 1: Add import and apply truncation in AgentSprite Bubble**

Add import at the top of the file (after the existing imports around line 17):

```typescript
import { truncateBubbleText } from "@/utils/bubbleText";
```

In the `Bubble` component (line 83), change line 84 from:

```typescript
const { text, type = "thought", icon } = content;
```

to:

```typescript
const { type = "thought", icon } = content;
const text = truncateBubbleText(content.text);
```

This applies truncation while keeping the rest of the Bubble logic unchanged.

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/game/AgentSprite.tsx
git commit -m "feat: truncate long bubble text in agent sprites"
```

---

### Task 3: Apply truncation to BossSprite Bubble

**Files:**
- Modify: `frontend/src/components/game/BossSprite.tsx:107-183`

- [ ] **Step 1: Add import and apply truncation in BossSprite Bubble**

Add import at the top of the file (after the existing imports around line 17):

```typescript
import { truncateBubbleText } from "@/utils/bubbleText";
```

In the `Bubble` component (line 107), change line 108 from:

```typescript
const { text, type = "thought", icon } = content;
```

to:

```typescript
const { type = "thought", icon } = content;
const text = truncateBubbleText(content.text);
```

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/game/BossSprite.tsx
git commit -m "feat: truncate long bubble text in boss sprite"
```

---

### Task 4: Add rename handler to useSessionSwitch

**Files:**
- Modify: `frontend/src/hooks/useSessionSwitch.ts:19-25,134-141`

- [ ] **Step 1: Add handleRenameSession to the hook**

Add `handleRenameSession` to the `UseSessionSwitchResult` interface (line 19-25):

```typescript
interface UseSessionSwitchResult {
  handleSessionSelect: (id: string) => Promise<void>;
  handleDeleteSession: (session: Session) => Promise<void>;
  handleClearDB: () => Promise<void>;
  handleSimulate: () => Promise<void>;
  handleReset: () => void;
  handleRenameSession: (sessionId: string, newName: string) => Promise<void>;
}
```

Add the implementation before the return statement (before line 134):

```typescript
const handleRenameSession = async (
  sessionId: string,
  newName: string,
): Promise<void> => {
  const trimmed = newName.trim();
  if (!trimmed) return;

  try {
    const res = await fetch(
      `http://localhost:8000/api/v1/sessions/${sessionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: trimmed }),
      },
    );
    if (res.ok) {
      await fetchSessions();
      showStatus(t("status.sessionRenamed"), "success");
    } else {
      showStatus(t("status.failedRenameSession"), "error");
    }
  } catch (e) {
    console.error(e);
    showStatus(t("status.errorConnecting"), "error");
  }
};
```

Update the return object (line 134-141) to include the new handler:

```typescript
return {
  handleSessionSelect,
  handleDeleteSession,
  handleClearDB,
  handleSimulate,
  handleReset,
  handleRenameSession,
};
```

- [ ] **Step 2: Add i18n keys for rename status messages**

Find the i18n translation files and add the new keys. The files should be in `frontend/src/i18n/` or similar location. Add these keys to the English locale file under the `status` section:

```json
"sessionRenamed": "Session renamed",
"failedRenameSession": "Failed to rename session"
```

Add equivalent translations to other locale files (pt-BR, es, etc).

- [ ] **Step 3: Verify typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useSessionSwitch.ts frontend/src/i18n/
git commit -m "feat: add session rename handler in useSessionSwitch"
```

---

### Task 5: Add inline rename UI to SessionSidebar

**Files:**
- Modify: `frontend/src/components/layout/SessionSidebar.tsx:79-87,98-106,206-287`

- [ ] **Step 1: Update props interface**

Update `SessionSidebarProps` (lines 79-87) to accept the rename handler and pass it through:

```typescript
interface SessionSidebarProps {
  sessions: Session[];
  sessionsLoading: boolean;
  sessionId: string;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onSessionSelect: (id: string) => Promise<void>;
  onDeleteSession: (session: Session) => void;
  onRenameSession: (sessionId: string, newName: string) => Promise<void>;
}
```

Destructure it in the component (line 98-106):

```typescript
export function SessionSidebar({
  sessions,
  sessionsLoading,
  sessionId,
  isCollapsed,
  onToggleCollapsed,
  onSessionSelect,
  onDeleteSession,
  onRenameSession,
}: SessionSidebarProps): React.ReactNode {
```

- [ ] **Step 2: Add inline-edit state and helper component**

After the `toggleGroup` callback (around line 124), add a state variable for tracking which session is being edited:

```typescript
const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
```

Add a small inline component inside the file for the editable name:

```typescript
/** Editable session name — double-click to rename, Enter/blur to save, Escape to cancel. */
function EditableName({
  session,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
  className,
}: {
  session: Session;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (name: string) => void;
  onCancel: () => void;
  className?: string;
}): React.ReactNode {
  const [draft, setDraft] = useState(
    () => session.displayName ?? getProjectKey(session),
  );

  if (isEditing) {
    return (
      <input
        type="text"
        value={draft}
        autoFocus
        className="text-xs font-bold flex-1 bg-slate-700 text-white px-1 py-0 rounded outline-none border border-purple-500"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(draft);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => onCommit(draft)}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  const displayName = session.displayName ?? getProjectKey(session);

  return (
    <span
      className={className}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(session.displayName ?? getProjectKey(session));
        onStartEdit();
      }}
      title={session.displayName ? "Double-click to rename" : undefined}
    >
      {displayName}
    </span>
  );
}
```

- [ ] **Step 3: Update the primary session card to use EditableName**

In the primary session card (lines 249-257), replace the static name span with the EditableName component. Change:

```tsx
<span
  className={`text-xs font-bold truncate flex-1 ${
    primary.id === sessionId
      ? "text-purple-300"
      : "text-slate-300"
  }`}
>
  {projectKey}
</span>
```

to:

```tsx
<EditableName
  session={primary}
  isEditing={editingSessionId === primary.id}
  onStartEdit={() => setEditingSessionId(primary.id)}
  onCommit={(name) => {
    setEditingSessionId(null);
    onRenameSession(primary.id, name);
  }}
  onCancel={() => setEditingSessionId(null)}
  className={`text-xs font-bold truncate flex-1 ${
    primary.id === sessionId
      ? "text-purple-300"
      : "text-slate-300"
  }`}
/>
```

- [ ] **Step 4: Update the older sessions to use displayName if set**

In the expanded older sessions list (line 330-331), change the display from truncated UUID to show `displayName` if available:

```tsx
<span className="text-[10px] text-slate-500 font-mono truncate flex-1">
  {session.displayName ?? session.id.slice(0, 12)}
</span>
```

- [ ] **Step 5: Verify typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/SessionSidebar.tsx
git commit -m "feat: add double-click inline rename for session names"
```

---

### Task 6: Pass rename handler through FloorView

**Files:**
- Modify: `frontend/src/components/views/FloorView.tsx:37-55,107-115`

- [ ] **Step 1: Add onRenameSession to FloorViewProps**

Update `FloorViewProps` (lines 37-45):

```typescript
export interface FloorViewProps {
  sessions: Session[];
  sessionsLoading: boolean;
  sessionId: string;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onSessionSelect: (id: string) => Promise<void>;
  onDeleteSession: (session: Session) => void;
  onRenameSession: (sessionId: string, newName: string) => Promise<void>;
}
```

Destructure in the component (lines 47-55):

```typescript
export function FloorView({
  sessions,
  sessionsLoading,
  sessionId,
  isCollapsed,
  onToggleCollapsed,
  onSessionSelect,
  onDeleteSession,
  onRenameSession,
}: FloorViewProps): React.ReactNode {
```

Pass it to `<SessionSidebar>` (lines 107-115):

```tsx
<SessionSidebar
  sessions={floorSessions}
  sessionsLoading={sessionsLoading}
  sessionId={sessionId}
  isCollapsed={isCollapsed}
  onToggleCollapsed={onToggleCollapsed}
  onSessionSelect={onSessionSelect}
  onDeleteSession={onDeleteSession}
  onRenameSession={onRenameSession}
/>
```

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/views/FloorView.tsx
git commit -m "feat: pass rename handler through FloorView to sidebar"
```

---

### Task 7: Wire up rename handler in page.tsx

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Destructure handleRenameSession from useSessionSwitch**

Find the `useSessionSwitch` call in `page.tsx` and add `handleRenameSession` to the destructuring:

```typescript
const { handleSessionSelect, handleDeleteSession, handleClearDB, handleSimulate, handleReset, handleRenameSession } = useSessionSwitch({ ... });
```

- [ ] **Step 2: Pass onRenameSession to SessionSidebar**

In the `<SessionSidebar>` JSX, add the prop:

```tsx
<SessionSidebar
  ...
  onRenameSession={handleRenameSession}
/>
```

- [ ] **Step 3: Pass onRenameSession to FloorView**

In the `<FloorView>` JSX, add the prop:

```tsx
<FloorView
  ...
  onRenameSession={handleRenameSession}
/>
```

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: wire up session rename handler in page component"
```

---

### Task 8: Verify everything works end-to-end

- [ ] **Step 1: Run full checkall**

Run: `make checkall`
Expected: All lint, typecheck, and test checks pass.

- [ ] **Step 2: Manual verification checklist**

Start the dev servers with `make dev-tmux` and verify:

1. **Session Rename**: Double-click a session name in sidebar → inline input appears → type new name → Enter → name updates → persists after page refresh
2. **Session Rename Cancel**: Double-click → type → Escape → original name restored
3. **Session Rename Empty**: Double-click → clear text → Enter → no PATCH sent
4. **Bubble Truncation**: Trigger events with long text (>60 chars) → bubble shows truncated text with "..."
5. **Tool Emoji**: Tool use events show the emoji icon badge on the bubble

- [ ] **Step 3: Final commit if any fixes needed**
