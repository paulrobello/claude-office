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
