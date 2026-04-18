# NEXT_PROMPT12 — fix-task-12: mtime+size quick-check for plan_watcher

Coder agent. Workspace: `/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a`.

## Claim

`workdocs/PLAN.md`: `[ ] fix-task-12` → `[🔧]`. Commit: `chore(plan): claim fix-task-12`.

## Read

- `backend/app/core/plan_watcher.py`
- `backend/app/core/beads_poller.py` (reference — may use a similar pattern)
- `backend/tests/test_plan_watcher.py`

## Problem

`plan_watcher` hashes the PLAN.md on every poll tick to detect changes. For
large-ish (but sub-1MiB) PLAN files, this is wasteful — most ticks see no
change. Use mtime+size as a cheap pre-check; fall back to hash only when
either has changed.

## Fix (TDD)

1. **Failing test.** Poll an unchanged file 3 times. Patch or spy on the
   hash function. Assert: `hash_fn` is called **at most once** (on the first
   tick, to establish baseline) across the 3 polls. Run → fails (hashed
   every tick today).
2. **Implement.** In `_PlanState`, store `last_mtime`, `last_size`, and
   `last_hash`. In `_poll_one`:
   - `st = path.stat()`
   - If `st.st_mtime == last_mtime and st.st_size == last_size`, skip reading / hashing — return no-change.
   - Else: read + hash, compare to `last_hash`, update all three.
3. **Preserve** the first-failure WARN/DEBUG cadence from fix-task-3 and the size cap from fix-task-11. Make sure they still run before the mtime fast-path (order: stat → size cap → mtime shortcut → hash).
4. **Green.** All tests — existing plan_watcher tests must still pass.
5. **Commit:** `fix(plan_watcher): mtime+size fast-path skips redundant hashing`.
6. Mark PLAN `[✅]`.

If stuck: `[⚠️ stuck]` + reason, exit.
