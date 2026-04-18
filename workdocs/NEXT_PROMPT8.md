# NEXT_PROMPT8 — fix-task-8: Async-safe marker reads

Coder agent. Workspace: `/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a`.

## Claim

`workdocs/PLAN.md`: `[ ] fix-task-8` → `[🔧]`. Commit: `chore(plan): claim fix-task-8`.

## Read

- `backend/app/core/event_processor.py` (`_handle_marker_event`)
- `backend/app/core/marker_file.py` (`read_marker`)
- Existing async tests

## Problem

`read_marker` is synchronous file I/O; it's called from within an async
handler. Under concurrent marker events this blocks the event loop.

## Fix (TDD)

1. **Failing test (mild).** Write a test that calls `_handle_marker_event`
   concurrently (via `asyncio.gather`) with 10 markers and asserts all
   complete under a generous wall-clock deadline (e.g. `< 2s`). This will
   pass today but tightens the contract. More importantly, add a test that
   **mocks** `read_marker` with a `time.sleep(0.2)` blocker and asserts the
   handler yields control to the loop during the read (e.g. another coroutine
   can make progress concurrently). That test should fail today.
2. **Implement.** Wrap the synchronous `read_marker` call in `_handle_marker_event`
   with `await asyncio.to_thread(read_marker, path)`. Do not change `read_marker`
   itself — the sync fn is still useful elsewhere.
3. **Green.** All tests.
4. **Commit:** `fix(events): read_marker off the event loop`.
5. Mark PLAN `[✅]`.

If stuck: `[⚠️ stuck]` + reason, exit.
