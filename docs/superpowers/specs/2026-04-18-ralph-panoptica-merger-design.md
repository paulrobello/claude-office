# Ralph × Panoptica — Spec A: Run Visualizer

Design spec — 2026-04-18 — Matías Cadile

## Overview

Panoptica reorients around Ralph runs. A central Panoptica server visualizes multiple concurrent Ralph runs alongside ad-hoc Claude Code sessions, rendered as a pixel-art coworking space: one private office per Ralph run, an open hot-desk floor for unrelated sessions, and role-specific nooks inside each run office (Orchestrator, Designer, Coder, Verifier, Reviewer).

Panoptica's existing single-session office is demoted to a degenerate case (a single hot-desk booth) and its rendering code is reused at the per-nook drill-down zoom level.

Ralph and Panoptica stay **decoupled**. Ralph sets environment variables on every `claude -p` spawn and maintains a small marker file per cwd. Panoptica reads those. There is no HTTP between them.

This is **Spec A** of three:

- **Spec A (this doc):** Ralph run visualizer. Live-only. Cost/token telemetry schema reserved but not rendered.
- **Spec B (future):** Token / account-efficiency dashboards. Uses the telemetry seam introduced here.
- **Spec C (future):** Ralph wizard — Linear integration that proposes Ralph runs for overdue work. Depends on A and B.

## Goals

1. Multiple concurrent Ralph runs, each surfaced as a private office on a shared campus view, with zero-configuration attribution of spawned sessions to the correct run.
2. Unrelated Claude Code sessions (user working in other terminals, IDE sessions, etc.) do not pollute any run's office — they live in a separate hot-desk area.
3. Glanceable status while a run is in flight (use case: second-monitor awareness during a long unsupervised run).
4. Demo-legible animations on the three highest-signal transitions (run starts, phase changes, plan-task state changes).
5. Telemetry schema that will accept per-run / per-session token and cost data without a breaking change when Spec B lands.

## Non-goals (MVP)

These are explicitly out of scope for this spec. Each is called out so it is clear they are deferred, not forgotten.

- **Replay UI.** Events are persisted (as they are today) but no timeline or scrubbing controls are built.
- **Token / cost rendering.** Schema reserves fields; renderer ignores them. Spec B owns this.
- **Multi-repo office visualization.** A Ralph run targeting multiple repos still renders as one office anchored to the `primary_repo`. An indicator is added to the Coder nook when the Coder's cwd differs, but no second-wing / second-office design is built.
- **Orchestrator choreography.** The orchestrator does not physically walk between nooks to spawn characters. Spawned characters appear at their nook.
- **Work-handoff animations** between roles (Designer→Coder, Coder→Reviewer).
- **Ad-hoc session art richness.** Hot-desk booths use minimal sprite states, deliberately quiet, to not compete with Ralph runs.
- **Chained Ralph runs.** One live run per cwd is supported. Chained-ralph handoffs will be addressed in a later spec.
- **Backend session-centric model cleanup.** The legacy `Session`-as-top-level shape persists; a follow-up refactor is scheduled for after MVP.

## Architecture

Three components. No new services.

```
┌─────────────── user's machine ─────────────────────┐
│  Claude Code sessions:                             │
│   • Ralph orchestrator (interactive)               │
│   • Ralph-spawned children (claude -p)             │
│   • Ad-hoc sessions (unrelated terminals / IDE)    │
│  Each has Panoptica's hooks installed.             │
└────────────────────┬───────────────────────────────┘
                     │ HTTP POST /api/v1/events
                     ▼
         ┌─────────────────────────┐
         │ Panoptica backend       │
         │  • existing FastAPI /   │
         │    state machine / WS   │
         │  • NEW: Run aggregator  │
         │  • NEW: session_start   │
         │    env + marker tagging │
         │  • NEW: marker file     │
         │    watcher (per cwd)    │
         │  • NEW: PLAN.md watcher │
         └────────────┬────────────┘
                      │ WebSocket: state_update
                      ▼
         ┌─────────────────────────┐
         │ Panoptica frontend      │
         │  • NEW: CampusView      │
         │  • existing OfficeScene │
         │    reused at nook zoom  │
         └─────────────────────────┘
```

**Key constraints:**

- Ralph does not know Panoptica exists. Its only contributions are env vars on spawn and a marker file. Ralph remains publishable as a standalone plugin.
- Panoptica is the single party that reasons about runs. Session classification is done by Panoptica's `session_start` handler.
- The existing Panoptica backend state machine and hook event path are untouched. Run aggregation is additive.

## Instrumentation contract (Ralph ↔ Panoptica)

The entire interface between Ralph and Panoptica.

### Environment variables (set by Ralph on every `claude -p` spawn)

| Var | Values | Purpose |
|---|---|---|
| `RALPH_RUN_ID` | `ral-YYYYMMDD-<short-hash>` | Unique per Ralph run. Orchestrator generates at A1. |
| `RALPH_ROLE` | `designer` \| `coder` \| `coder-continuation` \| `verifier` \| `reviewer` | Spawned agent's role. |
| `RALPH_PHASE` | `A` \| `B` \| `C` \| `D` | Phase this spawn belongs to. |
| `RALPH_TASK_ID` | `plan-task-<n>` or empty | For Phase B coders only — which PLAN.md task the spawn is picking up. |
| `RALPH_PRIMARY_REPO` | absolute path | The primary target repo (Ralph supports multi-repo; this is `target_repos[0]`). |

The orchestrator session itself has **no env vars** — it is the user's interactive `claude` session. It is tagged via the marker file.

### Marker file (`workdocs/.panoptica-run.json`)

Written by Ralph at run start (A1–A2 window). Updated on phase transitions and at run end. Never contains secrets.

```json
{
  "run_id": "ral-20260418-a7f3",
  "orchestrator_session_id": "01ARZ3NDEK...",
  "primary_repo": "/Users/m/dev/athlete-optics",
  "workdocs_dir": "/Users/m/dev/athlete-optics/workdocs",
  "started_at": "2026-04-18T14:32:07Z",
  "ended_at": null,
  "phase": "A",
  "model_config": {
    "designer": "claude-opus-4-7",
    "coder":    "claude-sonnet-4-6",
    "verifier": "claude-opus-4-7",
    "reviewer": "claude-opus-4-7"
  }
}
```

Panoptica treats `model_config` as opaque version strings. Ralph can bump model IDs independently without Panoptica changes.

### New events (synthesized by Panoptica, not emitted by Ralph)

| Event | Trigger | Payload |
|---|---|---|
| `run_start` | First marker-file read or first tagged session joined | `run_id`, `orchestrator_session_id`, `primary_repo`, `model_config` |
| `run_phase_change` | `phase` field in marker file changes | `run_id`, `from_phase`, `to_phase` |
| `run_end` | Marker `ended_at` is set, **or** orchestrator session emits `stop` — whichever fires first (second trigger is a no-op) | `run_id`, `outcome` (`completed` / `stuck` / `abandoned`) |
| `role_session_joined` | `session_start` arrives with `RALPH_ROLE` env | `run_id`, `role`, `session_id`, `task_id`, `phase` |

Ralph does not emit any of these. All four are derived by Panoptica from observing hook events and marker-file state.

### Ralph-side changes (scope)

Two narrow diffs in `tesseron-plugin-marketplace/plugins/ralph`:

1. `skills/ralph-workflow/SKILL.md` — instruct the orchestrator to set env vars on `claude -p` spawns and maintain the marker file at A1/phase boundaries/run end.
2. `skills/ralph-workflow/references/claude-instructions.md` — add env-var flags to the agent-spawn command example.

No code changes in the Ralph plugin itself; this is all instruction-level.

## Domain model

### New types

```python
# backend/app/models/runs.py (NEW)
class Run:
    run_id: str
    orchestrator_session_id: str | None
    primary_repo: str
    workdocs_dir: str
    phase: Literal["A", "B", "C", "D", "done"]
    started_at: datetime
    ended_at: datetime | None
    outcome: Literal["in_progress", "completed", "stuck", "abandoned"]
    model_config: dict[str, str]

    member_session_ids: set[str]
    plan_tasks: list[PlanTask]
    stats: RunStats                        # from STATS.md: elapsed, phase_timings

    # Reserved for Spec B — populated as None in MVP, shape defined by Spec B:
    token_usage: dict | None       # keys/values owned by Spec B
    cost_usd: float | None

class PlanTask:
    id: str
    title: str
    status: Literal["todo", "in_progress", "done"]
    assigned_session_id: str | None

class RunStats:
    elapsed_seconds: int
    phase_timings: dict[str, int]          # phase → seconds spent
```

### Extensions to existing types

```python
# backend/app/models/sessions.py (EXTENDED)
class Session:
    # …existing fields untouched…
    run_id: str | None                     # NEW, nullable (ad-hoc = None)
    role: Role | None                      # NEW
    task_id: str | None                    # NEW
```

### Session classification (session_start handler)

```
read env: RALPH_RUN_ID, RALPH_ROLE, RALPH_TASK_ID   ──┐
read marker file at cwd                                ├──► (run_id?, role?)
                                                       │
  both env + marker agree     → tag session, add to Run
  env only (no marker)        → tag session, log warning (orchestrator hasn't written marker yet?)
  marker only (no env)        → treat as orchestrator session (this is how the orchestrator is tagged)
  neither                     → leave fields None → session is ad-hoc hot-desk
```

### Marker-file watcher

A single backend watcher watches all known `workdocs/.panoptica-run.json` paths for changes. Modeled on the existing `backend/app/core/beads_poller.py` / `task_file_poller.py` pattern. Poll interval: 1s (tight; these files are local and small). Emits `run_start`, `run_phase_change`, `run_end` synthetic events on relevant changes.

### PLAN.md watcher

Same pattern. Watches `{workdocs_dir}/PLAN.md` for each active run. Reparses on change. Updates `Run.plan_tasks`. Reuse the existing task-persistence abstractions where possible.

## Event mapping (hook event → scene behavior)

| Hook event | Untagged session | Tagged as Ralph role |
|---|---|---|
| `session_start` | Boss spawns at a hot-desk booth | Character spawns at its role nook inside the Run's office |
| `pre_tool_use` / `post_tool_use` | Animates the hot-desk booth figure | Animates inside the role nook (and inside the drilled-in OfficeScene when zoomed) |
| `subagent_start` / `subagent_stop` | Task-spawned sub-agent in booth | Task-spawned sub-agent inside the role nook — these are nested subagents inside a role session, not new roles |
| `context_compaction` | Booth figure stomps | Happens inside the role nook |
| `stop` | Booth clears | Role character leaves nook; nook dims. If the session is the orchestrator → emits `run_end`. |

| Synthetic event | Scene effect |
|---|---|
| `run_start` | New office appears on the campus; door closed; wall tinted for phase A. |
| `run_phase_change` | Door opens briefly, wall tint cross-fades (~600ms), phase banner flips. |
| `role_session_joined` | Character walks from office edge to its nook (~500ms). |
| `run_end` | Office dims; nameplate shows ✓ / ✗ / ⏸. Persists on campus until user clears. |

## Scene composition

Three zoom levels.

### Level 1 — Campus view (default)

- Perimeter of private offices (one per active Run), newest-first.
- Open hot-desk floor in the center (ad-hoc sessions).
- Sidebar: summary of active runs (count, phases, task progress).
- Telemetry placeholder region reserved for Spec B.

Ordering rules: active runs before ended runs; within actives, sorted by `started_at` descending. Ended runs dim and persist until the user clicks "clear ended runs".

Visible office cap: ~8. Overflow paginates. Beyond 8 is a Spec B concern.

### Level 2 — One Ralph run's office (zoom into an office)

Interior layout:

- Center: Orchestrator control station (always occupied while the run is live).
- Four role nooks surround it: Designer (studio), Coder (workbench + PLAN.md whiteboard), Verifier (QA station), Reviewer (podium with PR monitor).
- Inactive nooks are dim. Active nook has its role character visible.
- Phase banner overhead. Wall tint reflects current phase.
- Coder whiteboard displays PLAN.md tasks as stickies in three columns (⬜ todo / 🔧 in progress / ✅ done).

### Level 3 — Nook drill-down (zoom into an active nook)

Existing Panoptica `OfficeScene` rendered, scoped to that one session's events. Full fidelity — subagents, tools, bubbles, whiteboard, elevator, compaction animation, etc. This is where the existing renderer earns its keep.

A thin sidebar displays session metadata: role, model, session id, task id, elapsed, tool-call count.

## Animation budget

### In MVP

1. **Office appears** on campus when `run_start` fires. ~300ms door-and-wall sweep.
2. **Phase-tint transition** on `run_phase_change`. ~600ms wall cross-fade; door opens briefly; banner flips.
3. **Character arrives at nook** on `role_session_joined`. ~500ms walk from office edge to nook.
4. **Character leaves nook** on role session `stop`. Walks to edge, fades; nook dims.
5. **Sticky-note transition** on PLAN.md task status change. ⬜→🔧 slides across the column divider; 🔧→✅ gets a check and slides again. This is the primary progress-density animation.
6. **Office dims at run end.** Nameplate updates to outcome glyph.

### Deferred (explicit out-of-MVP list)

- Orchestrator physically walking between nooks to "spawn" each role.
- Animated work-handoffs between roles.
- Typing animations / speech bubbles / idle fidgets for role characters at the office view (these still work inside the nook drill-down via the existing OfficeScene).
- Ambient life on the hot-desk floor.

### Design rationale

The six MVP animations cover ~80% of the "animations look good" goal because they are the highest-signal transitions: a run starting, a phase changing, a task progressing. Additional choreography is real animation work (pathfinding, sequencing) and should follow a polish pass once the scaffold is proven.

Hot-desk floor is intentionally quiet so the user's eye is pulled to Ralph offices, not to their own side terminals.

## Testing

- **Backend unit tests.** Session classification across the four env-marker permutations. Run aggregation (session join/leave). Synthetic event generation from marker-file changes. PLAN.md parser (lax — skip unrecognized lines, never crash).
- **Backend integration test.** Fixture that replays a canned sequence of `session_start` / `pre_tool_use` / `stop` events at staged timestamps with matching env vars, asserting `Run.phase`, `member_session_ids`, and `plan_tasks` at each checkpoint.
- **Frontend component tests.** `CampusView` renders N offices correctly given fixture Runs. Per-office layout correct given a Run + its sessions. Nook zoom reuses `OfficeScene` correctly. Visual-regression snapshots for the three zoom levels.
- **End-to-end smoke test.** One script actually runs `claude -p "print hi"` with `RALPH_RUN_ID` + `RALPH_ROLE` env vars and a stub marker file, verifies Panoptica picks it up and an office appears on the campus. This test is the single gate on the correlation contract.
- **Not tested in MVP.** Real Ralph orchestrator end-to-end runs (too expensive to CI). Manually validated on a short Ralph run before shipping.

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `RALPH_*` env var typo in Ralph skill → every session classified as ad-hoc | M | End-to-end smoke test; marker-file fallback tags orchestrator even if env is missing everywhere. |
| Orchestrator session never gets tagged (user started `/ralph` before Panoptica hooks loaded) | L | Marker watcher polls filesystem on an interval — late-tagging is first-class. |
| Multi-repo Ralph run confuses the office | M | MVP anchors the office to `primary_repo`. A "working in: <repo>" indicator appears near the Coder nook when its cwd differs. Multi-repo office layout is follow-up. |
| PLAN.md parser drifts from Ralph's actual format | M | Parser is lax, logs warnings on unrecognized lines, never crashes. |
| Many parallel runs overload campus view | L (MVP) | Cap at ~8 offices visible; overflow paginates. |
| Legacy Session-centric backend model becomes hard to extend later | M | Called out as a deliberate tradeoff; post-MVP refactor is on the follow-ups list. |
| Chained Ralph runs (one cwd, multiple run_ids over time) | L | One live run per cwd is supported. Chained handoffs update the marker to the new `run_id`. Richer chained-run semantics deferred. |

## Follow-ups (explicitly out of MVP)

- Replay UI (timeline + scrubbing for completed runs).
- Token / cost rendering — the `token_usage` and `cost_usd` fields are reserved on `Run`. Spec B owns the actual UI.
- Multi-repo visualization.
- Orchestrator-walk choreography and work-handoff animations.
- Richer hot-desk floor art.
- Session-centric backend model cleanup.
- Chained-Ralph handoff semantics.
- Ralph wizard / Linear integration (Spec C).

## Success criteria (definition of done)

1. Running `/ralph` from any Tesseron repo with Panoptica on produces exactly one office on the campus within 2s of Phase A starting.
2. Designer / Coder / Verifier / Reviewer spawned sessions appear at their respective nooks with no wrong-office mis-attribution across ≥3 parallel runs.
3. Phase transitions render the tint change and update the banner.
4. PLAN.md stickies track status correctly through a full Phase B loop.
5. A `claude` session started in an unrelated terminal renders as a hot-desk booth, not an office.
6. Run ends cleanly (office dims, remains on-screen for review) when `stop` fires on the orchestrator session.
7. The existing single-session Panoptica experience still works as hot-desk booths. No regression.

## Out-of-scope but design-adjacent: how Spec A supports Spec B and Spec C

- **Spec B (token / efficiency).** The `Run.token_usage` and `Run.cost_usd` fields and a `Session.model` field are the seam. Spec B populates them from ccusage integration or JSONL parsing; Spec B owns the dashboards. No Spec A change should shape-break these fields.
- **Spec C (Ralph wizard).** The marker file — readable by any process in the repo — is the natural way for a wizard (or Linear sync) to discover that a cwd has an active run. No Spec A change should remove or relocate the marker file without coordinating with Spec C's eventual design.
