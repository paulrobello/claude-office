# NEXT_PROMPT14 — Coder for Plan 2 Task 13 (NookDrillDown)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md` — NookDrillDown wrapping spec (CRITICAL: reuse existing OfficeGame unchanged)
- `workdocs/PLAN.md` — Task 13 details
- `workdocs/TAKEAWAYS.md`
- `frontend/src/components/game/OfficeGame.tsx` (existing PixiJS renderer — do NOT modify)
- `frontend/src/stores/navigationStore.ts` (activeNookSessionId, activeRunId)
- `frontend/src/stores/runStore.ts`
- How OfficeGame receives its session today — see `frontend/src/app/page.tsx` / session switching hooks

## Your task

**Task 13: NookDrillDown wrapper.**

Create:
- `frontend/src/components/views/NookDrillDown.tsx`
- `frontend/src/components/office/NookSidebar.tsx`

Behavior:
- Reads `activeRunId` + `activeNookSessionId` from navigationStore.
- Sets the WebSocket session to `activeNookSessionId` via whatever mechanism
  the current code uses (probably `useSessionSwitch` or similar — inspect).
- Renders existing `OfficeGame` component unchanged.
- Adds `NookSidebar` overlay showing: role, model, session_id, task_id, elapsed time.
- Back button → `goToRunOffice(runId)`.

Wire into `ViewTransition.tsx` replacing the Task 8 placeholder for `"nook"`.

## Constraints

- DO NOT modify OfficeGame or any existing single-session rendering code.
- Do NOT stage pre-existing WIP frontend files.
- No PixiJS work — this is pure React wrapper + DOM sidebar.

## Success criteria (PLAN.md)

- Clicking active nook transitions to NookDrillDown.
- OfficeGame renders with correct session.
- NookSidebar shows correct metadata.
- Back button returns to RunOfficeView without state loss.
- `make checkall` passes.

## When done

Mark Task 13 ✅. Commit: `feat(runs): NookDrillDown wraps OfficeGame (Plan 2 Task 13)`. Exit.
