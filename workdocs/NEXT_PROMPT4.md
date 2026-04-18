# NEXT_PROMPT4 — Coder for Plan 2 Task 3 (useRunWebSocket)

You are a **coder agent** (🔨) in the Ralph workflow (Phase B). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read `~/.claude/plugins/cache/tesseron-tools/ralph/1.0.1/skills/ralph-workflow/SKILL.md`
and `agents/coder.md`. Continue from **B2**.

## Workdocs to read first

- `workdocs/SPEC.md` — WS protocol for `_run:<run_id>` channel
- `workdocs/PLAN.md` — Task 3 details
- `workdocs/TAKEAWAYS.md`
- `frontend/src/hooks/useWebSocketEvents.ts` — existing WS pattern to mirror
- `frontend/src/stores/runStore.ts` — just created in Task 2

## Your task

**Task 3: Run WebSocket hook (`useRunWebSocket`).**

File: `frontend/src/hooks/useRunWebSocket.ts` (new) + tests.

Behavior:
- Accepts `runId: string | null`. If null, no connection.
- Connects to `ws://<host>/ws/_run:<runId>` — derive host same way existing
  WS hooks do.
- On `run_state` message, parses and calls `useRunStore.getState().setRun(run)`.
- Reconnects on close with 2s backoff (cap at ~10s).
- Cleans up on unmount or runId change.

## Constraints

- Frontend-only.
- Do NOT stage pre-existing uncommitted WIP.
- Match the existing WS hook patterns — don't invent a new abstraction.
- Must not leak connections on rapid runId changes.

## Success criteria (per PLAN.md)

- Hook connects when given a valid runId.
- Dispatches setRun on incoming `run_state` message.
- Disconnects cleanly on unmount.
- TypeScript compiles cleanly; `make checkall` passes.

## When done

Mark Task 3 ✅. Commit: `feat(runs): useRunWebSocket hook (Plan 2 Task 3)`. Exit.
