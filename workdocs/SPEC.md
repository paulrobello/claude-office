# Spec A — Plan 2: Frontend (Campus View + Run Offices)

## Overview

Build the Panoptica frontend that consumes the Ralph run backend contracts
(merged in Plan 1, PR #4). Introduces a campus view where each live Ralph
run renders as a private pixel-art office, ad-hoc Claude Code sessions live
on a shared hot-desk floor, and clicking a role nook inside a run office
drills down to the existing single-session OfficeGame renderer.

## Goals

1. **Campus view** — glanceable overview of all live Ralph runs + hot-desk area.
2. **Per-run office** — orchestrator control station + 4 role nooks; occupancy
   matches `Run.member_session_ids` filtered by role.
3. **Nook drill-down** — click a nook → existing OfficeGame scoped to that
   session's events (reuse, not rebuild).
4. **Three animation classes** — office appears (run_start), phase tint
   transition (run_phase_change), sticky-note slides (plan-task status change).
5. **Hot-desk area** — sessions with `run_id == null` render here, never inside
   a run office.

## Non-goals (explicit)

- Token/cost dashboards (Spec B).
- Ralph wizard / Linear integration (Spec C).
- Historical run replay (live-only for MVP).
- Orchestrator walk choreography between nooks.
- Work-handoff animations between roles.
- Multi-repo office visualization.
- Ambient life / idle animations on the hot-desk floor.

## Architecture

### Navigation model

Replace the current 2-tier model (BuildingView → FloorView) with a
3-tier campus model. The user's memory notes confirm BuildingView is
"confusing and needs a rethink" and rooms should be flattened.

```
CampusView (Level 1)          — all runs as offices + hot-desk
  └─ RunOfficeView (Level 2)  — interior of one run (orchestrator + nooks)
       └─ NookDrillDown (Level 3) — existing OfficeGame for one session
```

Hot-desk area is integrated into CampusView (not a separate scene).
Clicking a hot-desk booth also drills down to OfficeGame (same as today).

The existing `navigationStore` gains new view modes:
`"campus" | "run-office" | "nook"` alongside the legacy `"building" | "floor"`.
Legacy modes are preserved for backwards compatibility but CampusView
becomes the default entry point.

### State management

**New Zustand store: `useRunStore`** — single source of truth for run state.

```typescript
interface RunState {
  runs: Map<string, Run>;           // run_id → Run
  activeRunId: string | null;       // currently viewed run
  setRun: (run: Run) => void;
  removeRun: (runId: string) => void;
  setActiveRun: (runId: string | null) => void;
}

interface Run {
  runId: string;
  orchestratorSessionId: string | null;
  primaryRepo: string;
  phase: "A" | "B" | "C" | "D" | "done";
  startedAt: string;
  endedAt: string | null;
  outcome: "in_progress" | "completed" | "stuck" | "abandoned";
  memberSessionIds: string[];
  planTasks: PlanTask[];
  stats: { elapsedSeconds: number; phaseTimings: Record<string, number> };
}

interface PlanTask {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  assignedSessionId: string | null;
}
```

Existing stores remain untouched:
- `gameStore` — per-session office state (agents, boss, bubbles, etc.)
- `preferencesStore` — user preferences (clock, auto-follow)
- `navigationStore` — view routing (extended with new modes)

### WebSocket strategy

Two parallel subscription patterns:

1. **Run channel**: `ws://localhost:3400/ws/_run:<run_id>` — receives
   `run_state` messages with the full `Run` object. Frontend subscribes when
   a run is discovered (from REST list or from a `run_start` event on the
   global feed). Uses `broadcast_run_state()` already implemented in
   `backend/app/core/broadcast_service.py`.

2. **Session channel**: existing `ws://localhost:3400/ws/<session_id>` — used
   for nook drill-down (OfficeGame reuse). No changes needed.

**New hook: `useRunWebSocket(runId)`** — manages connection lifecycle for a
single run channel. Dispatches `setRun()` on `useRunStore` on each message.

**New hook: `useRunList()`** — fetches active runs from REST
(`GET /api/v1/runs`) on mount + poll interval (5s). Populates `useRunStore`.
Subscribes to individual run channels for live updates.

### Session classification (frontend side)

Sessions returned by `GET /api/v1/sessions` already carry `run_id`, `role`,
and `task_id` from Plan 1's backend. The frontend classifies:

- `session.run_id != null` → belongs to a run office (grouped by run_id)
- `session.run_id == null` → hot-desk session

No frontend logic for session classification beyond this null check.

### Component tree

```
page.tsx
├─ CampusView (new — Level 1)
│  ├─ RunOfficeCard[] (new — one per active Run)
│  │   ├─ PhaseBanner (new — shows current phase A/B/C/D)
│  │   ├─ NookPreview[] (new — mini indicators per role)
│  │   └─ TaskProgress (new — x/y tasks done mini-bar)
│  ├─ HotDeskArea (new — ad-hoc sessions)
│  │   └─ HotDeskBooth[] (new — one per ad-hoc session)
│  └─ CampusSidebar (new — run list + stats summary)
│
├─ RunOfficeView (new — Level 2)
│  ├─ OrchestratorStation (new — center)
│  ├─ RoleNook[] (new — Designer/Coder/Verifier/Reviewer)
│  │   └─ RoleCharacter (new — sprite + status indicator)
│  ├─ TaskWhiteboard (new — PLAN.md stickies in 3 columns)
│  └─ PhaseBanner (reused — larger version)
│
├─ NookDrillDown (new wrapper — Level 3)
│  ├─ OfficeGame (existing — reused unchanged)
│  └─ NookSidebar (new — role, model, session_id, task_id, elapsed)
│
└─ ViewTransition (existing — extended for 3 modes)
```

### Animation design

All animations use CSS transitions and keyframes. No React Spring or
canvas-level animation — the campus and office views are DOM-based, not
PixiJS. PixiJS is only used at Level 3 (existing OfficeGame).

#### 1. Office appears (`run_start`)
- Trigger: `run_start` event or new Run appears in `useRunStore`.
- Effect: RunOfficeCard scales from 0 → 1 with a 300ms ease-out + subtle
  glow. Door-closed state initially, opens after 200ms delay.
- CSS: `@keyframes office-appear { from { transform: scale(0); opacity: 0 } }`

#### 2. Phase transition (`run_phase_change`)
- Trigger: `Run.phase` changes in store.
- Effect: RunOfficeCard border color cross-fades (~600ms) to new phase
  color. Phase banner text flips with a 200ms slide-down/slide-up.
- Phase colors: A=#6366f1 (indigo), B=#f59e0b (amber), C=#10b981 (emerald),
  D=#8b5cf6 (violet), done=#64748b (slate).

#### 3. Task sticky transition (plan-task status change)
- Trigger: `PlanTask.status` changes in `Run.planTasks`.
- Effect: Sticky note slides from source column to destination column
  (~400ms). todo→in_progress: slides right. in_progress→done: slides right +
  checkmark appears with 100ms scale-in.
- Only visible inside RunOfficeView (Level 2) TaskWhiteboard.

#### 4. Character arrives at nook (`role_session_joined`)
- Trigger: new session with a role joins the run.
- Effect: RoleCharacter fades in at nook position over 500ms. Nook
  background lights up.

#### 5. Character leaves nook (session `stop`)
- Trigger: session ends.
- Effect: RoleCharacter fades out over 300ms. Nook dims.

#### 6. Office dims at run end (`run_end`)
- Trigger: `Run.outcome` changes from `in_progress`.
- Effect: RunOfficeCard opacity drops to 0.5, outcome glyph appears
  (completed=check, stuck=warning, abandoned=x-mark).

## Backend contract dependencies

All required contracts exist on `main` (merged in PR #4):

| Contract | Location | Status |
|---|---|---|
| `Run` model | `backend/app/models/runs.py` | Merged |
| `Session.run_id/role/task_id` | `backend/app/models/sessions.py` | Merged |
| Synthetic events | `backend/app/models/events.py` | Merged |
| `broadcast_run_state()` | `backend/app/core/broadcast_service.py` | Merged |
| `_run:<run_id>` channel | broadcast_service + ws manager | Merged |

### Backend gaps (noted, not scoped into Plan 2)

1. **`GET /api/v1/runs` endpoint** — the backend needs a REST endpoint to
   list active runs. The WebSocket channel exists but there's no REST
   discovery endpoint. This is a small backend addition (~20 lines).
   **Decision:** Include as Task 1 since the frontend can't populate the
   campus view without it. Scoped as a minimal API route, not a backend
   redesign.

2. **WebSocket manager `_run:` channel subscription** — verify that the
   existing WS manager supports subscribing to `_run:<run_id>` channels
   from the frontend. If not, a small backend tweak is needed.
   **Decision:** Investigate in Task 1; fix if trivial.

## Testing strategy

### Automated (coder must pass these)

1. **TypeScript compilation** — `npx tsc --noEmit` passes with zero errors.
2. **Lint** — `npx next lint` passes.
3. **Component render tests** — CampusView, RunOfficeView, TaskWhiteboard
   render correctly given fixture data (no crashes, correct element counts).
4. **Run store unit tests** — setRun/removeRun/classification logic works.
5. **`make checkall`** — full project check passes from root.

### Manual (UAT — coder simulates)

1. `make dev-tmux` → campus view loads at `http://localhost:3000`.
2. With no live runs → campus shows hot-desk area only, no ghost offices.
3. Backend simulation → an office appears with animation within 2s.
4. Phase change event → tint and banner update without page reload.
5. Plan-task status change → sticky slides in TaskWhiteboard.
6. Click a nook → OfficeGame renders for that session.
7. Click back → returns to RunOfficeView.
8. Ad-hoc session → appears in hot-desk area, not in any run office.

## Success criteria (programmatically verifiable)

| # | Criterion | Verification |
|---|---|---|
| SC-1 | `make dev-tmux` brings up campus view at localhost:3000 | `curl -s localhost:3000 \| grep -q "campus"` or manual check |
| SC-2 | With no live runs, campus shows hot-desk only | Render CampusView with empty runs Map → no RunOfficeCard elements |
| SC-3 | Synthetic run_start creates an office within 2s | Simulation script + visual check / component test with timer |
| SC-4 | Phase change visible without reload | Subscribe to run WS, change phase, assert PhaseBanner text updates |
| SC-5 | Plan-task status change visible | Update planTasks in store, assert sticky column membership changes |
| SC-6 | Nook click opens OfficeGame for correct session | Click handler sets activeRunId + sessionId, OfficeGame mounts |
| SC-7 | Hot-desk sessions never appear in run offices | Filter sessions by run_id; assert run office only shows run members |
| SC-8 | TypeScript compiles cleanly | `npx tsc --noEmit` exit code 0 |
| SC-9 | Full check passes | `make checkall` exit code 0 |

## Deferred / follow-up

- **BuildingView/FloorView removal** — Plan 2 adds CampusView as the new
  default but does not delete the legacy views. A follow-up PR removes them
  after verifying no regressions.
- **Hot-desk booth art** — MVP uses minimal card-style rendering. Pixel art
  booths are a polish pass.
- **Run office pixel art** — MVP offices are styled cards with CSS. Full
  pixel-art office interiors are a follow-up.
- **Run list pagination** — campus caps at ~8 visible offices. Overflow
  handling deferred.
- **Orchestrator walk choreography** — spawned characters appear at nooks
  directly (no pathfinding).
- **Backend `GET /api/v1/runs`** — if this endpoint doesn't exist, Task 1
  adds a minimal version. Not a backend redesign.
