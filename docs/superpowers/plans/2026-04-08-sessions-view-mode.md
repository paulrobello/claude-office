# Sessions View Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Sessions" view mode to the 3-segment control (Office | Projects | Sessions), where each individual session gets its own mini-office room in the multi-room grid.

**Architecture:** Reuse the existing `MultiRoomCanvas` by making it data-agnostic (accepts a `rooms` prop). A new `selectSessionRooms` selector in `projectStore` transforms `ProjectGroup[]` into one room per session by grouping agents by `sessionId`. The segment control grows from 2 to 3 options. Clicking a session room selects that session and switches to Office view, with a back button to return.

**Tech Stack:** React, @pixi/react (PixiJS), Zustand, TypeScript

---

## File Structure

### Modified files
| File | Changes |
|------|---------|
| `frontend/src/types/projects.ts:8` | Add `"sessions"` to `ViewMode` type |
| `frontend/src/stores/projectStore.ts:25-51` | Add `previousViewMode` state, replace `setViewMode` to track previous, add `goBackToMultiRoom` action, add `selectSessionRooms` selector with fallback for agents without sessionId |
| `frontend/src/components/game/MultiRoomCanvas.tsx:43-82` | Accept `rooms` and `onRoomClick` props instead of reading store; keep existing container structure (label+room inside single scaled container) |
| `frontend/src/components/game/OfficeGame.tsx:117,197-202,283-294` | Route `"sessions"` mode to MultiRoomCanvas with session-derived rooms; compute canvas size; add session room click handler via custom DOM event |
| `frontend/src/app/page.tsx:417-431` | 3-segment control (Office/Projects/Sessions); back button using flex layout; listen for `office:select-session` custom event |

### Notes
- **No new files.** All changes modify existing files.
- **No backend changes.** Agents already carry `sessionId` from the backend (`backend/app/models/agents.py:65`).
- **Agent type:** The generated `Agent` interface (`frontend/src/types/generated.ts:276-288`) uses `[k: string]: unknown` index signature. `sessionId` is available at runtime but typed as `unknown`. The selector casts it via `String()`.
- **Custom DOM events:** The codebase already uses this pattern — see `useWebSocketEvents.ts:402` dispatching `session-deleted` and `useSessions.ts:102` listening for it.

---

## Task 1: Add `"sessions"` to ViewMode Type

**Files:**
- Modify: `frontend/src/types/projects.ts:8`

- [ ] **Step 1: Update ViewMode type**

```typescript
// frontend/src/types/projects.ts:8
// Change:
export type ViewMode = "overview" | "room-detail" | "all-merged";
// To:
export type ViewMode = "overview" | "room-detail" | "all-merged" | "sessions";
```

- [ ] **Step 2: Verify no type errors**

Run: `cd /Users/apple/Projects/others/random/claude-office/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add frontend/src/types/projects.ts
git commit -m "feat(types): add 'sessions' to ViewMode type"
```

---

## Task 2: Add `selectSessionRooms` Selector + Back Navigation State

**Files:**
- Modify: `frontend/src/stores/projectStore.ts`

- [ ] **Step 1: Add `previousViewMode` state, replace `setViewMode`, add `goBackToMultiRoom`**

In `ProjectStoreState` interface, add two new fields:

```typescript
// Add to interface ProjectStoreState (after existing fields):
  previousViewMode: ViewMode | null;
  goBackToMultiRoom: () => void;
```

In the store implementation, add `previousViewMode` initial value and **replace** the existing `setViewMode` on line 31:

```typescript
// Add after line 29 (activeRoomKey: null,):
  previousViewMode: null,

// REPLACE line 31 (setViewMode: (mode) => set({ viewMode: mode }),) with:
  setViewMode: (mode) => set((state) => ({
    viewMode: mode,
    previousViewMode: state.viewMode,
  })),

// Add after setActiveRoom:
  goBackToMultiRoom: () => set((state) => ({
    viewMode: state.previousViewMode === "sessions" ? "sessions" : "overview",
    previousViewMode: null,
  })),
```

- [ ] **Step 2: Add `selectSessionRooms` selector with fallback**

Add after the existing selectors at the bottom of the file:

```typescript
/**
 * Derive one ProjectGroup per session from the project-grouped data.
 * Each agent carries `sessionId` at runtime (via [k: string]: unknown index signature).
 * Falls back to treating whole project as one room if no agents have sessionId.
 */
export const selectSessionRooms = (s: ProjectStoreState): ProjectGroup[] => {
  const sessionMap = new Map<string, {
    agents: ProjectGroup["agents"];
    project: ProjectGroup;
  }>();

  for (const project of s.projects) {
    // If no agents have sessionId, treat the whole project as one "session"
    const hasSessionIds = project.agents.some((a) => (a as Record<string, unknown>).sessionId);
    if (!hasSessionIds) {
      sessionMap.set(project.key, { agents: project.agents, project });
      continue;
    }
    for (const agent of project.agents) {
      const sid = String((agent as Record<string, unknown>).sessionId ?? "unknown");
      if (!sessionMap.has(sid)) {
        sessionMap.set(sid, { agents: [], project });
      }
      sessionMap.get(sid)!.agents.push(agent);
    }
  }

  return Array.from(sessionMap.entries()).map(([sid, { agents, project }]) => ({
    key: sid,
    name: `${project.name} · ${sid.slice(0, 8)}`,
    color: project.color,
    root: project.root,
    agents,
    boss: project.boss,
    sessionCount: 1,
    todos: project.todos,
  }));
};

export const selectPreviousViewMode = (s: ProjectStoreState) => s.previousViewMode;
```

- [ ] **Step 3: Verify no type errors**

Run: `cd /Users/apple/Projects/others/random/claude-office/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add frontend/src/stores/projectStore.ts
git commit -m "feat(store): add selectSessionRooms selector and back navigation"
```

---

## Task 3: Make MultiRoomCanvas Data-Agnostic + Clickable

**Files:**
- Modify: `frontend/src/components/game/MultiRoomCanvas.tsx`

The current component reads `selectProjects` from the store. Change it to accept `rooms` and `onRoomClick` props instead. **Keep the existing container structure** where label and room are both inside a single scaled `pixiContainer`.

- [ ] **Step 1: Update props interface and remove store dependency**

```typescript
// Change the interface from:
interface MultiRoomCanvasProps {
  textures: OfficeTextures;
}
// To:
import type { ProjectGroup } from "@/types/projects";

interface MultiRoomCanvasProps {
  textures: OfficeTextures;
  rooms: ProjectGroup[];
  onRoomClick?: (roomKey: string) => void;
}
```

Remove the `useProjectStore` and `selectProjects` imports — no longer needed.

- [ ] **Step 2: Replace component body to use props**

Keep the existing container structure (label + room inside a single scaled container):

```typescript
export function MultiRoomCanvas({
  textures,
  rooms,
  onRoomClick,
}: MultiRoomCanvasProps): ReactNode {
  if (rooms.length === 0) {
    return null;
  }

  return (
    <>
      {rooms.map((room, index) => {
        const pos = getRoomPosition(index);
        return (
          <pixiContainer
            key={room.key}
            x={pos.x}
            y={pos.y}
            scale={ROOM_SCALE}
            eventMode={onRoomClick ? "static" : "auto"}
            cursor={onRoomClick ? "pointer" : "default"}
            onPointerTap={() => onRoomClick?.(room.key)}
          >
            {/* Label at top (nudged down 4px full-scale = 2px rendered) */}
            <pixiContainer y={4}>
              <RoomLabel
                name={room.name}
                color={room.color}
                agentCount={room.agents.length}
                sessionCount={room.sessionCount}
              />
            </pixiContainer>
            {/* Room content below label */}
            <pixiContainer y={LABEL_H}>
              <RoomProvider project={room}>
                <OfficeRoom textures={textures} />
              </RoomProvider>
            </pixiContainer>
          </pixiContainer>
        );
      })}
    </>
  );
}
```

Also remove the unused `useShallow` import.

- [ ] **Step 3: Verify type errors are only in OfficeGame (expected)**

Run: `cd /Users/apple/Projects/others/random/claude-office/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: Errors in `OfficeGame.tsx` about missing `rooms` prop — fixed in Task 4.

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add frontend/src/components/game/MultiRoomCanvas.tsx
git commit -m "refactor(MultiRoomCanvas): accept rooms prop instead of reading store"
```

---

## Task 4: Wire Sessions Mode into OfficeGame

**Files:**
- Modify: `frontend/src/components/game/OfficeGame.tsx`

- [ ] **Step 1: Import new selector**

Update the projectStore import (line 49):

```typescript
// Change:
import { useProjectStore, selectViewMode, selectProjects } from "@/stores/projectStore";
// To:
import { useProjectStore, selectViewMode, selectProjects, selectSessionRooms } from "@/stores/projectStore";
```

- [ ] **Step 2: Add sessionRooms selector inside component**

After the existing `projects` selector:

```typescript
const sessionRooms = useProjectStore(useShallow(selectSessionRooms));
```

- [ ] **Step 3: Update canvas sizing logic**

Replace the current `multiRoomSize` and `appWidth`/`appHeight` calculations (around lines 197-202):

```typescript
// Replace:
//   const multiRoomSize = useMemo(
//     () => getMultiRoomCanvasSize(Math.max(1, projects.length)),
//     [projects.length]
//   );
//   const appWidth = viewMode === "overview" ? multiRoomSize.width : CANVAS_WIDTH;
//   const appHeight = viewMode === "overview" ? multiRoomSize.height : canvasHeight;
// With:
const isMultiRoom = viewMode === "overview" || viewMode === "sessions";
const multiRoomRooms = viewMode === "sessions" ? sessionRooms : projects;
const multiRoomSize = useMemo(
  () => getMultiRoomCanvasSize(Math.max(1, multiRoomRooms.length)),
  [multiRoomRooms.length]
);
const appWidth = isMultiRoom ? multiRoomSize.width : CANVAS_WIDTH;
const appHeight = isMultiRoom ? multiRoomSize.height : canvasHeight;
```

- [ ] **Step 4: Add session room click handler**

Add inside the component (uses custom DOM event, same pattern as `useWebSocketEvents.ts:402`):

```typescript
const handleSessionRoomClick = useCallback((sessionId: string) => {
  window.dispatchEvent(new CustomEvent("office:select-session", { detail: { sessionId } }));
  useProjectStore.getState().setViewMode("all-merged");
}, []);
```

- [ ] **Step 5: Update render conditions**

Replace the render logic (around lines 283-294):

```tsx
// Replace:
//   {spritesLoaded && viewMode === "overview" && (
//     <MultiRoomCanvas textures={textures} />
//   )}
//   {spritesLoaded && viewMode !== "overview" && (
// With:
{spritesLoaded && isMultiRoom && (
  <MultiRoomCanvas
    textures={textures}
    rooms={multiRoomRooms}
    onRoomClick={viewMode === "sessions" ? handleSessionRoomClick : undefined}
  />
)}
{spritesLoaded && !isMultiRoom && (
```

- [ ] **Step 6: Verify no type errors**

Run: `cd /Users/apple/Projects/others/random/claude-office/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add frontend/src/components/game/OfficeGame.tsx
git commit -m "feat(OfficeGame): wire sessions view mode to MultiRoomCanvas"
```

---

## Task 5: 3-Segment Control + Back Button + Session Event Listener

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Update segment control from 2 to 3 options**

Change the view mode toggle (around line 417-431):

```tsx
{/* View Mode Toggle */}
<div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-slate-800/80 rounded-md p-0.5 backdrop-blur-sm">
  {(["all-merged", "overview", "sessions"] as const).map((mode) => (
    <button
      key={mode}
      onClick={() => setViewMode(mode)}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        viewMode === mode
          ? "bg-purple-600 text-white"
          : "text-slate-400 hover:text-white hover:bg-slate-700"
      }`}
    >
      {mode === "all-merged"
        ? "Office"
        : mode === "overview"
          ? "Projects"
          : "Sessions"}
    </button>
  ))}
  {/* Back button when navigated from sessions/projects to office via room click */}
  {viewMode === "all-merged" && previousViewMode && (previousViewMode === "sessions" || previousViewMode === "overview") && (
    <button
      onClick={goBackToMultiRoom}
      className="ml-1 px-2 py-1 text-xs rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors border-l border-slate-600"
    >
      {previousViewMode === "sessions" ? "← Sessions" : "← Projects"}
    </button>
  )}
</div>
```

- [ ] **Step 2: Add store subscriptions for back navigation**

Near the existing `viewMode` and `setViewMode` subscriptions (around line 124-125), add:

```typescript
import { selectPreviousViewMode } from "@/stores/projectStore";

const previousViewMode = useProjectStore(selectPreviousViewMode);
const goBackToMultiRoom = useProjectStore((s) => s.goBackToMultiRoom);
```

- [ ] **Step 3: Add session selection event listener**

Add a `useEffect` in page.tsx to listen for the custom event from OfficeGame:

```typescript
// Listen for session room clicks from OfficeGame (custom DOM event pattern,
// same as session-deleted in useWebSocketEvents.ts:402 / useSessions.ts:102)
useEffect(() => {
  const handler = (e: Event) => {
    const sessionId = (e as CustomEvent).detail?.sessionId;
    if (sessionId) {
      handleSessionSelect(sessionId);
    }
  };
  window.addEventListener("office:select-session", handler);
  return () => window.removeEventListener("office:select-session", handler);
}, [handleSessionSelect]);
```

- [ ] **Step 4: Verify no type errors**

Run: `cd /Users/apple/Projects/others/random/claude-office/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: PASS

- [ ] **Step 5: Manual test**

1. Run `make dev-tmux` from project root
2. Open `http://localhost:3000`
3. Verify 3-segment control shows: Office | Projects | Sessions
4. Click "Sessions" — each session should appear as its own room
5. Click a session room — should switch to Office view with that session selected
6. Verify "← Sessions" back button appears inline after the segment control
7. Click back button — should return to Sessions view
8. Verify Projects view still works as before

- [ ] **Step 6: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add frontend/src/app/page.tsx
git commit -m "feat(page): 3-segment control with sessions view, back navigation"
```
