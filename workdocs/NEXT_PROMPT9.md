# NEXT_PROMPT9 — Coder for Plan 2 Task 8 (wire CampusView into page.tsx)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md` — ViewTransition + page.tsx wiring
- `workdocs/PLAN.md` — Task 8 details
- `workdocs/TAKEAWAYS.md`
- `frontend/src/app/page.tsx` (has pre-existing uncommitted WIP — see note below)
- `frontend/src/components/navigation/ViewTransition.tsx`
- `frontend/src/components/views/CampusView.tsx`
- `frontend/src/hooks/useRunList.ts`
- `frontend/src/stores/navigationStore.ts`

## Your task

**Task 8: Wire CampusView into page.tsx + ViewTransition.**

Changes:
1. `frontend/src/app/page.tsx`: call `useRunList()` to bootstrap run data;
   default view becomes `"campus"`. Legacy views (building/floor/room) stay
   reachable via navigationStore actions but not the default.
2. `frontend/src/components/navigation/ViewTransition.tsx`: add branches
   for `"campus" | "run-office" | "nook"`. Campus → CampusView. Run-office
   / nook → placeholders (Tasks 9/13 implement them) — render
   `<div>TODO: RunOfficeView (T9)</div>` or similar so navigation works.
3. Ensure the existing single-session renderer (OfficeGame) still works
   via legacy nav paths — do not break it.

## Constraints — IMPORTANT: pre-existing WIP

`page.tsx` already has uncommitted changes on this branch from a stash pop
(unrelated to Plan 2 — from prior work). Your job:
- Make your Plan 2 changes cleanly layered on top.
- Stage **only the lines your task requires** (use `git add -p` / diff-stage).
- Commit only the Task 8 changes. Do not commit the unrelated WIP.
- If the WIP conflicts structurally with your changes, write a TAKEAWAYS
  note describing the conflict and proceed with minimal disruption.

Same rule for any other modified frontend files.

## Success criteria (PLAN.md)

- `make dev-tmux` brings up campus view at localhost:3000.
- Legacy building/floor views still accessible via navigationStore.
- View transitions animate between campus ↔ run-office ↔ nook.
- `make checkall` passes.

## When done

Mark Task 8 ✅. Commit: `feat(runs): wire CampusView as default + ViewTransition routing (Plan 2 Task 8)`. Exit.
