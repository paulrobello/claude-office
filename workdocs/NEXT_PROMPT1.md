# NEXT_PROMPT1 — Designer for Spec A Plan 2 (frontend)

You are the **Designer** agent (🎨) in a Ralph workflow. Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`.

Read the Ralph skill at `~/.claude/plugins/cache/tesseron-tools/ralph/1.0.1/skills/ralph-workflow/SKILL.md`
first (full workflow). Your template is `agents/designer.md` in that skill.
Continue from **step A11** (discovery) — the orchestrator is warmed up and
the human interview is skipped.

## What you must read before anything else

1. `workdocs/USER_PROMPT.md` — full Plan 2 scope from the user (verbatim).
2. **Archived Spec A (full design doc)** — git show this:
   ```
   git show ralph/workdocs_archive:archive/2026-04-18-spec-a-plan1/SPEC.md
   ```
   This is the overall Spec A design: campus view, offices per run, role
   nooks, hot-desk floor, animations. Plan 2 implements the frontend of
   this spec.
3. **Merged backend contracts** — these are live on main:
   - `backend/app/models/runs.py` (Run, PlanTask, Role, RunPhase, RunOutcome)
   - `backend/app/models/sessions.py` (Session.run_id / role / task_id)
   - `backend/app/models/events.py` (synthetic events: run_start,
     run_phase_change, run_end, role_session_joined)
   - `backend/app/core/broadcast_service.py` (the `_run:<run_id>` channel)
4. **Existing frontend** — read:
   - `frontend/CLAUDE.md`
   - `frontend/src/app/page.tsx` (entry point)
   - `frontend/src/components/game/` (existing single-session renderer — must be reused)
   - `frontend/src/hooks/useSessions.ts`, `useRoomSessions.ts`, `useFloorSessions.ts`, `useWebSocketEvents.ts`, `useSessionSwitch.ts`, `useFloorConfig.ts`
   - `frontend/src/stores/preferencesStore.ts`
5. **Project memory** — the user's memory directory has Panoptica-specific
   context at `/Users/m.cadilecaceres/.claude/projects/-Users-m-cadilecaceres-dev-tesseron/memory/`
   including project_panoptica.md, project_flatten_rooms.md,
   project_rethink_building_view.md, project_agent_choreography_issues.md.
   Read these — they encode user preferences on layout.

## Orchestrator as interviewee (A12)

Since the human interview is skipped, the orchestrator stands in. You ask
concrete questions in `TAKEAWAYS.md` (or a scratch file), orchestrator will
answer by editing. Before asking, exhaust the codebase + memory — don't ask
what you can discover.

Likely high-leverage questions (confirm before investing in answers):
- Should hot-desk be a separate scene from the campus, or integrated as a
  zoomable region?
- Animation approach: CSS transitions, React Spring, or canvas/pixel-based?
- Single-source-of-truth for run state: new Zustand store, or extend
  existing preferencesStore / session stores?
- Per-run office layout — procedural (generated from role count) or fixed
  templates (A/B/C/D phase matters)?

## Deliverables (A13–A15)

1. `workdocs/SPEC.md` — Plan 2 frontend spec with programmatically verifiable
   success criteria (per `specification-guide.md`). UAT flows required
   (see designer.md).
2. `workdocs/PLAN.md` — granular task list. Each task: ~1 focused coder
   session; `[ ]` status markers; file paths per task; dependency notes.
3. `workdocs/SETUP.md` — any frontend tooling needed beyond what's in root
   `CLAUDE.md` (e.g., Storybook, Playwright, pixel asset pipeline).
4. Seed `workdocs/TAKEAWAYS.md` with design decisions + rationale.

## Constraints

- No code changes. You only write workdocs.
- Do not modify backend contracts. If you discover a gap, note it in SPEC
  under "Deferred / follow-up" — do not scope it into Plan 2.
- Reuse existing single-session renderer at the nook drill-down zoom.
- Keep plan bounded — aim for 10–18 coder tasks, max. Larger → propose
  phase split (Plan 2a / 2b) with orchestrator approval.

## When done

Commit all workdocs (`git add workdocs/ && git commit -m "design(plan2):
frontend spec + plan"`). Exit. Orchestrator will review and start Phase B.

If stuck on a structural question the orchestrator can't resolve from
memory/code, note it in TAKEAWAYS under `## Blocked on human` and exit —
orchestrator will escalate.
