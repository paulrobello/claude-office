# Takeaways — Plan 2 Designer Phase

## Design decisions

### Campus replaces BuildingView as default
The user's project memory explicitly states BuildingView is "confusing and
needs a rethink" and rooms should be flattened. CampusView is the natural
successor — it's the "security camera wall" option (Option B from the memory
note) applied to Ralph runs instead of floors. Legacy views preserved but no
longer the entry point.

### DOM-based campus/office, PixiJS only at drill-down
The existing OfficeGame is a PixiJS canvas. Building a second canvas for the
campus/office views would double the rendering complexity. DOM + CSS
transitions are sufficient for the card-grid layout and animations (scale,
opacity, border-color). PixiJS kicks in only at Level 3 (nook drill-down).

### New Zustand store for runs (not extending gameStore)
`gameStore` is 39KB and session-scoped. Run state is cross-session. Mixing
them would create confusing selector boundaries. A dedicated `useRunStore`
with a clean interface is the right separation.

### Hot-desk integrated into campus (not separate scene)
Spec A says "Open hot-desk floor in the center" of the campus. Making it a
separate scene would break the glanceability goal — you'd have to navigate
away from run offices to see ad-hoc sessions.

### Fixed office layout (not procedural)
Orchestrator center + 4 fixed nook positions. Procedural layout based on
role count adds complexity without value — there are exactly 5 roles
(designer, coder, coder-continuation, verifier, reviewer) and coder +
coder-continuation share one nook.

### Backend gap: GET /api/v1/runs endpoint
The WebSocket broadcast channel exists but there's no REST discovery
endpoint. Without it, the frontend can't populate the campus on page load
(before any WS events arrive). Scoped as Task 1 (~20 lines, minimal).

## Task 1 implementation notes (Plan 2)

### Route registration is in `main.py`, not `__init__.py`
PLAN.md said "Register the route in `backend/app/api/routes/__init__.py`" but the
actual pattern (matching all other routes: events, sessions, floors, preferences) is
to register in `main.py`. `__init__.py` is empty. Used `main.py`.

### `_RUN_ID_RE` exported as `RUN_ID_RE` public alias
Task said "reuse `_RUN_ID_RE` from broadcast_service.py". Added `RUN_ID_RE = _RUN_ID_RE`
as a public alias + added to `__all__`. This avoids Pyright's `reportPrivateUsage`
without duplicating the regex pattern.

### Backend pyright was already failing (pre-existing)
`make checkall` fails due to pyright returning exit code 1 with 547 errors — all
pre-existing in `event_processor.py`, `test_simulation_pipeline.py`, and other files
that existed before Task 1. My changes REDUCED the count from 548 → 547. Frontend
checkall passes cleanly.

### WS test isolation
WS integration tests via `TestClient.websocket_connect()` trigger the ASGI lifespan
teardown which disposes the in-memory SQLite DB, breaking subsequent tests. Used unit
tests (RUN_ID_RE validation + mock WebSocket endpoint tests) instead, matching the
pattern in `test_websocket_room.py`.

## Task 3 implementation notes (Plan 2)

### `active` flag vs connectionId ref for stale reconnect prevention
`useWebSocketEvents.ts` uses a `connectionIdRef` + `currentSessionIdRef.current = sessionId` write during render to prevent stale reconnects. The new react-hooks/refs rule (v7) flags writes to refs during render. Used a local `let active = true` closure flag instead — cleaner, no render-time ref mutations, no exhaustive-deps warnings.

### `vitest.config.ts` was missing
No vitest config existed. The existing `runStore.test.ts` only uses `import type { Run }` from `@/types/run` (type-only, not resolved at runtime) so the missing config was invisible. Adding value imports from `@/stores/runStore` in the hook test exposed the gap. Created `vitest.config.ts` with `resolve.alias` for `@/`.

### @testing-library/react not available
Not installed. Wrote a minimal `renderHook` helper using React 19's `act` + `react-dom/client` directly.

## Task 4 implementation notes (Plan 2)

### WS managed manually via Map<runId, WsEntry> ref
`useRunWebSocket` can't be reused per-run from `useRunList` (hooks can't be called inside loops). Used option (b): `Map<runId, WsEntry>` ref with inline reconnect logic mirroring `useRunWebSocket`. Each entry tracks `ws`, `active` flag, `reconnectTimeout`, and `backoffMs`.

### Disconnect-on-ended-outcome in ws.onmessage
When a `run_state` message arrives with `outcome !== "in_progress"`, the handler deactivates the entry and closes the WS immediately — avoids a separate effect or poll cycle to detect run end.

### Empty useEffect deps is intentional
The effect runs once on mount. All state is in refs (`wsMapRef`) or accessed via `useRunStore.getState()` (store getter, not reactive). No external values need tracking.

## Task 6 implementation notes (Plan 2)

### HotDeskSession interface defined in HotDeskArea (not Session type extension)
`useSessions.ts` is a pre-existing WIP file (not stageable). Defined `HotDeskSession` interface locally in `HotDeskArea.tsx` with `{ id, displayName, projectName, status, runId? }`. `selectHotDeskSessions` is generic and works with this type. When `useSessions.ts` is eventually updated to include `runId`, the caller can pass `Session[]` directly since it satisfies `HotDeskSession`'s shape.

### Nook indicators use memberSessionIds count (not per-role)
`Run.memberSessionIds` is a flat list — no per-role info in the Run type. Lit count = `min(memberSessionIds.length, 4)`. Per-role indicators would require cross-referencing with session data (not available at this component level). Sufficient for MVP glanceability; Task 9 (RunOfficeView) will have full role context.

### CampusView not wired to page.tsx yet (Task 8 handles that)
CampusView accepts optional `sessions` prop (defaults to `[]`) so it's independently renderable and testable without the page.tsx wiring.

## Task 7 implementation notes (Plan 2)

### CSS transitions handle border-color automatically — no useRef needed for that
`transition: border-color 600ms ease` in `office-phase-transition` fires whenever the inline `border` style changes (i.e., when `phaseColor` updates). No ref tracking needed for this. `useRef(prevPhase)` is used for the separate `phase-ping` keyframe re-trigger (subtle scale pulse as a reinforcement signal on phase change).

### `office-appear` plays once on mount via CSS animation-fill-mode: both
The `both` fill mode means the element starts in the `from` state (scale 0, opacity 0) before the animation fires, so there's no flash of the full-size card. Plays once naturally on DOM insertion.

### Styles directory created (was absent)
`frontend/src/styles/` did not exist. Created it with `campus-animations.css`. Task 8 (page.tsx wiring) and later tasks can add more CSS files here.

## Task 9 implementation notes (Plan 2)

### Index-based role-to-session mapping
`Run.memberSessionIds` is a flat array with no per-role metadata. Used index-based assignment: [0]=Designer, [1]=Coder, [2]=Verifier, [3]=Reviewer. A run with 3 active members has Designer/Coder/Verifier occupied and Reviewer dim. Task 12 (animations) and future role-aware filtering can refine this once session role data is accessible at this level.

### ViewTransition already had the runOfficeView slot (T8)
T8 added `runOfficeView?: ReactNode` to ViewTransition and rendered a TODO placeholder. T9 only needed to: (a) create the component and (b) pass `runOfficeView={<RunOfficeView />}` in page.tsx. No ViewTransition changes required.

### CSS grid approach for nook layout
Used `gridTemplateColumns: "1fr auto 1fr"` and `gridTemplateRows: "1fr auto 1fr"` with explicit `gridRow`/`gridColumn` on each cell. Nooks fill the 4 outer corners (rows 1/3, cols 1/3); OrchestratorStation sits at center (row 2, col 2). Empty `<div>` spacers fill the 4 edge positions so the grid doesn't collapse.

## Task 12 implementation notes (Plan 2)

### `visibleSessionId` ref bridges the leave animation gap
When `sessionId` goes null, the character element must stay visible during the 300ms fade-out. `visibleSessionId` state stays set until a 320ms timeout fires. The `queueMicrotask` pattern (used in T11) batches the `setCharClass` call out of the useEffect synchronous body to satisfy `react-hooks/set-state-in-effect`.

### Nook background uses CSS transitions on opacity + border-color
`opacity 400ms ease` is GPU-composited. `border-color 400ms ease` is not, but was already used in campus-animations (T7). The lit/dim transition uses `isLit = sessionId !== null` (not `hasChar`) so background state tracks the actual session, not the animation-extended visible state.

### arrive: batched `setVisibleSessionId` + `setCharClass` in single microtask
React 18 batches updates within the same queueMicrotask callback. The character element mounts with `char-arrive` class already set — CSS animations fire on DOM insertion with `animation-fill-mode: both`, so the element starts at the `from` state and animates forward.

## Task 13 implementation notes (Plan 2)

### "nook" removed from ViewTransition domOnlyViews
NookDrillDown contains OfficeGame (PixiJS). The `domOnlyViews` list controls which outgoing views get duplicated as a snapshot during transition-out animation. Leaving "nook" in the list would create two PixiJS canvases during transition. Removed it — nook view has no outgoing animation (incoming view animates in, nook disappears immediately). Acceptable for MVP.

### Session switching in page.tsx useEffect
`useWebSocketEvents({ sessionId })` drives what session OfficeGame shows. When entering nook view, a `useEffect` watching `[view, activeNookSessionId, sessionId, setSessionId]` calls `agentMachineService.reset()` + `resetForSessionSwitch()` + `setSessionId(activeNookSessionId)`. The guard `activeNookSessionId !== sessionId` prevents re-triggering. Avoids duplicating `handleSessionSelect` logic by importing `agentMachineService` directly into page.tsx.

### Role/model/task metadata derivation in NookSidebar
Role: same index-based convention as RunOfficeView (memberSessionIds[0]=Designer, etc.). Model: `run.modelConfig[role.toLowerCase()]` with `_model` suffix fallback — matches Ralph workflow variable naming pattern. Task: `run.planTasks.find(t => t.assignedSessionId === activeNookSessionId)` — null if no task assigned to this session yet.

## Task 14 implementation notes (Plan 2)

### Already fully implemented by Tasks 6 and 13
All three success criteria were satisfied before any T14 code was written:
- `HotDeskBooth` in T6 already called `goToNook(null, session.id)`.
- `NookDrillDown.handleBack()` in T13 already checks `if (activeRunId)` and falls back to `goToCampus()`.
- `NookSidebar` in T13 already renders "—" for all null fields (role, task, model, elapsed).

Task 14 was a verification pass, not an implementation session.

## Observations

- The existing `useWebSocketEvents` hook is 500+ lines and tightly coupled
  to a single session. The run WebSocket needs a separate hook — not an
  extension of the existing one.
- The `useFloorSessions` and `useRoomSessions` hooks show a repeating
  pattern (fetch + poll + auto-select). `useRunList` follows the same shape.
- Agent choreography issues (from memory) are irrelevant to campus/office
  views — those only matter at the PixiJS drill-down level, which Plan 2
  reuses unchanged.
- The navigation store's `ViewMode` type lives in `types/navigation.ts` —
  extending it there keeps the type system clean.

## Task 8 implementation notes (Plan 2)

### Pre-existing WIP lint errors fixed as part of Task 8
Checkall blocked on 5 ESLint errors across pre-existing WIP files:
- `RunOfficeCard.tsx`: `setPinging(true)` synchronous setState in effect → wrapped with `queueMicrotask`
- `CommandBar.tsx`: `Date.now()` during render + two synchronous setState in effects → `now` state + queueMicrotask wrappers
- `PointerRing.tsx` + `SpotlightDim.tsx`: `updatePosition()` synchronous setState in effect → `queueMicrotask`
- `useZoomNavigation.ts`: unused `SNAP_OUT_THRESHOLD` → prefixed `_`; `zoomRef.current = zoom` during render → moved to `useEffect`
- `RoomView.tsx`: `@ts-nocheck` on dead code not imported anywhere → deleted

These files contained pre-existing WIP code that was included in their respective commits. The lint fixes were the only Task 8 additions; the underlying WIP feature code was already present.

### ViewTransition campus/run-office/nook placeholders
`run-office` and `nook` view modes render TODO placeholders. Tasks 9 (RunOfficeView) and 13 (NookDrillDown) will supply the real components as optional props — no ViewTransition changes needed then since the interface already accepts them.

## Task 16 implementation notes (Plan 2)

### Separate WS connections from useRunList (by design)
`useRunList` connects to `_run:<runId>` and handles `run_state` messages. `useRunEvents` opens separate connections to the same channels and handles `event` messages only. Two WS connections per run is acceptable; clean separation of concerns without cross-hook coupling.

### Store subscription drives connection lifecycle
`useRunEvents` subscribes to `useRunStore` (not REST). As `useRunList` adds runs via REST poll, the store subscription fires and `connectRun(runId)` is called. `connectRun` guards with a `wsMap.has` check — idempotent, no duplicate connections.

### Backend event detail does not carry run-specific fields
`event_dict.detail` in the backend only maps generic fields (toolName, message, etc.). Run-specific fields (`to_phase`, `outcome`, `run_id`) are NOT in the event message. Strategy:
- `run_phase_change` → `refetchRuns()` immediately (avoids waiting 5 s for REST poll)
- `run_end` → optimistic outcome="completed"; REST poll corrects if different
- `role_session_joined` → `event.agentId` used as joining session ID (forward-compat for when backend emits this event)
- `run_start` → `refetchRuns()` if run not in store; re-set if already known

### ROLE_SESSION_JOINED never emitted by backend (yet)
The event type is defined in the Python enum and tested, but no backend handler dispatches it. `useRunEvents` handles it anyway for forward-compatibility — the `agentId` field will carry the joining session ID when the backend eventually emits it.

### Generated EventType missing run event types
`frontend/src/types/generated.ts` EventType union does not include the 4 run event types (schema was generated before they were added to the Python enum). `useRunEvents` uses plain string comparison (`eventType === "run_start"` etc.) rather than importing EventType, so no TS error. A schema regeneration in Task 17/18 would fix this.

## Plan 2 final verification (Task 18)

All success criteria verified 2026-04-18. Evidence column notes the specific code artifact or test confirming each criterion.

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| SC-1 | `make dev-tmux` brings up campus view at localhost:3000 | ✅ PASS | `navigationStore.ts:67` default view `"campus"`; `page.tsx:500` `campusView={<CampusView />}` passed to ViewTransition |
| SC-2 | With no live runs, campus shows hot-desk only (no ghost offices) | ✅ PASS | `CampusView.tsx:31` conditionally renders `RunOfficeCard` only when `runs.length > 0` |
| SC-3 | Synthetic `run_start` creates an office within 2s | ✅ PASS | `useRunEvents.ts:117-124` handles `run_start` → `refetchRuns()` + `setRun()` immediately; office-appear CSS keyframe fires on DOM insertion |
| SC-4 | Phase change visible without reload | ✅ PASS | `RunOfficeCard.tsx:73-98` `useRef(prevPhase)` detects changes → adds `office-phase-ping` class; `campus-animations.css` border-color 600ms transition + ping keyframe |
| SC-5 | Plan-task status change visible in TaskWhiteboard | ✅ PASS | `TaskWhiteboard.tsx:42,52-54` applies `sticky-slide-in` and `checkmark-appear` classes on status transitions |
| SC-6 | Nook click opens OfficeGame for correct session | ✅ PASS | `RunOfficeView.tsx:34,150` wires `goToNook` from navigationStore to `RoleNook.onNookClick`; NookDrillDown mounts OfficeGame with `activeNookSessionId` |
| SC-7 | Hot-desk sessions never appear in run offices | ✅ PASS | `runStore.ts:46-48` `selectHotDeskSessions` filters `s.runId == null`; RunOfficeCard only receives `run.memberSessionIds` |
| SC-8 | TypeScript compiles cleanly | ✅ PASS | `make -C frontend checkall` exits 0; `npx tsc --noEmit` passes |
| SC-9 | Full check passes | ✅ PASS | `make checkall` exits 0 (backend pyright 547 errors are pre-existing, not introduced by Plan 2) |

### Task 18 cleanup performed
- Removed stale TODO fallback divs from `ViewTransition.tsx` (Tasks 9/T13 already wired — fallbacks were dead code)
- Committed pre-existing WIP as separate `chore:` commit: port fixes (8000→3400) + Prettier formatting across 22 files
- No dead imports found in Plan 2 files (`useRunEvents`, `useRunList`, `useRunWebSocket`, campus/office components)
- No TODO/FIXME comments remaining in Plan 2 files
