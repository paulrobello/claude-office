# NEXT_PROMPT9 — fix-task-9: Log-on-swallow for silent-failure majors

Coder agent. Workspace: `/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a`.

## Claim

`workdocs/PLAN.md`: `[ ] fix-task-9` → `[🔧]`. Commit: `chore(plan): claim fix-task-9`.

## Context

The silent-failure review of PR #4 found 5 **Major** swallow sites in the
Ralph run-attribution code (beyond the Criticals already fixed in
fix-tasks 1-3). Each is an `except: pass` (or a bare `return None` on error)
in files added during Run 1. Your job: find them and add a DEBUG log.

## Scope to audit

Grep the Ralph-era modules for silent exception handling and `return None`
on error paths. Candidate files (walk all, add a log where missing):

- `backend/app/core/marker_file.py`
- `backend/app/core/plan_parser.py`
- `backend/app/core/plan_watcher.py`
- `backend/app/core/marker_watcher.py`
- `backend/app/core/run_aggregator.py`
- `backend/app/core/session_tagger.py`
- `backend/app/core/event_processor.py` (new Ralph-related code only)
- `backend/app/core/broadcast_service.py` (new broadcast_run_state only)
- `backend/app/core/handlers/session_handler.py` (new Ralph attribution code)

Ignore: pre-existing swallow sites unrelated to Ralph (e.g. simulation code).

## Fix (TDD)

1. **Find the sites.** Run `rg "except.*:$\n\s*pass" -U` and `rg "return None$"`
   on the Ralph modules. Expect ~5 candidates.
2. **For each site**, write a test that monkey-patches the upstream call to
   raise, then asserts a DEBUG log record is emitted with enough context
   (module name, operation, exception type). Run → must fail.
3. **Implement.** Add `logger.debug("…: %s", exc, exc_info=True)` (or the
   project's logging convention — check other files) before the `pass` /
   early return. Never re-raise; preserve the swallow semantics.
4. **Green.** All tests.
5. **Commit:** `fix(ralph): debug-log silent exception swallows`.
6. Mark PLAN `[✅]`.

## Notes

- If a swallow is genuinely fine (e.g. optional fields), DEBUG still helps diagnose.
- If you find < 5 sites, that's fine — don't invent ones. Document in the commit message how many you fixed.
- If you find > 5, fix them all — the review may have undercounted.

If stuck: `[⚠️ stuck]` + reason, exit.
