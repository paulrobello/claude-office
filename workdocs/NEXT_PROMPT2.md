# NEXT_PROMPT2 — fix-task-2: Aggregator receives all marker events

Coder agent. Workspace: `/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a`.

## Claim

`workdocs/PLAN.md`: `[ ] fix-task-2` → `[🔧] fix-task-2`. Commit: `chore(plan): claim fix-task-2`.

## Read

- `workdocs/USER_PROMPT.md`
- `backend/app/core/event_processor.py` (look for `_handle_marker_event`)
- `backend/app/core/run_aggregator.py` (the `upsert_from_marker` method)
- `backend/app/core/marker_watcher.py` (event shape)
- Existing aggregator / marker tests

## Problem

`_handle_marker_event` only calls `RunAggregator.upsert_from_marker` on
`run_start`. Marker events for `run_phase_change` and `run_end` are silently
dropped — the aggregator never sees phase transitions. Frontend Plan 2 depends
on aggregator state reflecting the current phase.

## Fix (TDD)

1. **Failing test.** In the appropriate test file (likely
   `backend/tests/test_event_processor_run_markers.py` or add if not present,
   matching project pattern), write a test that:
   - constructs a real `RunAggregator` (or uses the singleton / a fresh instance)
   - emits three marker events in sequence: run_start, run_phase_change,
     run_end — all with the same run_id
   - asserts `upsert_from_marker` was called 3 times (or equivalently, the
     run state shows the final phase and outcome after all three)
   Run it → must fail (currently only run_start triggers the call).
2. **Implement.** In `_handle_marker_event`, call `upsert_from_marker` on all
   three marker event types, not just `run_start`. Keep the path re-read from
   disk (existing pattern — TAKEAWAYS notes it).
3. **Green.** Regress all backend tests.
4. **Commit:** `fix(events): aggregator ingests phase_change + run_end markers`.
5. Mark PLAN `[🔧]` → `[✅]`, commit `chore(plan): mark fix-task-2 done`.

## Constraints

- Only backend changes.
- Do not touch earlier fix-tasks or any task ≥3.
- ruff + test must stay green.

If stuck: `[⚠️ stuck]` with reason and exit.
