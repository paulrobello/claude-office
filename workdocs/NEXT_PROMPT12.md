# NEXT_PROMPT12 — Coder for Plan 2 Task 11 (TaskWhiteboard animations)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md` — TaskWhiteboard animation spec
- `workdocs/PLAN.md` — Task 11 details
- `workdocs/TAKEAWAYS.md`
- `frontend/src/components/office/TaskWhiteboard.tsx` (Task 10)
- `frontend/src/styles/campus-animations.css` (pattern reference)

## Your task

**Task 11: TaskWhiteboard animations (sticky slides).**

Create `frontend/src/styles/task-animations.css` (or colocate CSS).
Modify `TaskWhiteboard.tsx` to animate status transitions:
- todo → in_progress: sticky slides right (~400ms).
- in_progress → done: slides right + checkmark scale-in (100ms).

Track previous status per task (e.g., `useRef<Map<taskId, status>>`) to
detect transitions and apply an animation class briefly.

GPU-composited properties only: transform, opacity.

## Constraints

- Pure CSS keyframes; no new animation library.
- Do NOT stage pre-existing WIP.

## Success criteria (PLAN.md)

- Changing task status triggers slide animation.
- Checkmark appears on done tasks.
- No layout thrashing.
- `make checkall` passes.

## When done

Mark Task 11 ✅. Commit: `feat(runs): TaskWhiteboard sticky slide animations (Plan 2 Task 11)`. Exit.
