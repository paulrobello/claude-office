# NEXT_PROMPT18 — Coder for Plan 2 Task 17 (simulation integration)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md`, `workdocs/PLAN.md` (Task 17), `workdocs/TAKEAWAYS.md`
- `frontend/src/components/layout/HeaderControls.tsx`
- Backend simulation entry point: `make simulate` target in `Makefile` +
  the script it invokes. Check if it currently emits run_start /
  run_phase_change / run_end / role_session_joined.

## Your task

**Task 17: Simulation script integration.**

Ensure a full run lifecycle can be simulated end-to-end from the UI:
1. Inspect the existing simulate pipeline. If it does NOT emit run events,
   extend the simulation script to emit:
   - `run_start` (creates run)
   - 2-3 `role_session_joined` (joins designer, coder, verifier)
   - `run_phase_change` A→B→C→D
   - `plan_task` status updates (todo → in_progress → done for at least 2 tasks)
   - `run_end` with outcome
2. Verify the existing "Simulate" button in HeaderControls triggers this
   pipeline. If not connected, wire it up or add a "Simulate Run" button.
3. Smoke-test: click simulate → office appears, phase ticks, task slides,
   office dims. No console errors.

Backend changes permitted ONLY for the simulate script (backend/scripts/ or
wherever sim lives). Do NOT touch Run model / endpoints / broadcast service.

## Constraints

- Do NOT stage pre-existing WIP frontend files.
- Keep sim changes minimal — a few extra event emissions.

## Success criteria (PLAN.md)

- Simulation produces visible run lifecycle on campus view.
- All 3 animation classes (office-appear, phase-tint, task-slide) trigger.
- No console errors during sim flow.
- `make checkall` passes.

## When done

Mark Task 17 ✅. Commit: `feat(runs): simulate full run lifecycle (Plan 2 Task 17)`. Exit.
