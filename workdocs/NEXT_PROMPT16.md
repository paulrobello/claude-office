# NEXT_PROMPT16 — Coder for Plan 2 Task 15 (Breadcrumb)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md`, `workdocs/PLAN.md` (Task 15), `workdocs/TAKEAWAYS.md`
- `frontend/src/components/navigation/Breadcrumb.tsx`
- `frontend/src/stores/navigationStore.ts`
- `frontend/src/stores/runStore.ts`

## Your task

**Task 15: Breadcrumb updates for 3-tier navigation.**

Update `Breadcrumb.tsx` to reflect the new hierarchy:
- Campus view → "Campus"
- Run Office → "Campus / Run ral-xxx (Phase B)"
- Nook → "Campus / Run ral-xxx / Coder" (or just "Campus / Hot-desk" for null runId)

Clicking a segment navigates back:
- "Campus" → goToCampus()
- "Run ral-xxx (Phase B)" → goToRunOffice(runId)

Use short run_id (first 12 chars) for display. Read phase and role from
runStore + navigationStore.

## Constraints

- Preserve legacy breadcrumb behavior for building/floor/room views if any exists.
- Do NOT stage pre-existing WIP.

## Success criteria (PLAN.md)

- Breadcrumb text updates correctly at each level.
- Clicking segments navigates back.
- `make checkall` passes.

## When done

Mark Task 15 ✅. Commit: `feat(runs): Breadcrumb for 3-tier nav (Plan 2 Task 15)`. Exit.
