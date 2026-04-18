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
