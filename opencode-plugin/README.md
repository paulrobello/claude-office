# OpenCode Plugin for Claude Office Visualizer

An [OpenCode](https://opencode.ai) plugin that sends lifecycle events to the Claude Office Visualizer backend, enabling the same pixel-art office visualization that the Claude Code hooks provide.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Event Mapping](#event-mapping)
- [Commands](#commands)
- [Development](#development)
- [Uninstallation](#uninstallation)
- [Related Documentation](#related-documentation)

## Overview

The plugin intercepts OpenCode lifecycle events (session, tool, message, permission, compaction, token usage) and POSTs them to the claude-office backend API. Events are fire-and-forget with short timeouts so the plugin never blocks OpenCode.

## Prerequisites

| Requirement | Version |
|-------------|---------|
| OpenCode | Latest |
| Bun | 1.0+ |
| Claude Office backend | Running on `localhost:8000` |

## Installation

```bash
# From the project root
make opencode-install
```

This builds the plugin, links it globally via bun, and registers it in `~/.config/opencode/opencode.json`.

## Configuration

Configuration is via environment variables.

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_OFFICE_API_URL` | `http://localhost:8000/api/v1/events` | Backend API endpoint |
| `CLAUDE_OFFICE_TIMEOUT_MS` | `1500` | HTTP request timeout in milliseconds |
| `CLAUDE_OFFICE_DEBUG` | `0` | Set to `1` to log events to stderr |

## Event Mapping

The plugin maps OpenCode events to claude-office backend events:

| OpenCode Event | Backend Event |
|----------------|---------------|
| `session.created` | `session_start` |
| `session.deleted` | `session_end` |
| `session.idle` | `stop` |
| `session.compacted` | `context_compaction` |
| `chat.message` hook | `user_prompt_submit` |
| `tool.execute.before` | `pre_tool_use` / `subagent_start` |
| `tool.execute.after` | `post_tool_use` / `subagent_stop` |
| `permission.ask` | `permission_request` |
| `step-finish` part | `reporting` (token usage) |
| `message.updated` (assistant) | `reporting` (token usage) |

Tool names matching `task` or `agent` (case-insensitive) are mapped as subagent events, matching the Claude Code behavior.

## Commands

| Command | Description |
|---------|-------------|
| `make opencode-install` | Build and register plugin with OpenCode |
| `make opencode-uninstall` | Remove plugin from OpenCode |
| `make opencode-reinstall` | Uninstall and reinstall plugin |
| `make opencode-build` | Build plugin without registering |

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Type check
bun run typecheck
```

## Uninstallation

```bash
make opencode-uninstall
```

## Related Documentation

- [Project README](../README.md) - Project overview
- [Architecture](../docs/ARCHITECTURE.md) - System design details
- [Quick Start](../docs/QUICKSTART.md) - Getting started guide
