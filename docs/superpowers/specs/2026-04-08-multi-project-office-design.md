# Multi-Project Office + Task Orchestration Design Spec

> Date: 2026-04-08

## Goal

Merge the best of Claude Office (rich visualization, animations, whiteboard, AI summaries) with Pixel Agents Standalone (multi-project awareness, folder tracking) and Agent Orchestrator (task dispatch, multi-repo orchestration) into a unified tool.

## User Requirements

1. Each project/workspace gets its own **room** in the office
2. Support 4-6 concurrent projects
3. **Thumbnail overview** to see all rooms at a glance, click to zoom into a room
4. Each agent shows which project it belongs to
5. **"All in one" mode preserved** — can switch back to a single big room with all agents merged (existing All Sessions feature)
6. **Each room is a complete mini-office** — has its own clock, water cooler, whiteboard, safety sign, city window, etc.
7. Future: input tasks via UI, dispatched to agents via Agent Orchestrator

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                     │
│                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Room:    │  │ Room:    │  │ Room:    │  ... (4-6)     │
│  │ proj-A   │  │ proj-B   │  │ proj-C   │               │
│  │ [agents] │  │ [agents] │  │ [agents] │               │
│  └──────────┘  └──────────┘  └──────────┘               │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Overview Bar (thumbnails)                │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌──────────────┐  ┌──────────────────────────────────┐  │
│  │ Sidebar:     │  │ Task Panel (future):             │  │
│  │ Projects     │  │ - Create task                    │  │
│  │ Sessions     │  │ - Assign to project              │  │
│  │ Git Status   │  │ - Agent Orchestrator dispatch    │  │
│  └──────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                    WebSocket /ws/all
                           │
┌─────────────────────────────────────────────────────────┐
│                   Backend (FastAPI)                       │
│                                                           │
│  EventProcessor                                           │
│  ├─ sessions: dict[session_id → StateMachine]            │
│  ├─ projects: dict[project_key → ProjectState]  (NEW)    │
│  │   └─ ProjectState: { name, root, sessions[], color }  │
│  ├─ get_merged_state() → grouped by project              │
│  └─ get_project_state(key) → single project              │
│                                                           │
│  Agent Orchestrator Bridge (future)                       │
│  ├─ Poll AO /api/sessions via SSE                        │
│  ├─ Spawn tasks: POST /api/spawn                         │
│  └─ Sync session status ↔ office visualization           │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 1: Multi-Project Rooms (可视化 + 项目归属)

### 1.1 Backend: Project Registry

**New file**: `backend/app/core/project_registry.py`

```python
@dataclass
class ProjectState:
    key: str              # Normalized project key (e.g., "startups-mono")
    name: str             # Display name (e.g., "startups-mono")
    root: str | None      # Git root path
    color: str            # Assigned color from palette
    session_ids: list[str]  # All sessions in this project

class ProjectRegistry:
    projects: dict[str, ProjectState]
    
    def register_session(self, session_id: str, project_name: str, project_root: str | None)
    def unregister_session(self, session_id: str)
    def get_project_for_session(self, session_id: str) -> ProjectState | None
    def get_all_projects(self) -> list[ProjectState]
```

**Integration**: EventProcessor creates/updates ProjectState when sessions start. Project key derived from `project_name` (normalized, deduplicated).

### 1.2 Backend: Project-Grouped Merged State

**Modify**: `event_processor.py` — `get_merged_state()`

Current: flat list of all agents from all sessions.
New: agents grouped by project, each project with metadata.

```python
class ProjectGroup(BaseModel):
    key: str
    name: str
    color: str
    root: str | None
    agents: list[Agent]
    boss: Boss  # This project's "lead" (main session boss)
    session_count: int
    
class MultiProjectGameState(BaseModel):
    session_id: str = "__all__"
    projects: list[ProjectGroup]
    office: OfficeState
    last_updated: datetime
```

### 1.3 Backend: New API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/projects` | List all projects with session counts |
| `GET /api/v1/projects/{key}` | Single project state |
| `GET /api/v1/projects/{key}/sessions` | Sessions for a project |

### 1.4 Frontend: Room Layout System

**New concept**: Each project is a **Room** — a complete mini-office with all office furniture, desks, agents, and its own boss.

**Each room contains** (scaled-down version of the current single-office layout):
- Wall + floor tiles + project name signage
- Boss desk (the main session's Claude agent for that project)
- Agent desks (2x2 or 2x4 grid depending on agent count)
- Clock (showing current time)
- Water cooler
- Whiteboard (showing that project's TODO/metrics)
- Safety sign (tool uses counter for that project)
- City window (shared day/night cycle)
- Elevator (agents arrive/depart per room)
- Employee of the Month frame

**Room sizing**:
- Standard room: ~640x512px (half the current 1280x1024 canvas)
- Each room is essentially a scaled-down complete office
- Scales up if a project has many agents (add desk rows)

**Canvas layout** (for 4-6 projects):
```
┌──────────────────────┬──────────────────────┐
│   ┌─proj-A─────────┐ │ ┌─proj-B─────────┐  │
│   │🕐 🖼️ 📋 ⚠️    │ │ │🕐 🖼️ 📋 ⚠️    │  │
│   │ [desk][desk]   │ │ │ [desk][desk]   │  │
│   │ [desk][desk]   │ │ │ [desk][desk]   │  │
│   │    [boss]      │ │ │    [boss]      │  │
│   │ 🚰         🏙️  │ │ │ 🚰         🏙️  │  │
│   └────────────────┘ │ └────────────────┘  │
├──────────────────────┼──────────────────────┤
│   ┌─proj-C─────────┐ │ ┌─proj-D─────────┐  │
│   │🕐 🖼️ 📋 ⚠️    │ │ │🕐 🖼️ 📋 ⚠️    │  │
│   │ [desk][desk]   │ │ │ [desk][desk]   │  │
│   │    [boss]      │ │ │    [boss]      │  │
│   │ 🚰         🏙️  │ │ │ 🚰         🏙️  │  │
│   └────────────────┘ │ └────────────────┘  │
└──────────────────────┴──────────────────────┘
```

Grid: max 2 columns (rooms are wider than before), rows grow as needed.

### 1.4.1 View Modes

**Three view modes** (switchable via sidebar or hotkey):

| Mode | Description | When to use |
|------|-------------|-------------|
| **Overview** | All rooms visible as thumbnails, zoomed out | See which projects have active agents |
| **Room Detail** | Single room fills viewport, full animations | Focus on one project |
| **All Merged** | Single big room, all agents together (existing) | Quick glance at all activity |

The "All Sessions" sidebar entry switches to **All Merged** mode (existing behavior).
The "Projects" view in sidebar shows **Overview** mode with room grid.
Clicking a project or room zooms to **Room Detail** mode.

### 1.5 Frontend: Zoom Navigation

**Overview mode** (default, zoomed out):
- All rooms visible as thumbnails (~150x100px each)
- Room labels prominent, agent count badge
- Active rooms pulse/glow
- Click a room → smooth zoom transition to detail view

**Detail mode** (zoomed in):
- Single room fills the viewport
- Full agent animations, bubbles, desk accessories
- Breadcrumb: "All Projects > Project A" — click to zoom back out
- Arrow keys or swipe to navigate between rooms

**Implementation**: Use existing `react-zoom-pan-pinch` but with programmatic zoom targets per room.

### 1.6 Frontend: Sidebar Changes

**Left sidebar** (modified):
```
PROJECTS (4)
├─ ▶ startups-mono (3 sessions, 5 agents) 🟢
│   ├─ session abc123 (2 agents)
│   ├─ session def456 (2 agents)
│   └─ session ghi789 (1 agent)
├─ ▶ workstream (1 session, 2 agents) 🔵
├─ ▶ claude-office (1 session, 1 agent) 🟣
└─ ▶ random (2 sessions, 3 agents) 🟠

GIT STATUS
[selected project's git info]
```

- Collapsible project groups
- Click project → zoom to that room
- Click session → zoom to room + highlight agent

### 1.7 Agent Model Changes

**Backend** — Add to Agent model:
```python
class Agent(BaseModel):
    # ... existing fields ...
    project_key: str | None = None   # NEW: which project this agent belongs to
    session_id: str | None = None    # NEW: which session spawned this agent
```

**Frontend** — Agent label shows project badge:
```
[🟢 startups] Finder Fred
```

### 1.8 Project Color Assignment

8-color palette (same as agent colors), assigned to projects in order:
```python
PROJECT_COLORS = [
    "#3B82F6",  # Blue
    "#22C55E",  # Green
    "#A855F7",  # Purple
    "#F97316",  # Orange
    "#EC4899",  # Pink
    "#06B6D4",  # Cyan
    "#EAB308",  # Yellow
    "#EF4444",  # Red
]
```

Room border and agent labels use the project's assigned color.

---

## Phase 2: Agent Orchestrator Integration (任务调度)

### 2.1 Prerequisites

- Install Agent Orchestrator: `npm i -g @composio/ao`
- Configure `agent-orchestrator.yaml` with multiple projects
- AO runs on its own port (default :3000, configurable)

### 2.2 Backend: AO Bridge Service

**New file**: `backend/app/services/ao_bridge.py`

```python
class AOBridge:
    """Bridge between Claude Office and Agent Orchestrator."""
    
    ao_url: str  # e.g., "http://localhost:4000"
    
    async def get_sessions(self) -> list[AOSession]
    async def get_projects(self) -> list[AOProject]
    async def spawn_task(self, project_id: str, issue: str) -> AOSession
    async def send_message(self, session_id: str, message: str) -> None
    async def kill_session(self, session_id: str) -> None
    async def subscribe_events(self) -> AsyncIterator[AOEvent]
        # SSE client for /api/events
```

### 2.3 Frontend: Task Panel

**New component** in right sidebar tab: "TASKS"

```
TASKS
├─ [+ New Task]
│
├─ startups-mono
│   ├─ 🟢 Fix login bug (#123) — agent working
│   ├─ 🟡 Add dark mode (#124) — PR open, CI passing
│   └─ ⚪ Refactor auth (#125) — queued
│
├─ workstream
│   └─ 🟢 Update API docs (#45) — agent working
│
└─ [Spawn from backlog]
```

**New Task flow**:
1. Click "+ New Task"
2. Select project (dropdown of configured AO projects)
3. Enter issue number or description
4. Click "Spawn" → POST to AO `/api/spawn`
5. AO creates session → Claude Code starts in worktree
6. Claude Office detects new session via hooks → agent appears in room

### 2.4 Task Lifecycle Visualization

AO session status mapped to office animations:

| AO Status | Office Visualization |
|-----------|---------------------|
| spawning | Agent walks from elevator to room |
| working | Agent typing at desk |
| pr_open | Agent shows PR badge on desk |
| ci_failed | Desk flashes red, agent shows error bubble |
| review_pending | Agent shows review icon |
| changes_requested | Agent gets new bubble with review comments |
| approved | Agent shows green checkmark |
| merged | Agent does celebration animation, then departs |

### 2.5 Multi-Repo Configuration

AO's `agent-orchestrator.yaml` maps to Claude Office rooms:

```yaml
# agent-orchestrator.yaml
projects:
  startups-mono:
    repo: org/startups-mono
    path: ~/Projects/others/startups/startups-mono
    
  workstream:
    repo: org/workstream
    path: ~/Projects/workstream/repos/workstream-workerhub
```

Claude Office reads this config to:
1. Pre-create rooms for each AO project
2. Map AO sessions to the correct room
3. Show AO-specific UI (spawn button, PR status) per room

---

## Implementation Order

### Phase 1 (可视化 + 项目归属) — 12 tasks

1. Backend: ProjectRegistry + project color assignment
2. Backend: TranscriptWatcher — scan ~/.claude/projects/ as fallback discovery (from Pixel Agents)
3. Backend: Smart project name extraction from paths (enhanced from Pixel Agents)
4. Backend: Project-grouped merged state (new endpoint /ws/projects)
5. Backend: /api/v1/projects endpoints
6. Backend: Agent seat persistence in SQLite (from Pixel Agents)
7. Frontend: Extract reusable `MiniOffice` component from current `OfficeGame`
   - MiniOffice takes: agents[], boss, deskCount, projectName, color, size
   - Contains: walls, floor, desks, clock, whiteboard, safety sign, water cooler, city window, elevator, employee of month
   - Scalable: renders at any size (full or thumbnail)
8. Frontend: `ProjectRoomGrid` component — renders multiple MiniOffice instances in a grid
9. Frontend: View mode switcher (Overview / Room Detail / All Merged)
10. Frontend: Overview zoom navigation (programmatic zoom to room)
11. Frontend: Sidebar project tree (collapsible groups, click → zoom)
12. Frontend: Agent project badge + room border coloring + seat restore

### Phase 2 (任务调度) — 6 tasks

1. Install + configure Agent Orchestrator
2. Backend: AOBridge service (SSE client + REST calls)
3. Backend: Task API endpoints (proxy to AO)
4. Frontend: Task panel component
5. Frontend: AO status → office animation mapping
6. Integration test + commit

---

## Borrowed from Pixel Agents Standalone

以下特性从 pixel-agents-standalone 借鉴，整合到 Claude Office 中：

### B1. Transcript 直读作为备用发现机制

**问题**：Claude Office 完全依赖 hooks POST 事件。如果 hook 没装好、丢事件或者是 Cursor 等第三方工具的 Claude session，后端看不到。

**Pixel Agents 做法**：`server/watcher.ts` 直接监听 `~/.claude/projects/` 下所有 `.jsonl` 文件，不依赖任何 hook 配置。

**借鉴方案**：新增 `TranscriptWatcher` 作为**补充发现机制**：
- Hooks 仍然是主要的事件源（实时、低延迟）
- TranscriptWatcher 每 5 秒扫描 `~/.claude/projects/`，发现 hooks 没上报的 session
- 对于这些"孤儿 session"，从 JSONL 解析基本状态（工具调用、idle、权限等待）
- 好处：Cursor 的 Claude session、没装 hook 的 Claude Code 都能被检测到

```python
# backend/app/core/transcript_watcher.py (NEW)
class TranscriptWatcher:
    """Watches ~/.claude/projects/ for session JSONL files.
    Supplements hooks by discovering sessions that don't send hook events."""
    
    scan_interval: float = 5.0  # seconds
    active_threshold: float = 600.0  # 10 minutes
    
    async def scan(self) -> list[DiscoveredSession]:
        # Walk ~/.claude/projects/*/**.jsonl
        # Filter by mtime within active_threshold
        # Extract project_name from directory path
        # Return sessions not already tracked by EventProcessor
    
    async def parse_basic_state(self, jsonl_path: str) -> BasicAgentState:
        # Read last N lines of JSONL
        # Detect: tool_use (typing), idle, permission_request
        # Return simplified state for visualization
```

### B2. 项目名从路径提取（增强）

**Pixel Agents 做法**：`basename(dirname(filePath)).split("-").filter(Boolean)` 取最后一段。

**增强方案**：更智能的项目名提取：
```python
def extract_project_name(transcript_path: str) -> str:
    # ~/.claude/projects/-Users-apple-Projects-others-startups-startups-mono-abc123/session.jsonl
    # → dir name: "-Users-apple-Projects-others-startups-startups-mono-abc123"
    # → strip hash suffix (last segment if looks like hex)
    # → take last 2 meaningful segments: "startups-mono"
    # → or match against known git roots from ProjectRegistry
```

### B3. Agent 座位持久化

**Pixel Agents 做法**：`~/.pixel-agents/agent-seats.json` 保存每个 agent 的 palette、hueShift、seatId。

**借鉴方案**：在 SQLite 中新增 `agent_seat_preferences` 表：
```python
class AgentSeatPreference(Base):
    session_id: str       # Which session
    agent_id: str         # Agent identifier
    desk: int             # Preferred desk number
    color: str            # Assigned color
    room_key: str         # Which project room
```
Agent 重连后保持同一个座位和颜色，不会每次随机分配。

### B4. 布局编辑器（Phase 3，未来）

**Pixel Agents 做法**：用户可在浏览器中拖拽家具、改地板颜色、自定义办公室布局。

**未来方案**：允许用户自定义每个房间的布局（家具位置、地板样式）。非 Phase 1/2 优先级。

## Tech Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Room layout | CSS Grid on PixiJS canvas | Flexible, scales with project count |
| Zoom | react-zoom-pan-pinch (existing) | Already integrated, add programmatic targets |
| AO communication | HTTP REST + SSE | AO's native interface, no custom bridge needed |
| Project discovery | Hooks (primary) + TranscriptWatcher (fallback) | Hooks for real-time; watcher catches Cursor/unhook'd sessions |
| Room sizing | Dynamic based on agent count | Avoids wasted space for small projects |
| State structure | Grouped by project | Frontend can render rooms independently |
| Seat persistence | SQLite table | Agents keep same desk/color across reconnects |

## Non-Goals (for now)

- Room furniture editing (use fixed layout per room)
- Inter-project agent migration
- Custom room themes per project
- Real-time collaboration (multi-user viewing)
- Per-room custom whiteboard mode (all rooms show same mode, synced)
