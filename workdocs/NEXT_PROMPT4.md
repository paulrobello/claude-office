# NEXT_PROMPT4 — fix-task-4: Plan parser DEBUG on malformed lines

Coder agent. Workspace: `/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a`.

## Claim

`workdocs/PLAN.md`: `[ ] fix-task-4` → `[🔧]`. Commit: `chore(plan): claim fix-task-4`.

## Read

- `backend/app/core/plan_parser.py`
- `backend/tests/test_plan_parser.py`
- `workdocs/USER_PROMPT.md`

## Problem

`parse_plan_md` silently drops lines that don't match its regex. Operators
can't tell why tasks from a PLAN aren't showing up.

## Fix (TDD)

1. **Failing test.** Feed the parser a PLAN string with 3 malformed task-lines
   mixed in. Capture logs with `caplog`, assert 3 DEBUG records referencing
   the offending lines. Also assert normal parse results are unchanged.
2. **Implement.** In `parse_plan_md`, when a line looks like a task (starts
   with `- [`) but fails full regex, emit a DEBUG log containing the line
   content (truncated to 80 chars) and the reason. Rate-limit to a max of 20
   per call to avoid flooding on a broken file.
3. **Green.** All tests.
4. **Commit:** `fix(plan_parser): debug-log malformed task lines`.
5. Mark PLAN `[✅]`.

Only `plan_parser.py` + its test.

If stuck: `[⚠️ stuck]` + reason, exit.
