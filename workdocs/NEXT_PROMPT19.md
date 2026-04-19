# NEXT_PROMPT19 — Coder for Plan 2 Task 18 (final integration + cleanup)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md` — ALL success criteria (SC-1 through SC-9)
- `workdocs/PLAN.md` — Task 18 details
- `workdocs/TAKEAWAYS.md`

## Your task

**Task 18: Final integration test + cleanup.**

End-to-end verification:
1. `make dev-tmux` brings up campus view at localhost:3000.
2. No runs → only hot-desk visible (no ghost offices).
3. `python scripts/simulate_events.py run_lifecycle` (or equivalent) →
   full run lifecycle with animations visible.
4. Drill-down from a nook → OfficeGame works.
5. Back navigation → no state loss.
6. `make checkall` passes.
7. Remove dead imports, unused fixtures, and TODO comments left over from
   Tasks 8's placeholder routing.

Verify every SC-1 … SC-9 from SPEC.md explicitly. Document each in a
markdown table in TAKEAWAYS.md under `## Plan 2 final verification`.

## About pre-existing WIP

There's unrelated frontend WIP (page.tsx port fix, hook edits, etc.) on
the branch. For this final task: if the WIP is clean and functional, you
MAY commit it as a separate `chore: tidy pre-existing WIP` commit — but
only if it doesn't change behavior beyond what's needed for Plan 2's
success criteria. If unsure, leave it uncommitted.

## Constraints

- No new features. Cleanup and verification only.

## Success criteria (PLAN.md)

- All SC-1..SC-9 pass (document in TAKEAWAYS).
- No TypeScript errors. No ESLint warnings. No console errors during sim.
- Clean git status outside `workdocs/` (or pre-existing WIP documented).
- `make checkall` green.

## When done

Mark Task 18 ✅. Update PLAN.md to ALL ✅. Commit: `test(runs): Plan 2 final integration + cleanup (Task 18)`. Exit.
