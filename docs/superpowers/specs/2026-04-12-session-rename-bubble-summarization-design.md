# Session Rename UI + AI Bubble Summarization

**Date:** 2026-04-12
**Status:** Approved

## Overview

Two features from TODO.md items 4 and 5:
1. **Session Rename UI** — Double-click sidebar session name to inline-edit via `PATCH /sessions/{id}`
2. **AI Bubble Summarization** — Long bubble text (>60 chars) truncated with ellipsis; tool use events show tool emoji

---

## Item 4: Session Rename UI

### UX Flow

1. User double-clicks session name in sidebar
2. Session name text transforms into an inline `<input>` with current name pre-filled
3. User edits and presses **Enter** (or clicks away) to save
4. Pressing **Escape** cancels the edit, restoring original name
5. On save: `PATCH /api/v1/sessions/{id}` with `{ "display_name": "New Name" }`
6. Session list refreshes; `displayName` replaces `projectName` when set

### Display Logic

- If `session.displayName` is set → show it as primary name
- Otherwise → show `projectName` (current behavior)
- Renamed sessions get a subtle visual indicator (e.g., italic or a small edit icon)

### Files (3 modifications)

| File | Changes |
|------|---------|
| `frontend/src/hooks/useSessionSwitch.ts` | Add `handleRenameSession(id, name)` → PATCH + refresh |
| `frontend/src/components/layout/SessionSidebar.tsx` | Double-click handler, inline input, `displayName ?? projectName` display |
| `frontend/src/hooks/useSessions.ts` | Export `fetchSessions` for post-rename refresh (already available) |

### Backend

No backend changes needed — `PATCH /sessions/{id}` already exists and accepts `{ "display_name": "..." }`.

### Error Handling

- PATCH failure → revert input to original name, show console error
- Empty string → treat as cancel (no PATCH call)
- Whitespace-only → trim, if empty treat as cancel

---

## Item 5: AI Bubble Summarization

### Approach

The backend `SummaryService` already produces AI-summarized text for tool calls and responses. The front-end needs:

1. **Text truncation** — When bubble text >60 chars, truncate to ~55 chars + "..."
2. **Tool emoji badges** — Tool use events consistently show an emoji icon badge on the bubble
3. **Full text on hover** — The truncated bubble shows full text via a title/tooltip mechanism

### Truncation Logic (shared utility)

```typescript
function truncateBubbleText(text: string, maxLen = 60): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
```

### Tool Emoji Mapping

Tool events already map icons via `iconMap.ts`. The bubble rendering already supports `drawIconBadge()`. Ensure tool use bubbles consistently pass the tool emoji as the `icon` field in `BubbleContent`.

### Files (3 modifications)

| File | Changes |
|------|---------|
| `frontend/src/components/game/AgentSprite.tsx` | Apply truncation to bubble text, ensure icon badge renders |
| `frontend/src/components/game/BossSprite.tsx` | Same truncation and icon badge logic |
| `frontend/src/components/game/shared/drawBubble.ts` | Extract truncation utility, add tooltip support |

### Backend

No backend changes needed — summarization already handled by `SummaryService`.

---

## Implementation Order

1. Item 4 (Session Rename UI) — self-contained, touches sidebar + hooks
2. Item 5 (Bubble Summarization) — touches PIXI rendering components

Both items are independent and could be implemented in parallel.
