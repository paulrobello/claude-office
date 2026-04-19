# NEXT_PROMPT10 — Coder for Plan 2 Task 9 (RunOfficeView)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md` — Level 2 (run office) layout: orchestrator center + 4 nooks
- `workdocs/PLAN.md` — Task 9 details
- `workdocs/TAKEAWAYS.md`
- `frontend/src/stores/runStore.ts`, `frontend/src/stores/navigationStore.ts`
- `frontend/src/components/views/CampusView.tsx` (style conventions)

## Your task

**Task 9: RunOfficeView component (static layout).**

Create:
- `frontend/src/components/views/RunOfficeView.tsx`
- `frontend/src/components/office/OrchestratorStation.tsx`
- `frontend/src/components/office/RoleNook.tsx`

Behavior:
- Reads `useNavigationStore(s => s.activeRunId)` + `useRunStore(s => s.runs.get(runId))`.
- Center: OrchestratorStation (always occupied while run is live / outcome not set).
- Four RoleNooks arranged around: Designer (TL), Coder (TR), Verifier (BL), Reviewer (BR).
- Inactive nooks (no session in `run.memberSessionIds` with that role) dim.
- Active nooks: role name + character indicator + session metadata tooltip.
- Back button calls `goToCampus()`.
- Clicking an active nook → `goToNook(runId, sessionId)` (Task 13 consumes).

No animations yet (Tasks 11/12 animate task sticky + role character). No PixiJS.

Replace the Task 8 placeholder in `ViewTransition.tsx` for the `"run-office"`
branch with `<RunOfficeView />`.

## Constraints

- Do NOT stage pre-existing WIP frontend files. Only your new files +
  ViewTransition edit + PLAN/TAKEAWAYS.
- No backend changes.

## Success criteria (PLAN.md)

- Renders with fixture Run (3 active roles, 1 inactive).
- Inactive nooks dim.
- Active nooks show role + character indicator.
- Back button calls goToCampus().
- `make checkall` passes.

## When done

Mark Task 9 ✅. Commit: `feat(runs): RunOfficeView static layout (Plan 2 Task 9)`. Exit.
