# NEXT_PROMPT6 — fix-task-6: Bound MarkerWatcher registrations

Coder agent. Workspace: `/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a`.

## Claim

`workdocs/PLAN.md`: `[ ] fix-task-6` → `[🔧]`. Commit: `chore(plan): claim fix-task-6`.

## Read

- `backend/app/core/marker_watcher.py`
- `backend/tests/test_marker_watcher.py`

## Problem

`MarkerWatcher` accepts unbounded registrations — a misbehaving hook (or
attacker via fix-task-5 bypass path) could register arbitrary paths and
exhaust memory. Cap at 256 watched paths; LRU-evict oldest on overflow with
a WARN log.

## Fix (TDD)

1. **Failing test.** Register 257 paths (use `tmp_path` to make them real).
   Assert: the oldest (first registered) path is no longer tracked, the 256
   most-recent remain, and exactly one WARNING log was emitted citing
   eviction. Run → must fail.
2. **Implement.** Use `collections.OrderedDict` for watched-paths storage,
   or track insertion order. Define `MAX_WATCHED_PATHS = 256` as a module
   constant. On overflow, `popitem(last=False)` to evict LRU and log a WARN.
   Re-registering an existing path should move-to-end (refresh), not evict.
3. **Green.** All tests.
4. **Commit:** `fix(marker_watcher): cap registrations at 256 LRU`.
5. Mark PLAN `[✅]`.

Only `marker_watcher.py` + its test.

If stuck: `[⚠️ stuck]` + reason, exit.
