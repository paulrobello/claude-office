# NEXT_PROMPT3 — fix-task-3: Plan watcher first-failure WARN→DEBUG

Coder agent. Workspace: `/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a`.

## Claim

`workdocs/PLAN.md`: `[ ] fix-task-3` → `[🔧] fix-task-3`. Commit: `chore(plan): claim fix-task-3`.

## Read

- `workdocs/USER_PROMPT.md`
- `backend/app/core/plan_watcher.py`
- `backend/app/core/beads_poller.py` — this is the **reference pattern** for first-failure WARN then DEBUG
- Existing plan_watcher tests

## Problem

`plan_watcher` logs every failure at the same level, producing noisy logs when
a PLAN.md path is briefly unavailable. The `beads_poller` module implements a
clean pattern: first transient failure at WARN, subsequent identical failures
at DEBUG, recovery back to INFO. Port that pattern.

## Fix (TDD)

1. **Failing test.** Point `plan_watcher` at a missing path. Poll 3 times.
   Assert: first log record at WARNING, second+third at DEBUG, then "heal" the
   path and poll again → an INFO "recovered" log. Use `caplog` or equivalent.
2. **Implement.** Mirror `beads_poller.py`'s state-tracking pattern — an
   internal `_warned_once` flag (per path if multiple) that flips on first
   failure and resets on success. Keep behavior identical on the happy path.
3. **Green.** All backend tests.
4. **Commit:** `fix(plan_watcher): first-failure WARN then DEBUG cadence`.
5. Mark PLAN `[🔧]` → `[✅]`.

## Constraints

- Only `plan_watcher.py` + its test.
- Do not touch other fix-tasks.

If stuck: `[⚠️ stuck]` + reason, exit.
