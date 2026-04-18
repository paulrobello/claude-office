# NEXT_PROMPT7 — fix-task-7: Unregister _WatchedPath on run_end

Coder agent. Workspace: `/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a`.

## Claim

`workdocs/PLAN.md`: `[ ] fix-task-7` → `[🔧]`. Commit: `chore(plan): claim fix-task-7`.

## Read

- `backend/app/core/event_processor.py` (`_handle_marker_event`)
- `backend/app/core/marker_watcher.py` (look for unregister/remove method; add one if absent)
- Tests for both

## Problem

`_WatchedPath` entries persist after `run_end`. Long-lived Panoptica backends
leak them indefinitely. Must unregister the marker path when a run ends.

## Fix (TDD)

1. **Failing test.** End-to-end through the event processor:
   - Emit `run_start` for run-A → watcher tracks the path
   - Emit `run_end` for run-A → assert path is **no longer tracked**
   Run → fails (currently path persists).
2. **Implement.** Add (or expose) an `unregister(path)` method on
   `MarkerWatcher` if one doesn't exist. In `_handle_marker_event`, after
   handling a `run_end` marker event, call `unregister` on the primary_repo's
   marker path. Do this **after** the aggregator upsert (fix-task-2) so the
   final state is still captured.
3. **Green.** All tests. Ensure fix-task-2 regression stays green.
4. **Commit:** `fix(watcher): unregister marker path on run_end`.
5. Mark PLAN `[✅]`.

If stuck: `[⚠️ stuck]` + reason, exit.
