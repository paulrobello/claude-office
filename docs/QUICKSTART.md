# Quick Start Guide

Get Claude Office Visualizer running in under 5 minutes. This guide covers the fastest path from clone to visualization.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Starting the Visualizer](#starting-the-visualizer)
- [Verifying Installation](#verifying-installation)
- [Next Steps](#next-steps)
- [Troubleshooting](#troubleshooting)
- [Related Documentation](#related-documentation)

## Overview

Claude Office Visualizer transforms Claude Code operations into a real-time pixel art office simulation. Once installed, it automatically captures Claude Code events and displays them as animated office activities.

```mermaid
graph LR
    CC[Claude Code]
    Hooks[Hooks]
    Backend[Backend :8000]
    Frontend[Frontend :3000]

    CC -->|Events| Hooks
    Hooks -->|HTTP POST| Backend
    Backend -->|WebSocket| Frontend

    style CC fill:#4a148c,stroke:#9c27b0,stroke-width:2px,color:#ffffff
    style Hooks fill:#37474f,stroke:#78909c,stroke-width:2px,color:#ffffff
    style Backend fill:#e65100,stroke:#ff9800,stroke-width:3px,color:#ffffff
    style Frontend fill:#0d47a1,stroke:#2196f3,stroke-width:2px,color:#ffffff
```

## Prerequisites

Before starting, ensure you have:

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Python | 3.14+ | `python --version` |
| Node.js | 20+ | `node --version` |
| uv | Latest | `uv --version` |
| Claude Code | Latest | `claude --version` |
| tmux | Any | `tmux -V` |

> **📝 Note:** tmux is optional but recommended for the best development experience. Bun can be used as an alternative to Node.js/npm.

### Installing uv (if needed)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/paulrobello/claude-office.git
cd claude-office
```

### Step 2: Install All Dependencies

```bash
make install-all
```

This single command:
- Installs backend Python dependencies via uv
- Installs frontend dependencies (auto-detects bun or npm)
- Installs Claude Code hooks

### Step 3: Verify Hooks Installation

```bash
make hooks-status
```

Expected output shows installed hooks and configuration:
```
=== Installed Claude Code Hooks ===
  PreToolUse: 1 hook(s)
  PostToolUse: 1 hook(s)
  ...

=== Hook Config ===
CLAUDE_OFFICE_STRIP_PREFIXES="..."
CLAUDE_OFFICE_DEBUG=1
```

## Starting the Visualizer

### Recommended: Using tmux

```bash
make dev-tmux
```

This creates a tmux session with separate windows for backend and frontend:

| Window | Service | URL |
|--------|---------|-----|
| 0: backend | FastAPI server | http://localhost:8000 |
| 1: frontend | Next.js dev server | http://localhost:3000 |

**Navigation:**
- `Ctrl-b n` - Next window
- `Ctrl-b p` - Previous window
- `Ctrl-b d` - Detach (services keep running)

### Alternative: Without tmux

```bash
make dev
```

This runs both services in the same terminal (less convenient for viewing logs).

## Verifying Installation

### 1. Check Backend Health

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status": "ok"}
```

### 2. Open the Frontend

Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

You should see the pixel art office with:
- A boss character at the main desk
- Empty employee desks
- A city skyline window
- Status panels on the sides

### 3. Test with Claude Code

In a separate terminal, run any Claude Code command:

```bash
claude "What is 2 + 2?"
```

Watch the visualizer:
1. Boss picks up the phone (receiving prompt)
2. Boss works at the desk (processing)
3. Speech bubble appears with response summary

### 4. Test Subagent Visualization

Run a command that spawns subagents:

```bash
claude "Search this codebase for all Python files and summarize what each does"
```

Watch the visualizer:
1. Boss delegates work
2. Employee agents spawn from the elevator
3. Agents walk to desks and work
4. Agents return to elevator when done

## Next Steps

Now that the visualizer is running:

| Task | Command/Action |
|------|----------------|
| Run simulation | Click the **Simulate** button in the frontend header |
| Enable debug mode | Press `D` in the browser |
| View hook logs | `make hooks-logs` |
| Stop services | `make dev-tmux-kill` |

### Keyboard Shortcuts (in browser)

| Key | Action |
|-----|--------|
| `D` | Toggle debug mode |
| `P` | Show agent paths (debug mode only) |
| `Q` | Show queue slots (debug mode only) |
| `L` | Show phase labels (debug mode only) |
| `O` | Show obstacles (debug mode only) |
| `T` | Fast-forward city time (debug mode only) |

## Troubleshooting

### Hooks Not Triggering

```bash
# Enable debug logging
make hooks-debug-on

# Watch logs in real-time
make hooks-logs-follow

# Then run a Claude command and check for output
```

### Port Already in Use

```bash
# Kill existing services
make dev-tmux-kill

# Or manually kill processes on ports
lsof -ti:8000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### Frontend Not Connecting

1. Check backend is running: `curl http://localhost:8000/health`
2. Check browser console for WebSocket errors
3. Try hard refresh: `Ctrl+Shift+R`

### No Agents Appearing

1. Verify hooks are installed: `make hooks-status`
2. Restart Claude Code after hook installation
3. Check hook logs: `make hooks-logs`

> **⚠️ Warning:** After installing hooks, you must restart Claude Code for them to take effect.

## Related Documentation

- [README.md](../README.md) - Project overview and full feature list
- [Architecture](ARCHITECTURE.md) - System design and component details
- [Docker Guide](DOCKER.md) - Container deployment instructions
- [AI Summary](AI_SUMMARY.md) - AI-powered summary service documentation
