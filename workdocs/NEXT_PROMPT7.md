# NEXT_PROMPT7 — Coder for Plan 2 Task 6 (CampusView component)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md` — CampusView layout, RunOfficeCard spec, HotDeskArea
- `workdocs/PLAN.md` — Task 6 details
- `workdocs/TAKEAWAYS.md`
- `frontend/src/stores/runStore.ts`, `frontend/src/stores/navigationStore.ts`
- Existing layout components (e.g., `frontend/src/components/views/FloorView.tsx`) for style conventions
- `frontend/CLAUDE.md`

## Your task

**Task 6: CampusView component (static layout, no animations yet).**

Create:
- `frontend/src/components/views/CampusView.tsx`
- `frontend/src/components/campus/RunOfficeCard.tsx`
- `frontend/src/components/campus/HotDeskArea.tsx`
- `frontend/src/components/campus/CampusSidebar.tsx`

Behavior per SPEC:
- CampusView renders RunOfficeCard for each run from `useRunStore` + central HotDeskArea + CampusSidebar.
- RunOfficeCard: short run_id, phase badge (A/B/C/D with color), role-nook indicators (lit/dim), mini task progress bar. Clicking it → `goToRunOffice(runId)`.
- HotDeskArea: renders ad-hoc booths for sessions where `session.run_id == null`. Use `selectHotDeskSessions`.
- CampusSidebar: run count + summary stats.
- Pure DOM/CSS. No PixiJS.

Use existing session data source (check FloorView / useSessions) for the hot-desk filter input.

## Constraints

- Do NOT wire CampusView into page.tsx yet — Task 8 does that.
- Do NOT add animations yet — Task 7 does that.
- No backend changes.
- Do NOT stage pre-existing WIP frontend files; only new files + PLAN/TAKEAWAYS.

## Success criteria (PLAN.md)

- CampusView renders with fixture data (component test: 2 runs + 3 hot-desk sessions).
- Phase color + occupancy correct on cards.
- HotDeskArea filters correctly.
- Clicking card calls `goToRunOffice(runId)`.
- TypeScript compiles cleanly; `make checkall` passes.

## When done

Mark Task 6 ✅. Commit: `feat(runs): CampusView static layout (Plan 2 Task 6)`. Exit.
