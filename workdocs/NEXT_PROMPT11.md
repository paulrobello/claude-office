# NEXT_PROMPT11 — fix-task-11: PLAN.md size cap

Coder agent. Workspace: `/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a`.

## Claim

`workdocs/PLAN.md`: `[ ] fix-task-11` → `[🔧]`. Commit: `chore(plan): claim fix-task-11`.

## Read

- `backend/app/core/plan_parser.py` (`parse_plan_md`)
- `backend/app/core/plan_watcher.py`

## Problem

`parse_plan_md` reads the entire file into memory. A hook or attacker could
point us at a huge file, causing memory/CPU pressure.

## Fix (TDD)

1. **Failing test.** Generate a 2 MiB file of plausible-looking task lines,
   call the parser (or watcher, whichever reads), assert: returns an empty
   task list and emits a WARN log mentioning the size cap. Run → must fail.
2. **Implement.** Module constant `MAX_PLAN_BYTES = 1 * 1024 * 1024` (1 MiB).
   Use `path.stat().st_size` before reading; if over cap, log WARN and return
   empty list. Place the check in the most natural layer (whichever reads
   bytes — likely `plan_parser.parse_plan_md` if it takes a path, else
   `plan_watcher._poll_one`).
3. **Green.** All tests.
4. **Commit:** `fix(plan): reject PLAN.md over 1 MiB`.
5. Mark PLAN `[✅]`.

If stuck: `[⚠️ stuck]` + reason, exit.
