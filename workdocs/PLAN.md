# Plan 2 — Frontend Implementation Tasks

## Task overview

18 tasks. Each is one focused coder session. Dependencies noted inline.

---

## Phase 1: Foundation (Tasks 1–4)

### ✅ Task 1: Backend discovery endpoint + WebSocket channel verification

Session: completed cleanly. Route registered in main.py (not __init__.py — PLAN was incorrect about location). `_RUN_ID_RE` exported as public `RUN_ID_RE` alias to avoid Pyright private-usage error. WS tests use unit/mock approach (TestClient.websocket_connect() causes lifespan teardown isolation issues). Pre-existing pyright failures in backend — not introduced by this task (reduced from 548→547 errors).

**Files:** `backend/app/api/routes/runs.py` (new), `backend/app/api/routes/__init__.py`, `backend/app/api/websocket.py`

Add `GET /api/v1/runs` returning all active (non-ended) runs as JSON array.
Verify that the WebSocket manager supports frontend subscription to
`_run:<run_id>` channels — if the channel prefix needs registration, add it.

**Success criteria:**
- `curl localhost:3400/api/v1/runs` returns `[]` when no runs exist.
- `curl localhost:3400/api/v1/runs` returns Run objects when runs are active.
- WebSocket connection to `ws://localhost:3400/ws/_run:ral-20260418-a7f3`
  succeeds (101 upgrade) without error.
- `make checkall` passes.

**Dependencies:** None.

---

### ✅ Task 2: Run state store (`useRunStore`)

Session: completed cleanly. Colocated test at `frontend/src/stores/runStore.test.ts` (10 tests, all pass). Pre-existing lint/pyright failures in backend and WIP files are unchanged. Frontend typecheck clean.

**Files:** `frontend/src/stores/runStore.ts` (new), `frontend/src/types/run.ts` (new), `frontend/src/stores/runStore.test.ts` (new)

Create Zustand store per SPEC.md `RunState` interface. Define TypeScript
types for `Run`, `PlanTask`, `RunStats`. Export selectors:
`selectRuns`, `selectActiveRun`, `selectHotDeskSessions`.

**Success criteria:**
- Store unit test: setRun adds a run, removeRun deletes it. ✅
- `selectHotDeskSessions` correctly filters sessions with `run_id == null`. ✅
- TypeScript compiles cleanly. ✅

**Dependencies:** None.

---

### ✅ Task 3: Run WebSocket hook (`useRunWebSocket`)

**Files:** `frontend/src/hooks/useRunWebSocket.ts` (new)

Hook that connects to `ws://localhost:3400/ws/_run:<runId>`, parses
`run_state` messages, and dispatches `setRun()` on `useRunStore`.
Handles reconnection (2s backoff), cleanup on unmount/runId change.

Session: completed cleanly. Hook uses `active` flag (not connectionId ref) to prevent stale reconnects — cleaner than existing hook pattern and satisfies react-hooks/refs lint rule. Created `vitest.config.ts` with `@/` alias (missing, caused test resolution failure). Tests at `frontend/src/hooks/useRunWebSocket.test.ts` (7 tests, all pass). Pre-existing lint errors in WIP files unchanged. Frontend typecheck clean.

**Files:** `frontend/src/hooks/useRunWebSocket.ts` (new), `frontend/src/hooks/useRunWebSocket.test.ts` (new), `frontend/vitest.config.ts` (new)

**Success criteria:**
- Hook connects when given a valid runId. ✅
- Dispatches setRun on incoming `run_state` message. ✅
- Disconnects cleanly on unmount. ✅
- TypeScript compiles cleanly. ✅

**Dependencies:** Task 2.

---

### ✅ Task 4: Run list hook (`useRunList`)

Session: completed cleanly. Manages a `Map<runId, WsEntry>` ref directly (option b) — hooks can't be called in a loop so `useRunWebSocket` can't be reused per-run from a hook. Disconnect-on-ended-outcome wired in `ws.onmessage`. 8 tests, all pass. Pre-existing lint errors in WIP files unchanged. Frontend typecheck clean.

**Files:** `frontend/src/hooks/useRunList.ts` (new), `frontend/src/hooks/useRunList.test.ts` (new)

Hook that fetches `GET /api/v1/runs` on mount + every 5s poll. Populates
`useRunStore`. Manages WebSocket subscriptions for each discovered run
(calls `useRunWebSocket` per run or manages connections manually).

**Success criteria:**
- On mount, fetches runs and populates store. ✅
- New runs discovered on poll get WebSocket subscriptions. ✅
- Ended runs (outcome != in_progress) get cleaned up from subscriptions. ✅
- TypeScript compiles cleanly. ✅

**Dependencies:** Tasks 1, 2, 3.

---

## Phase 2: Campus View (Tasks 5–8)

### 🔧 Task 5: Navigation store extension

**Files:** `frontend/src/stores/navigationStore.ts`, `frontend/src/types/navigation.ts`

Add view modes `"campus" | "run-office" | "nook"` to `ViewMode` type.
Add actions: `goToCampus()`, `goToRunOffice(runId)`, `goToNook(runId, sessionId)`.
Add state: `activeRunId`, `activeNookSessionId`.
Set default view to `"campus"` instead of `"building"`.

**Success criteria:**
- `goToRunOffice("ral-xxx")` sets view="run-office" and activeRunId.
- `goToNook("ral-xxx", "session-123")` sets view="nook" and both IDs.
- `goToCampus()` resets to campus view.
- TypeScript compiles cleanly.

**Dependencies:** None.

---

### ⬜ Task 6: CampusView component (static layout)

**Files:** `frontend/src/components/views/CampusView.tsx` (new), `frontend/src/components/campus/RunOfficeCard.tsx` (new), `frontend/src/components/campus/HotDeskArea.tsx` (new), `frontend/src/components/campus/CampusSidebar.tsx` (new)

Build the Level 1 campus layout. RunOfficeCard shows: run_id (short),
phase badge, role nook indicators (lit/dim), task progress mini-bar.
HotDeskArea shows ad-hoc session booths. CampusSidebar shows run count +
summary stats. All data-driven from `useRunStore` + sessions.

**Success criteria:**
- CampusView renders with fixture data (2 runs, 3 hot-desk sessions).
- RunOfficeCard shows correct phase color and occupancy.
- HotDeskArea shows only sessions with run_id == null.
- Clicking a RunOfficeCard calls `goToRunOffice(runId)`.
- TypeScript compiles cleanly.

**Dependencies:** Tasks 2, 5.

---

### ⬜ Task 7: CampusView animations (office appear + phase tint)

**Files:** `frontend/src/components/campus/RunOfficeCard.tsx`, `frontend/src/styles/campus-animations.css` (new)

Add CSS keyframe animations per SPEC:
- Office appear: scale 0→1, 300ms ease-out on mount.
- Phase tint: border-color transition 600ms on phase change.
- Office dim: opacity 0.5 + outcome glyph on run end.

**Success criteria:**
- New RunOfficeCard animates in (visual check / className assertion).
- Changing phase in store triggers border-color transition.
- Setting outcome != in_progress dims the card.
- No animation jank (GPU-composited properties only: transform, opacity).

**Dependencies:** Task 6.

---

### ⬜ Task 8: Wire CampusView into page.tsx + ViewTransition

**Files:** `frontend/src/app/page.tsx`, `frontend/src/components/navigation/ViewTransition.tsx`

Replace `BuildingView` as default with `CampusView` in the desktop branch.
Extend ViewTransition to handle `"campus" | "run-office" | "nook"` modes.
Add `useRunList()` call in page.tsx to bootstrap run data.

**Success criteria:**
- `make dev-tmux` → campus view loads at localhost:3000.
- Legacy building/floor views still accessible (not deleted).
- View transitions animate between campus ↔ run-office ↔ nook.
- `make checkall` passes.

**Dependencies:** Tasks 4, 5, 6, 7.

---

## Phase 3: Run Office View (Tasks 9–12)

### ⬜ Task 9: RunOfficeView component (static layout)

**Files:** `frontend/src/components/views/RunOfficeView.tsx` (new), `frontend/src/components/office/OrchestratorStation.tsx` (new), `frontend/src/components/office/RoleNook.tsx` (new)

Build the Level 2 interior layout. Center: OrchestratorStation (always
occupied while run is live). Four RoleNooks around it: Designer (top-left),
Coder (top-right), Verifier (bottom-left), Reviewer (bottom-right).
Inactive nooks dim. Active nook has role character indicator + session
metadata tooltip.

**Success criteria:**
- Renders correctly with a fixture Run (3 active roles, 1 inactive).
- Inactive nooks have dim styling.
- Active nooks show role name + character indicator.
- Back button calls `goToCampus()`.
- TypeScript compiles cleanly.

**Dependencies:** Tasks 2, 5.

---

### ⬜ Task 10: TaskWhiteboard component (sticky columns)

**Files:** `frontend/src/components/office/TaskWhiteboard.tsx` (new)

Three-column kanban: todo | in_progress | done. Each PlanTask renders as
a sticky note (colored by status). Data from `Run.planTasks` in store.

**Success criteria:**
- Renders tasks in correct columns based on status.
- Empty columns show placeholder text.
- Task count matches fixture data.
- TypeScript compiles cleanly.

**Dependencies:** Task 2.

---

### ⬜ Task 11: TaskWhiteboard animations (sticky slides)

**Files:** `frontend/src/components/office/TaskWhiteboard.tsx`, `frontend/src/styles/task-animations.css` (new)

Animate task status transitions:
- todo → in_progress: sticky slides right (~400ms).
- in_progress → done: slides right + checkmark scale-in (100ms).
Uses `layoutId` or CSS `transition` on position change. Track previous
status to detect transitions.

**Success criteria:**
- Changing a task status in store triggers slide animation.
- Checkmark appears on done tasks.
- No layout thrashing during animation.

**Dependencies:** Task 10.

---

### ⬜ Task 12: Role character animations (arrive/leave)

**Files:** `frontend/src/components/office/RoleNook.tsx`, `frontend/src/styles/nook-animations.css` (new)

- Character arrives: fade-in 500ms when session joins run.
- Character leaves: fade-out 300ms when session stops.
- Nook background lights up/dims accordingly.

**Success criteria:**
- Adding a session to run.memberSessionIds with a role fades in character.
- Removing it fades out.
- Nook background transitions between lit/dim states.

**Dependencies:** Task 9.

---

## Phase 4: Nook Drill-Down (Tasks 13–14)

### ⬜ Task 13: NookDrillDown wrapper

**Files:** `frontend/src/components/views/NookDrillDown.tsx` (new), `frontend/src/components/office/NookSidebar.tsx` (new)

Wrap existing OfficeGame with session context. When user clicks an active
nook in RunOfficeView, transition to NookDrillDown which:
- Sets the WebSocket session to the nook's session_id.
- Renders OfficeGame (existing, unchanged).
- Adds NookSidebar showing: role, model, session_id, task_id, elapsed time.
- Back button returns to RunOfficeView.

**Success criteria:**
- Clicking active nook transitions to NookDrillDown.
- OfficeGame renders with correct session's agents/events.
- NookSidebar shows correct metadata.
- Back button returns to RunOfficeView without state loss.
- TypeScript compiles cleanly.

**Dependencies:** Tasks 5, 9.

---

### ⬜ Task 14: Hot-desk drill-down

**Files:** `frontend/src/components/campus/HotDeskArea.tsx`

Clicking a hot-desk booth transitions to the existing OfficeGame for that
session (same as today's session selection, but triggered from CampusView).
Uses `goToNook(null, sessionId)` — null runId indicates hot-desk.

**Success criteria:**
- Clicking hot-desk booth opens OfficeGame for that session.
- Back button returns to CampusView.
- No confusion between hot-desk and run-office nook paths.

**Dependencies:** Tasks 6, 13.

---

## Phase 5: Integration + Polish (Tasks 15–18)

### ⬜ Task 15: Breadcrumb + navigation polish

**Files:** `frontend/src/components/navigation/Breadcrumb.tsx`

Update Breadcrumb to reflect 3-tier navigation:
- Campus → "Campus"
- Run Office → "Campus / Run ral-xxx (Phase B)"
- Nook → "Campus / Run ral-xxx / Coder"

**Success criteria:**
- Breadcrumb text updates correctly at each navigation level.
- Clicking breadcrumb segments navigates back correctly.
- TypeScript compiles cleanly.

**Dependencies:** Tasks 5, 8.

---

### ⬜ Task 16: Event-driven animation triggers

**Files:** `frontend/src/hooks/useRunEvents.ts` (new)

Hook that listens for synthetic events (`run_start`, `run_phase_change`,
`run_end`, `role_session_joined`) on the global WebSocket feed and
dispatches appropriate store updates + animation triggers.

Integrates with the existing `useWebSocketEvents` pattern — extends the
message handler to recognize run-related event types.

**Success criteria:**
- `run_start` event creates a new Run in store (triggers office-appear).
- `run_phase_change` updates Run.phase (triggers tint transition).
- `run_end` updates Run.outcome (triggers office dim).
- `role_session_joined` adds session to run's member list (triggers arrive).
- TypeScript compiles cleanly.

**Dependencies:** Tasks 2, 3, 7, 11, 12.

---

### ⬜ Task 17: Simulation script integration

**Files:** `frontend/src/components/layout/HeaderControls.tsx` (minimal change)

Verify that the existing "Simulate" button in HeaderControls triggers the
backend simulation which now includes run events. If the backend simulate
endpoint doesn't emit run events, add a separate "Simulate Run" button that
POSTs to a run simulation endpoint.

Ensure the full flow works: click simulate → run_start event → office
appears → phase changes → tasks progress → run_end → office dims.

**Success criteria:**
- Simulation produces a visible run lifecycle on the campus view.
- All 3 animation classes trigger during simulation.
- No console errors during simulation flow.
- `make checkall` passes.

**Dependencies:** Tasks 8, 16.

---

### ⬜ Task 18: Final integration test + cleanup

**Files:** Multiple (cleanup pass)

End-to-end verification:
1. `make dev-tmux` → campus loads.
2. No runs → only hot-desk visible.
3. Simulate → full run lifecycle with animations.
4. Drill-down → OfficeGame works.
5. Back navigation → no state loss.
6. `make checkall` passes.
7. Remove any dead imports, unused fixtures, or TODO comments.

**Success criteria:**
- All SC-1 through SC-9 from SPEC.md pass.
- No TypeScript errors.
- No ESLint warnings.
- No console errors in browser during full simulation flow.
- Clean git status (no untracked temporary files outside workdocs/).

**Dependencies:** All previous tasks.

---

## Dependency graph

```
T1 ─────────┐
T2 ──┬──────┼─── T4 ───── T8
T3 ──┘      │              │
T5 ─────────┼──── T6 ── T7 ┘
            │     │
T9 ─────────┘     │
T10 ── T11        │
T12               │
T13 ──── T14      │
T15 ──────────────┘
T16 (needs T2,T3,T7,T11,T12)
T17 (needs T8,T16)
T18 (needs all)
```

## Critical path

T1 → T2 → T3 → T4 → T8 → T16 → T17 → T18
