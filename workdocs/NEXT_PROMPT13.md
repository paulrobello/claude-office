# NEXT_PROMPT13 — Coder for Plan 2 Task 12 (role character animations)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md` — role character arrive/leave spec
- `workdocs/PLAN.md` — Task 12 details
- `workdocs/TAKEAWAYS.md`
- `frontend/src/components/office/RoleNook.tsx` (Task 9)

## Your task

**Task 12: Role character animations (arrive/leave).**

Create `frontend/src/styles/nook-animations.css`. Modify `RoleNook.tsx`:
- Character arrives: fade-in 500ms when session joins the run in that role.
- Character leaves: fade-out 300ms when session stops.
- Nook background lights up / dims accordingly.

Detect transitions using `useRef(prevSessionId)` pattern.

## Constraints

- Pure CSS keyframes. GPU-composited only (opacity/transform).
- Do NOT stage pre-existing WIP.

## Success criteria (PLAN.md)

- Adding session to `run.memberSessionIds` with role → fade-in triggered.
- Removing it → fade-out triggered.
- Nook background transitions lit ↔ dim.
- `make checkall` passes.

## When done

Mark Task 12 ✅. Commit: `feat(runs): RoleNook character arrive/leave animations (Plan 2 Task 12)`. Exit.
