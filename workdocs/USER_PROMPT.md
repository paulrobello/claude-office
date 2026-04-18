# USER_PROMPT — Spec A Plan 2 (frontend)

## Context

Phased chain. Prior run merged to main as PR #4 (squash commit `7df4a2c`) —
backend plumbing for Ralph run visualization is in. This run implements the
**frontend** that consumes those contracts.

Spec A (overall design) lives on `ralph/workdocs_archive` branch under
`archive/2026-04-18-spec-a-plan1/SPEC.md`. Designer must read it.

## Goal

Build the Panoptica frontend pieces of Spec A: a pixel-art campus view where
each live Ralph run is a private office, unrelated Claude Code sessions live
on a shared hot-desk floor, role-specific nooks inside each run office
(Orchestrator, Designer, Coder, Verifier, Reviewer), and demo-legible
animations on the three highest-signal transitions.

Reuse existing single-session rendering code as the per-nook drill-down zoom
level (Spec A demotes it to a degenerate case).

## Backend contracts (available today on main)

- **WebSocket channel** `_run:<run_id>` (validated regex `^ral-[0-9]{8}-[0-9a-f]{4}$`)
  broadcasts `Run` state changes. Subscribe from frontend.
- **Session** model exposes `run_id`, `role`, `task_id` when the session is
  part of a Ralph run (null otherwise → hot-desk).
- **Synthetic events** on the regular event stream: `run_start`,
  `run_phase_change`, `run_end`, `role_session_joined`. Use for animation
  triggers.
- **Run domain type** (`backend/app/models/runs.py`): `Run.phase` in
  `{A, B, C, D}`, `Run.outcome`, `Run.plan_tasks` with statuses
  `{todo, in_progress, done, stuck}`, `Run.member_session_ids` for roster.

## Must-haves (MVP)

1. **Campus view** — all live runs as offices + hot-desk area. Glanceable.
2. **Per-run office** — orchestrator desk + one nook per active role;
   occupancy matches member_session_ids filtered by role.
3. **Drill-down** — clicking a nook zooms to the existing single-session
   renderer (reuse, don't rebuild).
4. **Three animations**: run_start (office appears + move-in), phase_change
   (A→B→C→D banner/transition), plan-task status change (task checkbox
   flip or equivalent).
5. **Hot-desk area** — ad-hoc Claude Code sessions (run_id == null) render
   here, never inside a run office.

## Non-goals

- Token/cost dashboards (Spec B).
- Ralph wizard / Linear (Spec C).
- Historical run replay (live-only for MVP).

## Constraints

- **Branch:** `feature/ralph-panoptica-spec-a-plan2` (already created).
- **Framework:** existing Panoptica frontend — Next.js / React + pixel-art
  assets already in `frontend/src/`. Designer must read `frontend/CLAUDE.md`
  and `frontend/src/` before proposing structure.
- **Reuse existing rendering.** Do not rewrite single-session view; wrap it.
- **No backend changes** in this run unless a contract gap is discovered.
- **Preserve test green.** Frontend tests (if any — designer must check)
  must stay green.

## Success criteria (programmatic)

- `make dev-tmux` brings up a campus view on `http://localhost:3000`.
- With no live runs: campus shows hot-desk area only, no ghost offices.
- Injecting a synthetic `run_start` via the backend simulation script shows
  an office appearing with a move-in animation within 2s.
- Phase change and plan-task updates are visible without page reload.
- Drill-down click on a nook opens the single-session renderer wrapping the
  correct session.

## Interview

**Skip human interview.** Orchestrator is warmed up (just completed Plan 1
and chain 2). Acts as interviewee for the designer — designer should ask
concrete architectural questions about component tree, state management, and
animation strategy; orchestrator answers from project context + memory.

## References for the designer

- `ralph/workdocs_archive` branch — `archive/2026-04-18-spec-a-plan1/SPEC.md`
- `frontend/src/` — current single-session renderer
- `frontend/CLAUDE.md` — frontend-specific guidance
- PR #4 (merged) — backend types and WebSocket channels
