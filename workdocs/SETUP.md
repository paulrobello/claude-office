# Setup — Plan 2 Frontend

## Prerequisites (already in place)

All tooling from the root `CLAUDE.md` applies:

```bash
make install       # Install all dependencies (root)
make dev-tmux      # Run backend :8000 + frontend :3000
make checkall      # Lint, typecheck, test all components
```

## Frontend-specific

```bash
cd frontend
npm run dev        # Next.js dev server (port 3000)
npx tsc --noEmit  # TypeScript check (no output)
npx next lint      # ESLint check
```

## Backend verification

The backend must be running for WebSocket and REST calls to work:

```bash
cd backend
make dev           # FastAPI on port 3400
```

Verify run contracts are available:
```bash
curl -s http://localhost:3400/api/v1/sessions | python3 -m json.tool
# Should return session list with run_id/role/task_id fields
```

After Task 1:
```bash
curl -s http://localhost:3400/api/v1/runs | python3 -m json.tool
# Should return [] (empty array) or active runs
```

## Simulation

The backend simulation script is used for UAT:
```bash
curl -X POST http://localhost:3400/api/v1/sessions/simulate
```

This triggers a session lifecycle. After Task 17, verify it also triggers
run events (run_start, phase changes, task updates, run_end).

## No additional tooling required

- No Storybook (component tests are sufficient for MVP).
- No Playwright (manual UAT via dev server).
- No pixel asset pipeline (CSS-based rendering for campus/office views;
  PixiJS assets already exist for drill-down level).
- No new environment variables.
