# NEXT_PROMPT11 — Coder for Plan 2 Task 10 (TaskWhiteboard)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md` — TaskWhiteboard spec
- `workdocs/PLAN.md` — Task 10 details
- `workdocs/TAKEAWAYS.md`
- `frontend/src/types/run.ts` (PlanTask type)
- `frontend/src/components/views/RunOfficeView.tsx` (just created, Task 9)

## Your task

**Task 10: TaskWhiteboard component (sticky columns).**

Create `frontend/src/components/office/TaskWhiteboard.tsx`. Render RunOfficeView
appropriately to include it (likely bottom or side panel — consult SPEC).

Behavior:
- Three columns: `todo | in_progress | done` (optionally a fourth for `stuck`).
- Each PlanTask renders as a colored sticky-note card.
- Data from `run.planTasks` in runStore.
- Empty columns show placeholder text.

No animations yet (Task 11 adds slide animations).

## Constraints

- Pure DOM/CSS.
- Do NOT stage pre-existing WIP frontend files.

## Success criteria (PLAN.md)

- Renders tasks in correct columns by status.
- Empty columns show placeholder.
- Task count matches fixture data.
- `make checkall` passes.

## When done

Mark Task 10 ✅. Commit: `feat(runs): TaskWhiteboard static columns (Plan 2 Task 10)`. Exit.
