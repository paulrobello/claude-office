# NEXT_PROMPT3 — Coder for Plan 2 Task 2 (useRunStore)

You are a **coder agent** (🔨) in the Ralph workflow (Phase B). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read `~/.claude/plugins/cache/tesseron-tools/ralph/1.0.1/skills/ralph-workflow/SKILL.md`
and `agents/coder.md`. Continue from **B2**.

## Workdocs to read first

- `workdocs/SPEC.md` — the `RunState` interface and selector contracts
- `workdocs/PLAN.md` — Task 2 details
- `workdocs/TAKEAWAYS.md` — Zustand store rationale (why not gameStore)

## Your task

**Task 2: Run state store (`useRunStore`).**

Files (create):
- `frontend/src/stores/runStore.ts`
- `frontend/src/types/run.ts`
- test file (colocate per existing frontend test conventions — check
  `frontend/` for patterns, likely `*.test.ts` next to source or under
  `__tests__/`).

TypeScript types: `Run`, `PlanTask`, `RunPhase`, `RunOutcome`, `PlanTaskStatus`,
`RunStats`. Use camelCase (backend serializes camelCase via alias_generator).
Mirror backend `backend/app/models/runs.py` field names.

Store API (Zustand):
- State: `runs: Map<string, Run>`, `activeRunId: string | null`
- Actions: `setRun(run)`, `removeRun(runId)`, `setActiveRun(runId | null)`,
  `clear()`
- Selectors (exported): `selectRuns`, `selectActiveRun`,
  `selectHotDeskSessions(sessions)` — filters `session.run_id == null`

## Constraints

- Frontend-only. Do NOT touch backend.
- Do NOT stage pre-existing uncommitted WIP on the branch — only stage
  your new files and any PLAN.md/TAKEAWAYS.md edits.
- Types must match backend camelCase serialization (check an existing
  Session-consuming hook for the pattern).
- Run `cd frontend && npm run lint && npm run typecheck` (or the equivalent
  from `frontend/CLAUDE.md` / package.json scripts). If there are unit
  tests, run them. `make checkall` from repo root is the final gate.

## Success criteria

Per PLAN.md Task 2:
- Store unit test: `setRun` adds; `removeRun` deletes.
- `selectHotDeskSessions` filters correctly.
- TypeScript compiles cleanly.

## When done

Mark Task 2 ✅ in PLAN.md. Commit:
`feat(runs): useRunStore + run types (Plan 2 Task 2)`. Exit.
