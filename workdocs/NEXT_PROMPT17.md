# NEXT_PROMPT17 — Coder for Plan 2 Task 16 (event-driven animation triggers)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md` — event-driven triggers section
- `workdocs/PLAN.md` — Task 16 details
- `workdocs/TAKEAWAYS.md`
- `frontend/src/hooks/useWebSocketEvents.ts` — existing WS event pattern to extend
- `frontend/src/stores/runStore.ts`, `frontend/src/hooks/useRunWebSocket.ts`, `frontend/src/hooks/useRunList.ts`
- Backend: `backend/app/models/events.py` — synthetic event types (run_start, run_phase_change, run_end, role_session_joined)

## Your task

**Task 16: Event-driven animation triggers.**

Create `frontend/src/hooks/useRunEvents.ts` (new).

Behavior:
- Subscribe to the global event stream (same as `useWebSocketEvents`) or extend it.
- Recognize message types: `run_start`, `run_phase_change`, `run_end`, `role_session_joined`.
- Dispatch store updates:
  - `run_start` → `useRunStore.setRun(run)` → triggers office-appear on card mount.
  - `run_phase_change` → update Run.phase → triggers phase-tint transition.
  - `run_end` → update Run.outcome → triggers office dim.
  - `role_session_joined` → update Run.memberSessionIds → triggers role character arrive.
- Hook is called once in `page.tsx` (or wherever useRunList lives) — wire it in.

## Constraints

- Prefer extending the existing `useWebSocketEvents` pattern over a parallel WS connection.
- If extending, add the 4 new event types as switch cases dispatching to runStore.
- Do NOT stage pre-existing WIP.

## Success criteria (PLAN.md)

- `run_start` event creates a new Run (triggers office-appear).
- `run_phase_change` updates Run.phase (triggers tint).
- `run_end` updates Run.outcome (triggers dim).
- `role_session_joined` adds session to run's member list (triggers arrive).
- `make checkall` passes.

## When done

Mark Task 16 ✅. Commit: `feat(runs): event-driven animation triggers (Plan 2 Task 16)`. Exit.
