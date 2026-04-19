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
