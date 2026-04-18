# NEXT_PROMPT2 — Coder for Plan 2 Task 1 (backend discovery endpoint)

You are a **coder agent** (🔨) in the Ralph workflow (Phase B). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`.

Model: `claude-sonnet-4-6`.

Read the Ralph skill at
`~/.claude/plugins/cache/tesseron-tools/ralph/1.0.1/skills/ralph-workflow/SKILL.md`
first, then the coder template at `agents/coder.md`. Continue from step **B2**.

## Workdocs to read first

- `workdocs/SPEC.md` — Plan 2 frontend spec (you'll implement backend bits of Task 1)
- `workdocs/PLAN.md` — implementation plan; pick Task 1
- `workdocs/TAKEAWAYS.md` — design decisions from the Plan 2 designer
- The archived Plan 1 SPEC: `git show ralph/workdocs_archive:archive/2026-04-18-spec-a-plan1/SPEC.md`
  (context on how the backend Run model + WebSocket channel work)

## Your task

**Task 1: Backend discovery endpoint + WebSocket channel verification.**

Implement exactly this task, nothing else. Details in `workdocs/PLAN.md`.

Scope summary:
1. Add `GET /api/v1/runs` — returns a JSON list of active (non-ended) runs.
   - Filter: runs where `outcome` is null or `phase != "D"` with no end event
     — match whatever the designer's SPEC specifies. If ambiguous, use
     `outcome is None` (still in progress) as the active filter.
   - Register the route in `backend/app/api/routes/__init__.py`.
2. Verify the WebSocket manager routes `_run:<run_id>` channel subscriptions
   correctly. If the channel prefix needs registration, add it. Test with a
   live WS handshake in an integration test.
3. Write tests first (TDD). Cover:
   - Empty list when no runs exist.
   - Active runs appear.
   - Ended runs (outcome set) do NOT appear.
   - WebSocket connection to `_run:ral-20260418-a7f3` succeeds (101 upgrade).
   - WebSocket rejects malformed run IDs.
4. `make checkall` from repo root must pass.

## Constraints

- Backend only. Do NOT touch frontend files.
- Keep the endpoint trivial (~20 lines). No pagination, no filtering params.
  Plan 2 frontend polls every 5s, so response shape must be stable.
- Reuse existing `_RUN_ID_RE` regex from `broadcast_service.py` — do not
  redefine it.
- Follow the existing FastAPI + Pydantic v2 patterns (camelCase aliases).
- No ruff errors. Pre-existing hooks `N817` can stay.

## Uncommitted frontend WIP

There are 9 modified frontend files on the branch (WIP from a prior stash
pop, unrelated to your task). **Do not stage or commit them.** Only stage
backend files and tests you create/modify.

## When done

Mark Task 1 ✅ in PLAN.md. Commit with a clear message:
`feat(runs): GET /api/v1/runs discovery endpoint (Plan 2 Task 1)`.
Push to `origin/feature/ralph-panoptica-spec-a-plan2`. Exit.
