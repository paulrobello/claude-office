# How Panoptica Works

Panoptica is a read-only control room for Claude Code sessions. It captures lifecycle events from every Claude Code session and visualizes them in real-time through four modes: browser window, Electron desktop app, terminal TUI, and OS notifications.

## Table of Contents

- [System Architecture](#system-architecture)
- [Event Flow](#event-flow)
- [Plugin System](#plugin-system)
- [Hook Pipeline](#hook-pipeline)
- [Visualization Modes](#visualization-modes)
- [Backend](#backend)
- [Session Naming](#session-naming)
- [Port Mapping](#port-mapping)
- [Tux Workdoc Integration](#tux-workdoc-integration)

## System Architecture

<picture>
  <img src="diagrams/system-architecture.svg" alt="System Architecture" />
</picture>

Panoptica has four layers:

| Layer | Technology | Role |
|-------|-----------|------|
| **Hook** | Shell script (via tesseron-tools plugin) | Captures Claude Code events, POSTs to backend |
| **Backend** | FastAPI + SQLite | Processes events, maintains state machines, broadcasts via WebSocket |
| **Frontend** | Next.js + PixiJS | Pixel-art office canvas, agent visualization |
| **Clients** | Electron / Ratatui TUI / OS Notifications | Multiple ways to consume the visualization |

The backend is the single source of truth. All clients are stateless renderers that display whatever the backend broadcasts via WebSocket.

## Event Flow

<picture>
  <img src="diagrams/event-flow.svg" alt="Event Flow Sequence" />
</picture>

Every Claude Code action generates lifecycle events. The flow:

1. **Claude Code** fires a hook event (e.g., `PreToolUse`, `SubagentStart`)
2. **Plugin hook** reads the JSON payload from stdin, enriches it with Tux workdoc context, and POSTs to the backend
3. **Backend** persists the event, updates the session's state machine, and broadcasts the new state via WebSocket
4. **Clients** receive the broadcast and update their display in real-time

### Event Types

| Event | Trigger | What it means |
|-------|---------|---------------|
| `SessionStart` | New Claude Code session | Creates a session in the backend |
| `PreToolUse` | Agent about to call a tool | Agent is now "active", shows current tool |
| `PostToolUse` | Tool call completed | Agent finished tool use |
| `UserPromptSubmit` | Human sends a message | New user input recorded |
| `SubagentStart` | Agent spawns a subagent | New worker appears in the office |
| `SubagentStop` | Subagent finishes | Worker leaves the office |
| `Stop` | Session ends | Session marked as completed |
| `Notification` | Background task update | Informational event |

## Plugin System

<picture>
  <img src="diagrams/plugin-structure.svg" alt="Plugin Structure" />
</picture>

Panoptica is distributed as a plugin in the **tesseron-tools** marketplace. Install it via `/plugin` in Claude Code.

### Plugin Structure

```
plugins/panoptica/
  .claude-plugin/
    plugin.json          # Plugin manifest (name, version, description)
  hooks/
    hooks.json           # Hook event registrations
    panoptica-hook.sh    # Shell bridge script
  skills/
    panoptica/
      SKILL.md           # /panoptica slash command
```

### `/panoptica` Skill

The plugin provides a `/panoptica` slash command with these subcommands:

| Command | Action |
|---------|--------|
| `/panoptica` or `/panoptica status` | Check backend health, show active sessions |
| `/panoptica attach` | Open the browser dashboard for the current session |
| `/panoptica detach` | Stop sending events for this session |
| `/panoptica open` | Open the Panoptica frontend in the browser |

## Hook Pipeline

<picture>
  <img src="diagrams/hook-pipeline.svg" alt="Hook Pipeline" />
</picture>

The hook script (`panoptica-hook.sh`) bridges Claude Code events to the backend:

1. **Reads** the JSON event from stdin (piped by Claude Code)
2. **Resolves** the backend URL: `$PANOPTICA_URL` env var > `~/.claude/claude-office-config.env` > default `localhost:3400`
3. **Detects** Tux workdoc context from the git branch name (e.g., `feature/PRO-34--step-1`)
4. **Delegates** to `claude-office-hook` CLI if available, otherwise falls back to a direct `curl` POST
5. **Fire-and-forget**: backgrounded, suppressed output, always exits 0 (never blocks Claude Code)

### Safety Guarantees

The hook is designed to never interfere with Claude Code:
- All stdout/stderr is suppressed (`exec 1>/dev/null 2>/dev/null`)
- Always exits 0 (non-zero would block Claude actions)
- HTTP calls are backgrounded with short timeouts (1s connect, 2s max)
- If the backend is down, events are silently dropped

## Visualization Modes

<picture>
  <img src="diagrams/client-modes.svg" alt="Client Modes" />
</picture>

### Mode 1: Browser Window

The full pixel-art office simulation. Characters represent agents, desks show current work, and the whiteboard rotates through 11 display modes.

```bash
# Start backend + frontend
make dev-tmux
# Open browser
open http://localhost:3401
```

### Mode 2: Electron Desktop App

A standalone desktop application that wraps the browser frontend with native features:

- **System tray** with session count and quick access
- **Always on top** option for monitoring while coding
- **Minimize to tray** instead of closing
- **Deep links**: `panoptica://session/<id>` opens directly to a session
- **Backend management**: auto-starts and manages the backend subprocess

```bash
cd desktop && npm run dev           # Windowed mode
cd desktop && npm run dev -- --headless  # Tray + notifications only
```

### Mode 3: Terminal TUI

A Rust-based terminal dashboard using ratatui. Shows agents and events in a split-pane layout. Ideal for a tmux pane alongside your editor.

```bash
panoptica sessions                  # List active sessions
panoptica watch                     # Auto-discover and watch live
panoptica watch --session <id>      # Watch a specific session
```

**Keyboard**: `q`/`Esc` to quit.

### Mode 4: Notifications Only

Headless mode with no UI window. The Electron app runs as a tray icon and fires native OS notifications based on agent urgency:

| Urgency | Trigger | Notification |
|---------|---------|-------------|
| **Blocked** | Permission request | Immediate, with sound |
| **Completed** | Session/task ends | Silent notification |
| **Info** | General events | Batched (5s window) |

Notifications are skipped if the main window is visible and focused.

## Backend

The FastAPI backend (`backend/`) is the brain of Panoptica:

| Component | File | Role |
|-----------|------|------|
| API routes | `app/api/routes/` | REST endpoints for events, sessions, state |
| Event processor | `app/core/event_processor.py` | Routes events to handlers, persists to DB |
| State machine | `app/core/state_machine.py` | Tracks boss state, agent states, phases |
| WebSocket hub | `app/core/broadcast_service.py` | Broadcasts state changes to all clients |
| Product mapper | `app/core/product_mapper.py` | Maps sessions to floors/rooms by project |
| DB models | `app/db/models.py` | SQLite schema (sessions, events, tasks) |

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/events` | POST | Receive hook events |
| `/api/v1/sessions` | GET | List all sessions |
| `/api/v1/sessions/{id}` | GET | Get session details |
| `/api/v1/sessions/{id}` | DELETE | Remove a session |
| `/ws/session/{id}` | WS | Real-time state stream for a session |
| `/ws/notifications` | WS | Cross-session notification stream |
| `/health` | GET | Health check |

## Session Naming

Sessions are identified by UUID and optionally have a `displayName`:

- **`projectName`**: Derived from the working directory (e.g., "tesseron", "tux")
- **`displayName`**: Human-friendly name derived from the subdirectory relative to the git root (e.g., "panoptica", "lexio/backend")

If `displayName` is set, it takes priority in all UIs. Sessions started from `~/dev/tesseron/panoptica/` will show as "panoptica" rather than "tesseron".

## Port Mapping

Panoptica follows the Tesseron port convention (34xx):

| Service | Port | URL |
|---------|------|-----|
| Backend (FastAPI) | 3400 | `http://localhost:3400` |
| Frontend (Next.js) | 3401 | `http://localhost:3401` |

## Tux Workdoc Integration

When working on a Tux-managed branch (e.g., `feature/PRO-34--step-1`), the hook automatically:

1. Detects the workdoc ID from the branch name (`PRO-34`)
2. Extracts the step number if present (`1`)
3. Sends `tux_workdoc_id` and `tux_workdoc_step` alongside the event

This enables Phase 5 features: showing workdoc progress, Linear issue links, and plan status in the visualization.

## Regenerating Diagrams

All diagrams are generated from Mermaid definitions using [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid):

```bash
node docs/generate-diagrams.mjs
```

This renders SVGs to `docs/diagrams/`. Edit the diagram definitions in `generate-diagrams.mjs` and re-run to update.
