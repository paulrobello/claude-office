# NEXT_PROMPT15 — Coder for Plan 2 Task 14 (hot-desk drill-down)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md`, `workdocs/PLAN.md` (Task 14), `workdocs/TAKEAWAYS.md`
- `frontend/src/components/campus/HotDeskArea.tsx`
- `frontend/src/components/views/NookDrillDown.tsx` (Task 13)
- `frontend/src/stores/navigationStore.ts`

## Your task

**Task 14: Hot-desk drill-down.**

Modify `frontend/src/components/campus/HotDeskArea.tsx`:
- Clicking a hot-desk booth → `goToNook(null, sessionId)` (null runId = hot-desk path).
- Ensure `NookDrillDown` handles the `runId === null` case: NookSidebar hides
  run-specific fields (role/task_id) and shows just session_id + elapsed time.

Adjust `NookDrillDown.tsx` / `NookSidebar.tsx` as needed for the null-runId case.

## Constraints

- Do NOT break existing run-nook drill-down (Task 13 path).
- Do NOT stage pre-existing WIP.

## Success criteria (PLAN.md)

- Clicking hot-desk booth opens OfficeGame for that session.
- Back button returns to CampusView.
- No confusion between hot-desk and run-office nook paths.
- `make checkall` passes.

## When done

Mark Task 14 ✅. Commit: `feat(runs): hot-desk drill-down via goToNook(null, sessionId) (Plan 2 Task 14)`. Exit.
