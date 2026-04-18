# NEXT_PROMPT1 — fix-task-1: StateMachine Ralph attribution

You are a **Coder** agent in a Ralph refinement run. Workspace root:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a`. You are working on PR #4 fixes.

## Claim

Edit `workdocs/PLAN.md`: change `- [ ] fix-task-1:` to `- [🔧] fix-task-1:`, then `git add workdocs/PLAN.md && git commit -m "chore(plan): claim fix-task-1"`.

## Read first

- `workdocs/USER_PROMPT.md` — full chain context
- `workdocs/PLAN.md` — task list (you own fix-task-1)
- `backend/app/core/state_machine.py`
- `backend/app/core/handlers/session_handler.py` (lines 80-140)
- `backend/app/models/sessions.py`
- `backend/tests/test_session_handler_ralph.py`

## Problem

`session_handler._tag_and_register_run_member` does
`getattr(sm, "session", None)` but `StateMachine` has **no** `session`
attribute. In production, Ralph attribution (run_id / role / task_id) never
reaches the runtime `Session` the StateMachine renders. Existing tests only
pass because they inject a `SimpleNamespace` with a `session` attribute. This
breaks the frontend (Plan 2) contract.

## Fix (TDD)

1. **Failing test first.** In `backend/tests/test_session_handler_ralph.py`,
   add a test that uses a real `StateMachine` (not a SimpleNamespace mock),
   drives a `session_start` event whose `EventData` carries `ralph_role`,
   `ralph_task_id`, `run_id`, then asserts the Session the StateMachine exposes
   via its public API carries those fields. Run it → it must fail.
2. **Implement.** Add `run_id: str | None`, `role: Role | None`,
   `task_id: str | None` to the `Session` pydantic model (already there per
   prior plan-task-2 — verify). Change the StateMachine's session tracking so
   that tagging updates the Session it owns. Remove the `getattr(sm,
   "session", None)` fallback in `session_handler.py` and tag the real
   Session directly.
3. **Green test.** `cd backend && uv run pytest tests/test_session_handler_ralph.py -q` must pass.
4. **Regress.** `cd backend && uv run pytest tests/ -q` — all green.
5. **Commit.** `git add -u && git commit -m "fix(session): attribute Ralph run via real StateMachine session"`.
6. **Mark done.** Edit `workdocs/PLAN.md`: `[🔧]` → `[✅]` for fix-task-1, commit.

## Done signals

- PLAN.md has `[✅] fix-task-1`
- At least one commit beyond the claim

## If stuck

Edit PLAN.md entry to `[⚠️ stuck] fix-task-1: <one-line reason>` and exit.
Do not flail.

## Constraints

- Only edit backend code and backend tests.
- Do not touch frontend/, hooks/, or PLAN tasks ≥2.
- Preserve ruff + pyright posture (no new errors).

Exit when done.
