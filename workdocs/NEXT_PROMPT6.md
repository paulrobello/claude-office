# NEXT_PROMPT6 — Coder for Plan 2 Task 5 (navigation store extension)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md`, `workdocs/PLAN.md`, `workdocs/TAKEAWAYS.md`
- `frontend/src/stores/navigationStore.ts`
- `frontend/src/types/navigation.ts`

## Your task

**Task 5: Navigation store extension.**

Extend `ViewMode` to include `"campus" | "run-office" | "nook"` (keep
existing legacy modes like `building`/`floor`/`room` — do NOT delete them
yet; Task 8 does the default-switch, legacy views stay accessible).

Add state: `activeRunId: string | null`, `activeNookSessionId: string | null`.
Add actions:
- `goToCampus()` → view="campus", clears activeRunId + activeNookSessionId
- `goToRunOffice(runId)` → view="run-office", sets activeRunId
- `goToNook(runId, sessionId)` → view="nook", sets both (runId may be null for hot-desk)

Default view remains whatever it is today — do NOT change the default in
this task; Task 8 does the `building → campus` default flip.

## Success criteria (PLAN.md)

- `goToRunOffice("ral-xxx")` sets correct state.
- `goToNook("ral-xxx", "session-123")` sets both IDs.
- `goToCampus()` resets.
- TypeScript compiles cleanly; `make checkall` passes.
- Add unit tests next to existing navigation store tests (if any; otherwise colocate).

## Constraints

- Do NOT break existing navigation consumers. If extending `ViewMode` forces
  exhaustive switch updates in consumers, update them minimally (add new
  cases, route to a no-op or placeholder — actual rendering lands in T8).
- Do NOT stage pre-existing WIP frontend changes.

## When done

Mark Task 5 ✅. Commit: `feat(runs): extend navigationStore for 3-tier campus (Plan 2 Task 5)`. Exit.
