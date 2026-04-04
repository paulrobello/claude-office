# Panoptica Phase 1 — Codebase Audit Synthesis

**Date**: 2026-03-29
**Auditors**: 3 parallel agents (backend, frontend, hooks)
**Scope**: Full architecture audit of `paulrobello/claude-office` fork

---

## Architecture Overview

| Layer | Tech | Key Files | Lines |
|-------|------|-----------|-------|
| Backend | FastAPI + SQLAlchemy + WebSocket | 35 Python files | ~4,800 |
| Frontend | Next.js 16 + PixiJS 8 + Zustand 5 + XState 5 | ~60 TS/TSX files | ~8,000 |
| Hooks | Stdlib Python (no deps) | 5 Python files + 3 shell scripts | ~600 |

---

## Backend Summary

### Core Components
- **EventProcessor** — Singleton routing 19 event types to modular handlers
- **StateMachine** — Per-session state: 8 OfficePhases, boss/agents/elevator/phone state, conversation, whiteboard
- **Handlers** — `session_handler`, `agent_handler`, `tool_handler`, `conversation_handler`
- **Pollers** — TaskFilePoller, TranscriptPoller, BeadsPoller (real-time file watching)
- **Services** — SummaryService (Haiku AI), GitService (repo status), BroadcastService (WebSocket)
- **Database** — SQLite with 4 models: SessionRecord, EventRecord, TaskRecord, UserPreference

### Event Flow
```
Hook → POST /api/v1/events → EventProcessor.process_event()
  → _persist_event() [DB]
  → StateMachine.transition() [state update]
  → handler_* [business logic]
  → broadcast_state() [WebSocket → all clients]
```

### API Surface
- `POST /api/v1/events` — Receive hook events
- `GET /api/v1/sessions` — List sessions
- `DELETE /api/v1/sessions/{id}` — Delete session
- `POST /api/v1/sessions/simulate` — Run simulation
- `GET/PUT /api/v1/preferences` — User preferences CRUD
- `GET /api/v1/status` — AI summary availability
- `WS /ws/{session_id}` — Real-time state stream

### StateMachine Key Fields
- `boss_state: BossState` (idle, phone_ringing, on_phone, receiving, working, delegating, waiting_permission, reviewing, completing)
- `agents: dict[str, Agent]` — max 8 agents
- `conversation: list[ConversationEntry]` — user/assistant/thinking/tool roles
- `whiteboard: WhiteboardTracker` — 11 display modes with stats
- `arrival_queue / departure_queue: list[str]`
- `elevator_state: ElevatorState` (closed, arriving, open, departing)

---

## Frontend Summary

### Rendering Pipeline
- **PixiJS canvas**: 1280×1024px, dark background (0x1a1a1a)
- **Layers** (back→front): floor tiles → desks → agent bodies → bubbles → boss → furniture → whiteboard/clock → elevator → debug overlays
- **Animation**: Single RAF loop at 200px/sec, bubble timers (3s), position interpolation along A* paths

### State Architecture
- **gameStore** (Zustand): agents Map, boss state, office state, queues, whiteboard, conversation, debug flags
- **preferencesStore** (Zustand): clock type/format, auto-follow sessions, persisted to backend API
- **AgentMachineService** (XState): Per-agent state machines managing arrival/departure lifecycle

### Agent Lifecycle (XState)
```
spawn → arriving → in_arrival_queue → walking_to_ready → conversing →
walking_to_boss → at_boss → walking_to_desk → idle (working)
→ departing → in_departure_queue → walking_to_ready → conversing →
walking_to_boss → at_boss → walking_to_elevator → in_elevator → removed
```

### Layout
- **Desktop**: Left sidebar (sessions + git) | Canvas | Right sidebar (agents + events/conversation)
- **Mobile**: Hamburger menu + compact agent activity panel
- **Both sidebars**: Drag-to-resize (horizontal and vertical)

### Office Layout
- 4 columns × N rows of desks starting at (256, 408), spacing 256×192
- Arrival queue: L-shape left of boss (8 slots)
- Departure queue: L-shape right of boss (8 slots)
- Elevator: top-left with 2×3 spawn grid
- Boss: fixed at (640, 900) with desk furniture

### Whiteboard Modes (11)
0=TodoList, 1=RemoteWorkers, 2=ToolPizza, 3=OrgChart, 4=Stonks, 5=Weather, 6=SafetyBoard, 7=Timeline, 8=NewsTicker, 9=Coffee, 10=HeatMap

---

## Hooks Summary

### Design Principles
1. **Never block Claude** — always exit 0, suppress stdout/stderr before any code runs
2. **Silent failures** — all errors logged to file, never displayed
3. **Zero dependencies** — stdlib only (json, urllib, pathlib, xml.etree)
4. **0.5s timeout** — HTTP POST to backend, fail silently

### Event Mapping (11 hook types → backend events)

| Hook | Backend Event | Special Logic |
|------|--------------|---------------|
| SessionStart | session_start | Extracts `source` |
| SessionEnd | session_end | Extracts `reason` |
| PreToolUse | pre_tool_use OR **subagent_start** | Remaps if tool_name is Task/Agent |
| PostToolUse | post_tool_use OR **subagent_stop** | Remaps if Task/Agent (sync only) |
| UserPromptSubmit | user_prompt_submit OR **background_task_notification** | Detects XML task-notification |
| Stop | stop | Uses transcript_path for response extraction |
| SubagentStart | **subagent_info** | Remaps; skips if no agent_id |
| SubagentStop | subagent_stop | Skips if no agent_id |
| PermissionRequest | permission_request | Extracts tool details |
| Notification | notification | Extracts type + message |
| PreCompact | **context_compaction** | Remaps event type |

### Session Identification
- Project name: derived from `transcript_path` (`~/.claude/projects/{PROJECT}/{SESSION}.jsonl`)
- Strip prefixes: configurable via `~/.claude/claude-office-config.env`
- Session ID: `raw_data.session_id` → `CLAUDE_SESSION_ID` env → "unknown_session"

---

## Extension Points for Panoptica Multi-Room/Floor

### Backend (10 points)
1. **StateMachine per room** — `sessions[session_id]` → `sessions[session_id][room_id]`
2. **EventData room/floor fields** — Add `room_id`, `floor_id` to event data model
3. **Hierarchical state** — RoomState, FloorState wrappers around GameState
4. **Room-aware DB** — Add room_map JSON to SessionRecord
5. **Scoped broadcasts** — Filter WebSocket by room/floor subscription
6. **Agent room field** — Add room_id to Agent model
7. **Room-scoped tasks** — TodoItem with room context
8. **Per-floor whiteboard** — WhiteboardTracker scoped per room
9. **Hierarchical WS messages** — sessionId + roomId + floorId
10. **Multi-repo git** — GitService tracking multiple repositories

### Frontend (10 points)
1. **Room navigation UI** — Floor tabs or room selector in header
2. **Canvas switching** — Render room-specific OfficeGame per current room
3. **Store expansion** — `roomStates: Map<string, RoomState>` + `currentRoom`
4. **Room-specific queues** — Queue positions per room layout
5. **Agent room assignment** — Filter visible agents by currentRoom
6. **WebSocket room filtering** — Ignore state updates for non-visible rooms
7. **Layout room tabs** — Room tabs in sidebars
8. **Per-room sprites** — Room-specific texture sets
9. **Room-specific pathfinding** — Obstacle maps per room
10. **Animation room context** — Queue advancement only for visible room

### Hooks (5 points)
1. **Room ID from cwd** — Derive room from git root / working directory
2. **Subagent room isolation** — Route subagents based on task description keywords
3. **Tool-based room routing** — Extract room hints from file paths in tool_input
4. **Config-based repo→room map** — `CLAUDE_OFFICE_REPO_ROOMS` env var
5. **Per-hook room override** — `CLAUDE_OFFICE_ROOM` env var

---

## Key Findings

### Strengths
- Clean handler separation — easy to extend per event type
- Event replay via DB — sessions can be restored from stored events
- Deterministic agent lifecycle via XState — predictable animation behavior
- Single RAF loop — efficient animation, no per-agent timers
- Zero-dependency hooks — minimal failure surface
- Comprehensive whiteboard system — 11 modes with real-time data

### Bottlenecks for Panoptica
- **Single StateMachine per session** — needs per-room nesting
- **Flat GameState payload** — broadcasts full state, needs hierarchical structure
- **Monolithic WebSocket broadcast** — sends to all clients, needs room filtering
- **Single git_service** — tracks one repo at a time
- **8-agent hard limit** — desk count in office_layout.py
- **Fixed canvas layout** — positions hardcoded in constants/positions.ts
- **Project name from transcript_path** — no native room/floor concept in hooks

### Phase 2 Prerequisites
1. Add `room_id` / `floor_id` to EventData model and hook mapper
2. Create ProductMapper service (cwd → floor + room resolution)
3. Implement hierarchical GameState (Building → Floor → Room)
4. Add room-aware WebSocket subscription
5. Design building view canvas with floor navigation
