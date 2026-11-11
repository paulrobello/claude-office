# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Claude Office Visualizer transforms Claude Code operations into a real-time pixel art office simulation. A "boss" character (main Claude agent) manages work, spawns "employee" agents (subagents), and orchestrates tasks visually.

See [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) for system architecture and component details.

## Commands

```bash
# Root
make install       # Install all dependencies
make dev-tmux      # Run in tmux (recommended) - backend :8000, frontend :3000
make dev-tmux-kill # Kill tmux session
make checkall      # Format, lint, typecheck, test all components
make simulate      # Run event simulation

# Component-specific (run from backend/ or frontend/)
make dev           # Start dev server
make checkall      # Check single component (faster)
uv run pytest tests/test_file.py::test_name  # Single backend test

# Hooks (cd hooks/)
./install.sh       # Install hooks
./uninstall.sh     # Remove hooks

# OpenCode Plugin (cd opencode-plugin/)
bun run build      # Build plugin
bun run typecheck  # Type check
```

## Development Workflow

**Preferred:** Use `make dev-tmux` - creates separate windows for backend/frontend.
- Read logs: `tmux capture-pane -t claude-office-dev:backend -p`
- Switch windows: `Ctrl-b n` / `Ctrl-b p`
- Hot reload enabled on both servers

**Debugging:** Hook logs at `~/.claude/claude-office-hooks.log` (set `CLAUDE_OFFICE_DEBUG=1` in `~/.claude/claude-office-config.env`, or run `make hooks-debug-on`)

## Project Skills

- **/office-sprite** - Generate office furniture sprites
- **/character-sprite** - Generate character sprite sheets
- **/desk-accessory** - Generate tintable desk items

See `.claude/skills/*/SKILL.md` for details.

## Workflow Guidelines

**Commit after every batch of work:** Always commit after completing each logical unit.

**Use subagents for validation:** Spawn a Bash subagent to run `make checkall` and commit:
```
"Run 'make checkall' from the project root. If successful, commit with message: '<message>'"
```

## Version Management

**Keep all version locations in sync** when bumping versions:

| Location | File |
|----------|------|
| Root package | `pyproject.toml` |
| Backend | `backend/pyproject.toml` |
| Backend OpenAPI | `backend/app/config.py` (`VERSION` — derived via `importlib.metadata`, no manual bump needed) |
| Hooks | `hooks/pyproject.toml` |
| Hooks CLI | `hooks/src/claude_office_hooks/main.py` (`__version__` — derived via `importlib.metadata`, no manual bump needed) |
| Frontend package | `frontend/package.json` |
| Frontend display | `frontend/src/app/page.tsx` (header badge) |
| OpenCode plugin | `opencode-plugin/package.json` |

To bump all manual locations at once: `make bump-version VERSION=x.y.z` (rewrites the
manual rows above; the two derived rows — backend `VERSION` and hooks `__version__` —
follow the installed package automatically). CI cross-check: `make version-check` (ARC-021).
