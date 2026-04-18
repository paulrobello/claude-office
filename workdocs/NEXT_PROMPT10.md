# NEXT_PROMPT10 — fix-task-10: run_id channel-name validation

Coder agent. Workspace: `/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a`.

## Claim

`workdocs/PLAN.md`: `[ ] fix-task-10` → `[🔧]`. Commit: `chore(plan): claim fix-task-10`.

## Read

- `backend/app/core/broadcast_service.py` (`broadcast_run_state`)
- `backend/app/api/websocket.py` (or wherever the manager is)

## Problem

`broadcast_run_state` builds a WebSocket channel name via
`f"_run:{run_id}"`. If `run_id` is attacker-controlled (e.g. injected by a
hook, or crafted via fix-task-5 bypass), it can smuggle into other channels
or inject control characters.

## Fix (TDD)

1. **Failing test.** Call `broadcast_run_state` with a malicious run_id like
   `"..:admin"`, `"ral-X:spoof"`, or `""`. Assert: WARN logged, broadcast
   does **not** go out on any channel. Also test a valid run_id
   `"ral-20260418-a7f3"` still works.
2. **Implement.** Add a module-level regex `_RUN_ID_RE = re.compile(r"^ral-[0-9]{8}-[0-9a-f]{4}$")`.
   At the top of `broadcast_run_state`, if `_RUN_ID_RE.match(run_id)` is None,
   `logger.warning(...)` and `return` without broadcasting. Preserve the
   existing signature.
3. **Green.** All tests.
4. **Commit:** `fix(broadcast): validate run_id channel name`.
5. Mark PLAN `[✅]`.

If stuck: `[⚠️ stuck]` + reason, exit.
