# Claude Office Visualizer

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![GitHub](https://img.shields.io/badge/github-paulrobello%2Fclaude--office-blue?logo=github)
![Runs on Linux | MacOS | Windows](https://img.shields.io/badge/runs%20on-Linux%20%7C%20MacOS%20%7C%20Windows-blue)

[![Watch the demo](https://img.shields.io/badge/YouTube-Demo-red?logo=youtube)](https://youtu.be/AM2UjKYB8Ew)

## Table of Contents

* [Screenshots](#screenshots)
* [About](#about)
* [Features](#features)
* [Quick Start](#quick-start)
* [Prerequisites](#prerequisites)
* [Installation](#installation)
* [Development](#development)
* [Project Structure](#project-structure)
* [Troubleshooting](#troubleshooting)
* [Contributing](#contributing)
* [Related Documentation](#related-documentation)

## Screenshots

![Office View](https://raw.githubusercontent.com/paulrobello/claude-office/main/screenshot.png)


## About

Claude Office Visualizer is a real-time pixel art office simulation that visualizes Claude Code operations. Watch as a "boss" character (main Claude agent) manages work, spawns "employee" agents (subagents), and orchestrates tasks in an animated office environment.

The application was built with [Next.js](https://nextjs.org/), [PixiJS](https://pixijs.com/), [FastAPI](https://fastapi.tiangolo.com/), and [Zustand](https://github.com/pmndrs/zustand).

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/probello3)

## Features

### Core Capabilities
- **Real-time Visualization**: Watch Claude Code operations as they happen in an animated office
- **Boss & Employee Agents**: Main Claude agent as boss, subagents as employees
- **Visual State Indicators**: Working, delegating, waiting states clearly displayed
- **Thought/Speech Bubbles**: See agent activities and communications

### Advanced Features
- **Multi-Mode Whiteboard**: 11 display modes with keyboard shortcuts (0-9, T, B) - todo list, remote workers, tool usage pie chart, org chart, stonks, weather, safety board, timeline, news ticker, coffee tracker, heat map
- **Background Task Tracking**: Remote Workers display shows background task status in video-call-style tiles
- **Context Window Tracking**: Animated trashcan fills with paper as context increases
- **Compaction Animation**: Boss stomps on trashcan to compact context
- **City Skyline Window**: Real-time day/night cycle based on local time
- **Git Status Panel**: See repository status in real-time
- **Printer Station**: Printer animates when Claude completes work that produces a report or document
- **Random Quotes**: Agents display random acceptance/completion quotes when receiving or turning in work
- **Safety Sign**: Tool counter tracks uses since last context compaction

### Technical Excellence
- **WebSocket Architecture**: Real-time state updates from backend to frontend
- **Extensible Design**: Easy to add new visualizations and features
- **Cross-Platform**: Runs on Windows, macOS, and Linux


## Quick Start

For the fastest setup, see the [Quick Start Guide](docs/QUICKSTART.md).

```bash
git clone https://github.com/paulrobello/claude-office.git
cd claude-office
make install-all
make dev-tmux
```

Then open [http://localhost:3000](http://localhost:3000) and run any Claude Code command to see it visualized.

## Prerequisites

- Python 3.14+
- Node.js 20+ (Bun auto-detected if available)
- uv (Python package manager)
- Claude Code CLI installed and configured

## Installation

### Quick Start

```bash
# Clone the repository
git clone https://github.com/paulrobello/claude-office.git
cd claude-office

# Install all components (backend, frontend, hooks)
make install-all
```

### Manual Installation

```bash
# Install backend dependencies
cd backend && uv sync && cd ..

# Install frontend dependencies
cd frontend && bun install && cd ..

# Install hooks into Claude Code
make hooks-install
```

### Enable AI Enhancements (Optional)

For AI-powered features like agent name generation and task summaries, create a `.env` file in the `backend/` folder with your Claude Code OAuth token:

```bash
# Set up a long-lived authentication token (requires Claude subscription)
# This will prompt you to authenticate and display your token
claude setup-token

# Create the .env file with the token
echo "CLAUDE_CODE_OAUTH_TOKEN=your-token-here" > backend/.env
```

Without this token, the visualizer works fully but displays raw agent IDs instead of friendly generated names, and tool names instead of summarized tasks. The frontend displays AI status in the top right corner so you can verify if it's properly configured.

## Development

### Starting the Development Servers

**Recommended: Using tmux**

```bash
make dev-tmux
```

Navigate between windows with `Ctrl-b n` (next) and `Ctrl-b p` (previous).

**Alternative: Basic parallel mode**

```bash
make dev
```

### Available Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start backend and frontend in parallel |
| `make dev-tmux` | Start in tmux with separate windows (recommended) |
| `make dev-tmux-kill` | Kill the tmux session |
| `make checkall` | Run format, lint, typecheck, and tests |
| `make simulate` | Run event simulation script |
| `make build-static` | Build frontend and copy to backend for standalone deployment |
| `make clean-all` | Remove all build artifacts and data |

### Hook Management

| Command | Description |
|---------|-------------|
| `make hooks-install` | Install hooks into Claude Code |
| `make hooks-uninstall` | Remove hooks from Claude Code |
| `make hooks-status` | Show installed hooks and config |
| `make hooks-logs` | View recent hook logs |
| `make hooks-debug-on` | Enable debug logging |
| `make hooks-debug-off` | Disable debug logging |

### Docker Deployment

| Command | Description |
|---------|-------------|
| `make docker-build` | Build Docker image |
| `make docker-up` | Start container in background |
| `make docker-down` | Stop container |
| `make docker-logs` | View container logs |

See [Docker Guide](docs/DOCKER.md) for detailed configuration.

### Accessing the Visualizer

Once running, open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
claude-office/
├── backend/               # FastAPI backend
│   ├── app/
│   │   ├── api/          # REST and WebSocket endpoints
│   │   ├── core/         # State machine, event processor
│   │   └── models/       # Pydantic models
│   └── pyproject.toml
├── frontend/             # Next.js + PixiJS frontend
│   ├── src/
│   │   ├── components/   # React/PixiJS components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── stores/       # Zustand state stores
│   │   └── systems/      # Animation, pathfinding
│   └── package.json
├── hooks/                # Claude Code integration
│   ├── src/              # Hook implementation
│   ├── install.sh        # Hook installer
│   └── uninstall.sh      # Hook uninstaller
├── scripts/              # Utility scripts
├── docs/                 # Documentation
└── Makefile              # Project orchestration
```

## Troubleshooting

### Hooks Not Firing

1. Check hooks are installed: `make hooks-status`
2. Enable debug logging: `make hooks-debug-on`
3. Watch logs: `make hooks-logs-follow`

### Frontend Not Updating

1. Check WebSocket connection in browser dev tools (Network > WS)
2. Verify backend is running: [http://localhost:8000/health](http://localhost:8000/health)
3. Check browser console for errors

### Backend Errors

1. Check backend logs in tmux window or terminal
2. Clear database and restart: `make clean-db && make dev`

### Common Issues

| Issue | Solution |
|-------|----------|
| "Session already exists" | Run `make dev-tmux-kill` first |
| Port 8000 in use | Stop other services on that port |
| Port 3000 in use | Stop other services on that port |
| Hooks not detected | Restart Claude Code after installing hooks |

## Contributing

Contributions are welcome! Please ensure that all pull requests:

1. Pass all checks: `make checkall`
2. Follow the existing code style
3. Include appropriate tests for new features
4. Update documentation as needed

## Related Documentation

- [Quick Start Guide](docs/QUICKSTART.md) - Get running in under 5 minutes
- [Architecture](docs/ARCHITECTURE.md) - System design, data flow, component details
- [Whiteboard Modes](docs/WHITEBOARD.md) - 11 display modes with keyboard shortcuts
- [Docker Guide](docs/DOCKER.md) - Docker deployment and configuration
- [AI Summary](docs/AI_SUMMARY.md) - AI-powered summary service documentation
- [Backend README](backend/README.md) - Backend-specific setup
- [Frontend README](frontend/README.md) - Frontend-specific setup
- [Hooks README](hooks/README.md) - Hook installation details
- [Scripts README](scripts/README.md) - Testing and simulation scripts
- [CLAUDE.md](CLAUDE.md) - AI assistant instructions for this project
