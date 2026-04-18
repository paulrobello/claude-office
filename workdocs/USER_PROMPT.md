# USER_PROMPT — Chained Ralph run (refinement)

## Context

This is a **refinement chain** run. The prior run (Spec A, Plan 1 — backend) built the
Ralph run-visualization backend and opened draft PR #4:
https://github.com/Tesseron-Chile/panoptica/pull/4 on branch
`feature/ralph-panoptica-spec-a`.

Three parallel AI reviews (code, silent-failure, security) on that PR surfaced
multiple issues. This chained run fixes **every Critical / High / Major** finding
and documents deferred Minors. It does **not** expand scope beyond the reviews.

Prior workdocs archived on `ralph/workdocs_archive` branch under
`archive/2026-04-18-spec-a-plan1/`.

## Scope (fix-it list — from the three reviews)

### Merge-blockers (Critical)

- **code-C1** — `backend/app/core/handlers/session_handler.py:88-92, 131-134` uses
  `getattr(sm, "session", None)` but `StateMachine` has no `session` attribute.
  Ralph attribution silently drops in production; tests only pass via
  SimpleNamespace mock. Either: (a) store the Ralph tag on the runtime `Session`
  model that the StateMachine wraps, or (b) persist `sm.ralph_tag` explicitly.
  Frontend Plan 2 depends on this field being on the Session the WebSocket
  emits. Add a test that exercises the **real** StateMachine, not a mock.

- **code-M2 / silent-failure-C1** — `event_processor._handle_marker_event` only
  calls `RunAggregator.upsert_from_marker` on `run_start`. Phase-change and
  run_end marker updates are silently dropped. Fix: call `upsert_from_marker`
  on every marker event, not just `run_start`. Add regression tests.

- **silent-failure-C2** — `plan_watcher` lacks the first-failure
  WARN-then-DEBUG pattern used by `beads_poller.py`. Noisy logs on transient
  failures. Port the pattern.

- **silent-failure-C3** — `plan_parser.parse_plan_md` drops malformed lines
  silently. Emit a DEBUG log (or structured warning at a sane rate) for lines
  that fail to parse so operators can diagnose spec drift.

- **security-H1** — Path traversal via `working_dir` passed from hooks.
  `marker_path_for_cwd` takes hook-supplied `working_dir` without
  canonicalization. Validate with `Path.resolve()` and reject paths that escape
  a configured root or are not absolute. Test with `..` payloads.

- **security-H2** — `MarkerWatcher` registration is unbounded — a misbehaving
  hook could register arbitrary paths. Cap the number of watched paths
  (constant, e.g. 256) and evict LRU on overflow. Log the eviction at WARN.

### Major (non-blocking but ship together)

- **code-M3** — `_WatchedPath` entries are never unregistered after `run_end`.
  Memory leak in long-lived backend. Remove the path on `run_end` and on
  aggregator eviction.

- **code-M4** — `read_marker` is synchronous and called inside async handler
  path. Wrap with `asyncio.to_thread` / `run_in_executor`.

- **silent-failure major findings (5)** — see PR #4 review thread. All variants
  of "except: pass" or returning None on error without a log. Add a DEBUG log
  per swallow site with enough context to trace.

- **security medium findings (3)** —
  - run_id used as WebSocket channel name allows channel smuggling: validate
    run_id matches `^ral-[0-9]{8}-[0-9a-f]{4}$` before using as a channel.
  - PLAN.md read without a size cap: reject files > 1 MiB with a WARN log.
  - Full-file hash per poll tick is expensive: switch to mtime+size quick
    check, fall back to hash only on change.

### Deferred (Minor — document but don't fix in this run)

- `model_config_` alias round-trip edge case when input uses the Python name.
- Import-at-bottom with `noqa` in `event_processor.py`.
- Remaining silent-failure minors / security lows — list them in TAKEAWAYS
  with filed issue numbers.

## Constraints

- **Branch:** `feature/ralph-panoptica-spec-a` (same branch — PR #4 is the target).
- **Do not modify frontend code.** Frontend changes are for Plan 2.
- **Do not bump the pyright baseline.** Backend `make lint` and `make test`
  must remain green.
- **Every fix gets a regression test** before the implementation lands.
- **File an issue** (one GitHub issue per deferred Minor, `ralph-wip` label).

## Success criteria

- All Critical / High / Major items above have commits on the feature branch
  with regression tests.
- `cd backend && uv run pytest tests/ -q` passes.
- `make lint` (backend + hooks) passes.
- Hooks tests green (`cd hooks && uv run pytest`).
- PR #4 updated with a "Review fixes (chain 2)" description section listing
  each fix with commit SHA.
- TAKEAWAYS.md documents deferred minors with issue numbers.

## Interview

Skip human interview. Orchestrator is warmed up from prior run; acts as
interviewee for the designer. User has already specified: "fix everything in a
chained ralph" — interpret as "all Critical + High + Major; defer Minor with
issues".
