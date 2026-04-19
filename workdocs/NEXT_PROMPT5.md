# NEXT_PROMPT5 — Coder for Plan 2 Task 4 (useRunList)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md`, `workdocs/PLAN.md`, `workdocs/TAKEAWAYS.md`
- `frontend/src/hooks/useFloorSessions.ts` — existing fetch+poll pattern
- `frontend/src/hooks/useRunWebSocket.ts` — just created (Task 3)
- `frontend/src/stores/runStore.ts` — Task 2

## Your task

**Task 4: Run list hook (`useRunList`).**

File: `frontend/src/hooks/useRunList.ts` (new) + tests.

Behavior:
- On mount: fetches `GET /api/v1/runs`, populates `useRunStore` via `setRun`.
- Polls every 5s, syncing store (add new runs, remove ended runs).
- Manages per-run WebSocket subscriptions. Either:
  (a) Calls `useRunWebSocket(runId)` inside a child component per run, or
  (b) Manages a `Map<runId, WebSocket>` directly and parses `run_state`.

Pick whichever matches the existing patterns in the codebase (check
`useFloorSessions` / `useRoomSessions` for the fetch+poll shape).

Response type is the `Run[]` array returned by `/api/v1/runs` — camelCase.

## Success criteria (PLAN.md)

- On mount, fetches runs and populates store.
- Discovered runs on poll get WS subscriptions.
- Ended runs (outcome set) get cleaned up from subscriptions.
- TypeScript compiles cleanly; `make checkall` passes.

## Constraints

- Frontend-only. Do NOT stage pre-existing WIP.
- No leaks: unmount / ended-run cleanup must close sockets.

## When done

Mark Task 4 ✅. Commit: `feat(runs): useRunList hook (Plan 2 Task 4)`. Exit.
