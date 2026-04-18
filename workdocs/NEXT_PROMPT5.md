# NEXT_PROMPT5 — fix-task-5: Path-traversal guard on working_dir

Coder agent. Workspace: `/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a`.

## Claim

`workdocs/PLAN.md`: `[ ] fix-task-5` → `[🔧]`. Commit: `chore(plan): claim fix-task-5`.

## Read

- `backend/app/core/marker_file.py` (`marker_path_for_cwd`)
- `backend/app/core/session_tagger.py` (caller)
- `backend/app/core/event_processor.py` (caller, `_handle_marker_event`)
- `workdocs/USER_PROMPT.md`

## Problem

`working_dir` is supplied by hooks (untrusted external input) and used to
construct a marker path. No validation — a crafted working_dir with `..`
components can escape the intended directory and read arbitrary files.

## Fix (TDD)

1. **Failing test.** In `backend/tests/test_marker_file.py` (or the right
   test file — match project pattern), add `test_marker_path_rejects_traversal`.
   Pass `/tmp/foo/../../etc/passwd` and similar payloads — assert the function
   raises (e.g., `ValueError`) or returns `None` per project convention (pick
   one and be consistent). Also test that a legitimate cwd under `$HOME`
   succeeds. Run → must fail.
2. **Implement.** Add a validator in `marker_file.py` (small private helper
   `_validate_cwd`):
   - Must be absolute.
   - After `Path(working_dir).resolve(strict=False)`, the result must not
     contain `..` components (it can't after resolve — but double-check).
   - Must be inside an allowlist root. Default root is `$HOME` (read from env
     `HOME`; fallback `Path.home()`). Allow configurable via an optional
     `allowed_roots: list[Path] | None` parameter, defaulting to `[Path.home()]`.
   - On violation: raise `ValueError` with a clear message.
   - Callers (`session_tagger`, `_handle_marker_event`) must catch and log
     at WARN, not propagate to crash the handler.
3. **Green.** All tests.
4. **Commit:** `fix(marker): validate working_dir against $HOME; reject traversal`.
5. Mark PLAN `[✅]`.

Only backend. Do not touch tasks ≥6.

If stuck: `[⚠️ stuck]` + reason, exit.
