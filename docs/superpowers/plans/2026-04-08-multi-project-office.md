# Multi-Project Office Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-project room support to Claude Office so each project gets its own mini-office with independent agents, boss, and furniture, viewable in overview grid or zoomed detail.

**Architecture:** Backend adds a ProjectRegistry that groups sessions by project. A new `MultiProjectGameState` model replaces the flat merged state with project-grouped data. Frontend extracts a reusable `MiniOffice` component from the current `OfficeGame`, renders them in a grid via `ProjectRoomGrid`, and adds zoom navigation between overview/detail/merged views.

**Tech Stack:** Python/FastAPI (backend), React/PixiJS/Zustand (frontend), SQLite (persistence), react-zoom-pan-pinch (zoom), WebSocket (real-time state)

---

## File Structure

### Backend (new files)
| File | Responsibility |
|------|---------------|
| `backend/app/core/project_registry.py` | ProjectRegistry class: tracks projects, assigns colors, maps sessions to projects |
| `backend/app/core/transcript_watcher.py` | TranscriptWatcher: scans `~/.claude/projects/` for session JSONL files not tracked by hooks |
| `backend/app/models/projects.py` | ProjectGroup, MultiProjectGameState Pydantic models |
| `backend/app/api/routes/projects.py` | REST endpoints: GET /projects, GET /projects/{key}, GET /projects/{key}/sessions |

### Backend (modified files)
| File | Changes |
|------|---------|
| `backend/app/models/agents.py:49-64` | Add `project_key` and `session_id` fields to Agent |
| `backend/app/core/event_processor.py:92-110` | Add ProjectRegistry instance, wire into session lifecycle |
| `backend/app/core/event_processor.py:198-290` | New `get_project_grouped_state()` method |
| `backend/app/core/handlers/session_handler.py` | Register/unregister sessions with ProjectRegistry |
| `backend/app/db/models.py` | Add `AgentSeatPreference` table |
| `backend/app/main.py:82-100` | Add `/ws/projects` WebSocket endpoint |
| `backend/app/main.py:13` | Register projects router |
| `backend/app/api/websocket.py` | Add project-grouped broadcast support |

### Frontend (new files)
| File | Responsibility |
|------|---------------|
| `frontend/src/types/projects.ts` | TypeScript types for ProjectGroup, MultiProjectGameState, ViewMode |
| `frontend/src/stores/projectStore.ts` | Zustand store for multi-project state, view mode, active room |
| `frontend/src/components/game/MiniOffice.tsx` | Reusable scaled-down office: walls, floor, desks, furniture, agents, boss |
| `frontend/src/components/game/ProjectRoomGrid.tsx` | Grid layout of MiniOffice instances |
| `frontend/src/components/game/RoomBorder.tsx` | Colored border + project label for each room |
| `frontend/src/components/layout/ProjectSidebar.tsx` | Collapsible project tree in sidebar |
| `frontend/src/hooks/useProjectWebSocket.ts` | WebSocket hook for `/ws/projects` endpoint |
| `frontend/src/constants/rooms.ts` | Room sizing, grid layout constants |

### Frontend (modified files)
| File | Changes |
|------|---------|
| `frontend/src/components/game/OfficeGame.tsx` | Delegate to MiniOffice in single-room mode; integrate with ProjectRoomGrid in overview mode |
| `frontend/src/components/layout/SessionSidebar.tsx` | Add project grouping, click-to-zoom |
| `frontend/src/stores/gameStore.ts` | Add viewMode state, project selection |
| `frontend/src/types/index.ts` | Export new project types |

---

## Task 1: Backend — ProjectRegistry + Color Assignment

**Files:**
- Create: `backend/app/core/project_registry.py`
- Create: `backend/tests/core/test_project_registry.py`

- [ ] **Step 1: Write failing tests for ProjectRegistry**

```python
# backend/tests/core/test_project_registry.py
import pytest
from app.core.project_registry import ProjectRegistry

PROJECT_COLORS = [
    "#3B82F6", "#22C55E", "#A855F7", "#F97316",
    "#EC4899", "#06B6D4", "#EAB308", "#EF4444",
]


def test_register_session_creates_project():
    registry = ProjectRegistry()
    registry.register_session("sess-1", "my-project", "/home/user/my-project")
    project = registry.get_project_for_session("sess-1")
    assert project is not None
    assert project.name == "my-project"
    assert project.key == "my-project"
    assert project.root == "/home/user/my-project"
    assert "sess-1" in project.session_ids
    assert project.color == PROJECT_COLORS[0]


def test_register_multiple_sessions_same_project():
    registry = ProjectRegistry()
    registry.register_session("sess-1", "proj-a", "/path/a")
    registry.register_session("sess-2", "proj-a", "/path/a")
    projects = registry.get_all_projects()
    assert len(projects) == 1
    assert len(projects[0].session_ids) == 2


def test_register_different_projects_get_different_colors():
    registry = ProjectRegistry()
    registry.register_session("s1", "proj-a", "/a")
    registry.register_session("s2", "proj-b", "/b")
    registry.register_session("s3", "proj-c", "/c")
    projects = registry.get_all_projects()
    colors = [p.color for p in projects]
    assert len(set(colors)) == 3


def test_unregister_session():
    registry = ProjectRegistry()
    registry.register_session("s1", "proj-a", "/a")
    registry.register_session("s2", "proj-a", "/a")
    registry.unregister_session("s1")
    project = registry.get_project_for_session("s2")
    assert project is not None
    assert "s1" not in project.session_ids


def test_unregister_last_session_removes_project():
    registry = ProjectRegistry()
    registry.register_session("s1", "proj-a", "/a")
    registry.unregister_session("s1")
    assert registry.get_all_projects() == []


def test_normalize_project_key():
    registry = ProjectRegistry()
    registry.register_session("s1", "My Project!", "/a")
    project = registry.get_project_for_session("s1")
    assert project is not None
    assert project.key == "my-project"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/core/test_project_registry.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.project_registry'`

- [ ] **Step 3: Implement ProjectRegistry**

```python
# backend/app/core/project_registry.py
"""Project registry: groups sessions by project with color assignment."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

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


def normalize_project_key(name: str) -> str:
    """Normalize a project name to a URL-safe key."""
    key = name.lower().strip()
    key = re.sub(r"[^a-z0-9\-]", "-", key)
    key = re.sub(r"-+", "-", key).strip("-")
    return key or "unknown"


@dataclass
class ProjectState:
    """In-memory state for a single project."""

    key: str
    name: str
    root: str | None
    color: str
    session_ids: list[str] = field(default_factory=list)


class ProjectRegistry:
    """Maps sessions to projects with automatic color assignment."""

    def __init__(self) -> None:
        self._projects: dict[str, ProjectState] = {}  # key -> ProjectState
        self._session_to_project: dict[str, str] = {}  # session_id -> project key
        self._color_index: int = 0

    def register_session(
        self, session_id: str, project_name: str, project_root: str | None
    ) -> ProjectState:
        """Register a session under a project. Creates the project if new."""
        key = normalize_project_key(project_name)

        if key not in self._projects:
            color = PROJECT_COLORS[self._color_index % len(PROJECT_COLORS)]
            self._color_index += 1
            self._projects[key] = ProjectState(
                key=key, name=project_name, root=project_root, color=color
            )
            logger.info(f"New project registered: {key} (color={color})")

        project = self._projects[key]
        if session_id not in project.session_ids:
            project.session_ids.append(session_id)
        self._session_to_project[session_id] = key
        return project

    def unregister_session(self, session_id: str) -> None:
        """Remove a session. If it was the last session, remove the project."""
        key = self._session_to_project.pop(session_id, None)
        if key and key in self._projects:
            project = self._projects[key]
            if session_id in project.session_ids:
                project.session_ids.remove(session_id)
            if not project.session_ids:
                del self._projects[key]
                logger.info(f"Project removed (no sessions left): {key}")

    def get_project_for_session(self, session_id: str) -> ProjectState | None:
        """Get the project a session belongs to."""
        key = self._session_to_project.get(session_id)
        return self._projects.get(key) if key else None

    def get_all_projects(self) -> list[ProjectState]:
        """Get all active projects."""
        return list(self._projects.values())

    def get_project(self, key: str) -> ProjectState | None:
        """Get a specific project by key."""
        return self._projects.get(key)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/core/test_project_registry.py -v`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/project_registry.py backend/tests/core/test_project_registry.py
git commit -m "feat: add ProjectRegistry for multi-project session grouping"
```

---

## Task 2: Backend — Project Models (ProjectGroup, MultiProjectGameState)

**Files:**
- Create: `backend/app/models/projects.py`
- Modify: `backend/app/models/agents.py:49-64`
- Create: `backend/tests/models/test_projects.py`

- [ ] **Step 1: Write failing tests for project models**

```python
# backend/tests/models/test_projects.py
from datetime import UTC, datetime

from app.models.agents import Agent, AgentState, Boss, BossState, OfficeState
from app.models.projects import MultiProjectGameState, ProjectGroup


def test_project_group_creation():
    group = ProjectGroup(
        key="my-proj",
        name="My Project",
        color="#3B82F6",
        root="/path/to/proj",
        agents=[],
        boss=Boss(state=BossState.IDLE),
        session_count=1,
    )
    assert group.key == "my-proj"
    assert group.session_count == 1


def test_multi_project_game_state():
    state = MultiProjectGameState(
        projects=[
            ProjectGroup(
                key="a",
                name="A",
                color="#3B82F6",
                root="/a",
                agents=[],
                boss=Boss(state=BossState.IDLE),
                session_count=1,
            )
        ],
        office=OfficeState(),
        last_updated=datetime.now(UTC),
    )
    assert len(state.projects) == 1
    assert state.session_id == "__all__"


def test_agent_has_project_key():
    agent = Agent(
        id="a1",
        color="#fff",
        number=1,
        state=AgentState.WORKING,
        project_key="my-proj",
        session_id="sess-1",
    )
    assert agent.project_key == "my-proj"
    assert agent.session_id == "sess-1"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/models/test_projects.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Add project_key and session_id to Agent model**

In `backend/app/models/agents.py`, add two fields to the `Agent` class after `position`:

```python
    position: dict[str, int] = {"x": 0, "y": 0}
    project_key: str | None = None   # Which project this agent belongs to
    session_id: str | None = None    # Which session spawned this agent
```

- [ ] **Step 4: Create ProjectGroup and MultiProjectGameState models**

```python
# backend/app/models/projects.py
"""Models for multi-project office state."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.models.agents import Agent, Boss, OfficeState
from app.models.common import TodoItem


class ProjectGroup(BaseModel):
    """A project room containing agents from all sessions of that project."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    key: str
    name: str
    color: str
    root: str | None
    agents: list[Agent]
    boss: Boss
    session_count: int
    todos: list[TodoItem] = Field(default_factory=list)


class MultiProjectGameState(BaseModel):
    """Complete state grouped by project for the multi-room view."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str = "__all__"
    projects: list[ProjectGroup]
    office: OfficeState
    last_updated: datetime
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/models/test_projects.py -v`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/projects.py backend/app/models/agents.py backend/tests/models/test_projects.py
git commit -m "feat: add ProjectGroup and MultiProjectGameState models"
```

---

## Task 3: Backend — Wire ProjectRegistry into EventProcessor

**Files:**
- Modify: `backend/app/core/event_processor.py:104-110`
- Modify: `backend/app/core/handlers/session_handler.py`
- Create: `backend/tests/core/test_event_processor_projects.py`

- [ ] **Step 1: Write failing test for project registration on session start**

```python
# backend/tests/core/test_event_processor_projects.py
import pytest
from unittest.mock import AsyncMock, patch

from app.core.event_processor import event_processor


@pytest.fixture(autouse=True)
def clean_processor():
    """Reset event_processor state between tests."""
    event_processor.sessions.clear()
    event_processor.project_registry._projects.clear()
    event_processor.project_registry._session_to_project.clear()
    yield
    event_processor.sessions.clear()


def test_event_processor_has_project_registry():
    from app.core.project_registry import ProjectRegistry
    assert isinstance(event_processor.project_registry, ProjectRegistry)


@pytest.mark.asyncio
async def test_session_start_registers_project():
    """When a session starts, it should be registered with the ProjectRegistry."""
    from app.models.events import Event, EventData, EventType

    event = Event(
        session_id="test-sess-1",
        event_type=EventType.SESSION_START,
        timestamp="2026-04-08T10:00:00Z",
        data=EventData(
            session_id="test-sess-1",
            project_name="my-project",
            working_directory="/home/user/my-project",
        ),
    )

    with patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock):
        with patch("app.core.handlers.session_handler.broadcast_event", new_callable=AsyncMock):
            await event_processor.process_event(event.model_dump())

    project = event_processor.project_registry.get_project_for_session("test-sess-1")
    assert project is not None
    assert project.name == "my-project"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/core/test_event_processor_projects.py -v`
Expected: FAIL — `AttributeError: 'EventProcessor' object has no attribute 'project_registry'`

- [ ] **Step 3: Add ProjectRegistry to EventProcessor.__init__**

In `backend/app/core/event_processor.py`, add import and init:

```python
# Add to imports (after existing imports around line 20):
from app.core.project_registry import ProjectRegistry

# In __init__ (after line 110):
        self.project_registry = ProjectRegistry()
```

- [ ] **Step 4: Register sessions with ProjectRegistry in session_handler**

In `backend/app/core/handlers/session_handler.py`, at the end of `handle_session_start()`, add:

```python
    # Register with project registry
    from app.core.event_processor import event_processor
    project_name = event.data.project_name or "unknown"
    project_root = derive_git_root(event.data.working_directory or "") if event.data.working_directory else None
    event_processor.project_registry.register_session(event.session_id, project_name, project_root)
```

In `handle_session_end()`, add:

```python
    event_processor.project_registry.unregister_session(event.session_id)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/core/test_event_processor_projects.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/event_processor.py backend/app/core/handlers/session_handler.py backend/tests/core/test_event_processor_projects.py
git commit -m "feat: wire ProjectRegistry into EventProcessor and session lifecycle"
```

---

## Task 4: Backend — get_project_grouped_state() Method

**Files:**
- Modify: `backend/app/core/event_processor.py`
- Create: `backend/tests/core/test_project_grouped_state.py`

- [ ] **Step 1: Write failing test for project-grouped state**

```python
# backend/tests/core/test_project_grouped_state.py
import pytest
from datetime import UTC, datetime

from app.core.event_processor import event_processor
from app.core.state_machine import StateMachine
from app.models.agents import AgentState, BossState


@pytest.fixture(autouse=True)
def clean_processor():
    event_processor.sessions.clear()
    event_processor.project_registry._projects.clear()
    event_processor.project_registry._session_to_project.clear()
    yield
    event_processor.sessions.clear()


@pytest.mark.asyncio
async def test_project_grouped_state_empty():
    result = await event_processor.get_project_grouped_state()
    assert result is None


@pytest.mark.asyncio
async def test_project_grouped_state_single_project():
    sm = StateMachine()
    sm.boss.state = BossState.WORKING
    event_processor.sessions["sess-1"] = sm
    event_processor.project_registry.register_session("sess-1", "proj-a", "/a")

    result = await event_processor.get_project_grouped_state()
    assert result is not None
    assert len(result.projects) == 1
    assert result.projects[0].key == "proj-a"
    assert result.projects[0].session_count == 1


@pytest.mark.asyncio
async def test_project_grouped_state_multiple_projects():
    sm1 = StateMachine()
    sm2 = StateMachine()
    event_processor.sessions["s1"] = sm1
    event_processor.sessions["s2"] = sm2
    event_processor.project_registry.register_session("s1", "proj-a", "/a")
    event_processor.project_registry.register_session("s2", "proj-b", "/b")

    result = await event_processor.get_project_grouped_state()
    assert result is not None
    assert len(result.projects) == 2
    keys = {p.key for p in result.projects}
    assert keys == {"proj-a", "proj-b"}


@pytest.mark.asyncio
async def test_project_grouped_agents_have_project_key():
    sm = StateMachine()
    sm.add_agent("agent-1", "Finder Fred")
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session("s1", "proj-a", "/a")

    result = await event_processor.get_project_grouped_state()
    assert result is not None
    for agent in result.projects[0].agents:
        assert agent.project_key == "proj-a"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/core/test_project_grouped_state.py -v`
Expected: FAIL — `AttributeError: 'EventProcessor' object has no attribute 'get_project_grouped_state'`

- [ ] **Step 3: Implement get_project_grouped_state()**

Add this method to `EventProcessor` in `backend/app/core/event_processor.py` (after `get_merged_state()`):

```python
    async def get_project_grouped_state(self) -> "MultiProjectGameState | None":
        """Build a MultiProjectGameState grouped by project."""
        from app.models.projects import MultiProjectGameState, ProjectGroup

        if not self.sessions:
            return None

        # Group sessions by project
        project_sessions: dict[str, list[tuple[str, StateMachine]]] = {}
        for session_id, sm in self.sessions.items():
            project = self.project_registry.get_project_for_session(session_id)
            key = project.key if project else "unknown"
            if key not in project_sessions:
                project_sessions[key] = []
            project_sessions[key].append((session_id, sm))

        groups: list[ProjectGroup] = []
        latest_updated: datetime | None = None

        for key, sessions in project_sessions.items():
            project = self.project_registry.get_project(key)
            if not project:
                continue

            all_agents: list[Agent] = []
            desk_num = 1
            group_boss = Boss(state=BossState.IDLE)
            all_todos: list[TodoItem] = []

            for session_id, sm in sessions:
                state = sm.to_game_state(session_id)

                # First session's boss becomes the room boss
                if group_boss.state == BossState.IDLE and state.boss.state != BossState.IDLE:
                    group_boss = state.boss

                # Add agents with project_key set
                for agent in state.agents:
                    updated = agent.model_copy(update={
                        "project_key": key,
                        "session_id": session_id,
                        "desk": desk_num,
                        "number": desk_num,
                    })
                    all_agents.append(updated)
                    desk_num += 1

                all_todos.extend(state.todos)

                if latest_updated is None or state.last_updated > latest_updated:
                    latest_updated = state.last_updated

            groups.append(ProjectGroup(
                key=key,
                name=project.name,
                color=project.color,
                root=project.root,
                agents=all_agents,
                boss=group_boss,
                session_count=len(sessions),
                todos=all_todos,
            ))

        return MultiProjectGameState(
            projects=groups,
            office=OfficeState(),
            last_updated=latest_updated or datetime.now(UTC),
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/core/test_project_grouped_state.py -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/event_processor.py backend/tests/core/test_project_grouped_state.py
git commit -m "feat: add get_project_grouped_state() for multi-room data"
```

---

## Task 5: Backend — REST API Endpoints for Projects

**Files:**
- Create: `backend/app/api/routes/projects.py`
- Modify: `backend/app/main.py:13`
- Create: `backend/tests/api/test_projects_api.py`

- [ ] **Step 1: Write failing tests for project API endpoints**

```python
# backend/tests/api/test_projects_api.py
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.event_processor import event_processor
from app.core.state_machine import StateMachine
from app.main import app


@pytest.fixture(autouse=True)
def clean_processor():
    event_processor.sessions.clear()
    event_processor.project_registry._projects.clear()
    event_processor.project_registry._session_to_project.clear()
    yield
    event_processor.sessions.clear()


@pytest.mark.asyncio
async def test_list_projects_empty():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/projects")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_projects_with_data():
    sm = StateMachine()
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session("s1", "proj-a", "/a")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/projects")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["key"] == "proj-a"


@pytest.mark.asyncio
async def test_get_project_not_found():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/projects/nonexistent")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/api/test_projects_api.py -v`
Expected: FAIL — 404 (routes not registered)

- [ ] **Step 3: Create projects router**

```python
# backend/app/api/routes/projects.py
"""REST API endpoints for multi-project management."""

from fastapi import APIRouter, HTTPException

from app.core.event_processor import event_processor

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
async def list_projects():
    """List all active projects with session counts."""
    projects = event_processor.project_registry.get_all_projects()
    return [
        {
            "key": p.key,
            "name": p.name,
            "color": p.color,
            "root": p.root,
            "session_count": len(p.session_ids),
        }
        for p in projects
    ]


@router.get("/{key}")
async def get_project(key: str):
    """Get a single project's details."""
    project = event_processor.project_registry.get_project(key)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "key": project.key,
        "name": project.name,
        "color": project.color,
        "root": project.root,
        "session_ids": project.session_ids,
        "session_count": len(project.session_ids),
    }


@router.get("/{key}/sessions")
async def get_project_sessions(key: str):
    """Get all sessions for a project."""
    project = event_processor.project_registry.get_project(key)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"project_key": key, "session_ids": project.session_ids}
```

- [ ] **Step 4: Register the router in main.py**

In `backend/app/main.py`, add the import and include:

```python
# Add import (line 13 area):
from app.api.routes import events, preferences, projects, sessions

# In the router registration section (after existing includes):
app.include_router(projects.router, prefix=settings.API_V1_STR)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/api/test_projects_api.py -v`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/projects.py backend/app/main.py backend/tests/api/test_projects_api.py
git commit -m "feat: add REST API endpoints for project listing"
```

---

## Task 6: Backend — WebSocket /ws/projects Endpoint

**Files:**
- Modify: `backend/app/main.py:82-100`
- Modify: `backend/app/api/websocket.py`
- Modify: `backend/app/core/broadcast_service.py`

- [ ] **Step 1: Add project WebSocket connection tracking to ConnectionManager**

In `backend/app/api/websocket.py`, add alongside existing `all_session_connections`:

```python
    # In __init__:
    self.project_connections: list[WebSocket] = []

    # New methods:
    async def connect_projects(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.project_connections.append(websocket)

    def disconnect_projects(self, websocket: WebSocket) -> None:
        if websocket in self.project_connections:
            self.project_connections.remove(websocket)

    async def broadcast_to_project_subscribers(self, message: dict) -> None:
        for connection in self.project_connections[:]:
            try:
                await connection.send_json(message)
            except Exception:
                self.project_connections.remove(connection)
```

- [ ] **Step 2: Add /ws/projects endpoint in main.py**

In `backend/app/main.py`, add after the existing `/ws/all` endpoint:

```python
@app.websocket("/ws/projects")
async def websocket_projects(websocket: WebSocket):
    """WebSocket that sends project-grouped state from all active sessions."""
    await manager.connect_projects(websocket)

    project_state = await event_processor.get_project_grouped_state()
    if project_state:
        await manager.send_personal_message(
            {"type": "project_state", "data": project_state.model_dump(by_alias=True, mode="json")},
            websocket,
        )

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_projects(websocket)
```

- [ ] **Step 3: Add project broadcast to broadcast_service.py**

In `backend/app/core/broadcast_service.py`, add project broadcast to the `broadcast_state()` function (after the existing `all_session_connections` broadcast):

```python
    # Broadcast to project subscribers
    if manager.project_connections:
        from app.core.event_processor import event_processor

        project_state = await event_processor.get_project_grouped_state()
        if project_state:
            await manager.broadcast_to_project_subscribers(
                {"type": "project_state", "data": project_state.model_dump(by_alias=True, mode="json")}
            )
```

- [ ] **Step 4: Verify manually**

Run: `cd backend && make dev`
Then: `websocat ws://localhost:8000/ws/projects`
Expected: Connection established, receives `{"type": "project_state", ...}` when sessions are active

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/app/api/websocket.py backend/app/core/broadcast_service.py
git commit -m "feat: add /ws/projects WebSocket for project-grouped state"
```

---

## Task 7: Backend — TranscriptWatcher (Fallback Session Discovery)

**Files:**
- Create: `backend/app/core/transcript_watcher.py`
- Create: `backend/tests/core/test_transcript_watcher.py`

- [ ] **Step 1: Write failing tests for TranscriptWatcher**

```python
# backend/tests/core/test_transcript_watcher.py
import pytest
import tempfile
import json
import os
from pathlib import Path
from unittest.mock import patch

from app.core.transcript_watcher import TranscriptWatcher, extract_project_name


def test_extract_project_name_standard():
    path = "/Users/apple/.claude/projects/-Users-apple-Projects-others-startups-startups-mono-abc123/session.jsonl"
    assert extract_project_name(path) == "startups-mono"


def test_extract_project_name_short():
    path = "/Users/apple/.claude/projects/-Users-apple-myproject-def456/session.jsonl"
    assert extract_project_name(path) == "myproject"


def test_extract_project_name_single_segment():
    path = "/Users/apple/.claude/projects/-Users-apple-x-aaa111/session.jsonl"
    assert extract_project_name(path) == "x"


@pytest.mark.asyncio
async def test_scan_discovers_sessions():
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create a fake project dir with a JSONL file
        proj_dir = Path(tmpdir) / "-Users-apple-Projects-myproj-abc123"
        proj_dir.mkdir()
        jsonl_file = proj_dir / "session.jsonl"
        jsonl_file.write_text(json.dumps({"type": "assistant", "message": "hello"}) + "\n")

        watcher = TranscriptWatcher(
            projects_dir=tmpdir,
            active_threshold=600.0,
            known_session_ids=set(),
        )
        sessions = await watcher.scan()
        assert len(sessions) >= 1
        assert sessions[0].project_name == "myproj"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/core/test_transcript_watcher.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement TranscriptWatcher**

```python
# backend/app/core/transcript_watcher.py
"""Watches ~/.claude/projects/ for session JSONL files not tracked by hooks.

Supplements hooks by discovering sessions from Cursor, unhook'd Claude Code, etc.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_PROJECTS_DIR = Path.home() / ".claude" / "projects"


def extract_project_name(path: str) -> str:
    """Extract a human-readable project name from a transcript path.

    Path format: ~/.claude/projects/-Users-apple-Projects-others-startups-startups-mono-abc123/
    Strategy: strip the hash suffix, take the last 1-2 meaningful path segments.
    """
    dirname = Path(path).parent.name  # e.g. "-Users-apple-Projects-others-startups-mono-abc123"

    # Split on dashes, remove leading empty segment
    parts = dirname.split("-")
    parts = [p for p in parts if p]

    # Strip trailing hex-like hash (8+ hex chars)
    if parts and re.fullmatch(r"[a-f0-9]{8,}", parts[-1]):
        parts = parts[:-1]

    if not parts:
        return "unknown"

    # Skip common path prefixes
    skip = {"users", "home", "projects", "others"}
    meaningful = [p for p in parts if p.lower() not in skip]

    if not meaningful:
        return parts[-1]

    # Take last 2 meaningful segments joined by dash
    return "-".join(meaningful[-2:]) if len(meaningful) >= 2 else meaningful[-1]


@dataclass
class DiscoveredSession:
    """A session discovered from transcript files."""

    dir_name: str
    jsonl_path: str
    project_name: str
    last_modified: float


class TranscriptWatcher:
    """Scans ~/.claude/projects/ for active session JSONL files."""

    def __init__(
        self,
        projects_dir: str | Path | None = None,
        active_threshold: float = 600.0,
        known_session_ids: set[str] | None = None,
    ) -> None:
        self.projects_dir = Path(projects_dir) if projects_dir else DEFAULT_PROJECTS_DIR
        self.active_threshold = active_threshold
        self.known_session_ids = known_session_ids or set()

    async def scan(self) -> list[DiscoveredSession]:
        """Scan for active sessions not already tracked."""
        if not self.projects_dir.exists():
            return []

        now = time.time()
        discovered: list[DiscoveredSession] = []

        for proj_dir in self.projects_dir.iterdir():
            if not proj_dir.is_dir():
                continue

            # Look for JSONL files
            for jsonl in proj_dir.glob("*.jsonl"):
                try:
                    mtime = jsonl.stat().st_mtime
                except OSError:
                    continue

                if now - mtime > self.active_threshold:
                    continue

                dir_name = proj_dir.name
                if dir_name in self.known_session_ids:
                    continue

                project_name = extract_project_name(str(jsonl))
                discovered.append(DiscoveredSession(
                    dir_name=dir_name,
                    jsonl_path=str(jsonl),
                    project_name=project_name,
                    last_modified=mtime,
                ))

        return discovered
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/core/test_transcript_watcher.py -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/transcript_watcher.py backend/tests/core/test_transcript_watcher.py
git commit -m "feat: add TranscriptWatcher for fallback session discovery"
```

---

## Task 8: Backend — Agent Seat Persistence in SQLite

**Files:**
- Modify: `backend/app/db/models.py`
- Create: `backend/tests/db/test_seat_persistence.py`

- [ ] **Step 1: Write failing test for AgentSeatPreference model**

```python
# backend/tests/db/test_seat_persistence.py
import pytest
from sqlalchemy import select

from app.db.database import AsyncSessionLocal, Base, get_engine
from app.db.models import AgentSeatPreference


@pytest.fixture(autouse=True)
async def setup_db():
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_create_seat_preference():
    async with AsyncSessionLocal() as session:
        pref = AgentSeatPreference(
            session_id="sess-1",
            agent_id="agent-1",
            desk=3,
            color="#3B82F6",
            room_key="my-project",
        )
        session.add(pref)
        await session.commit()

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AgentSeatPreference).where(AgentSeatPreference.agent_id == "agent-1")
        )
        pref = result.scalar_one()
        assert pref.desk == 3
        assert pref.room_key == "my-project"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/db/test_seat_persistence.py -v`
Expected: FAIL — `ImportError: cannot import name 'AgentSeatPreference'`

- [ ] **Step 3: Add AgentSeatPreference model**

In `backend/app/db/models.py`, add after the `UserPreference` class:

```python
class AgentSeatPreference(Base):
    """Persists agent desk/color assignments across reconnects."""

    __tablename__ = "agent_seat_preferences"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String, index=True)
    agent_id: Mapped[str] = mapped_column(String, index=True)
    desk: Mapped[int] = mapped_column()
    color: Mapped[str] = mapped_column(String)
    room_key: Mapped[str] = mapped_column(String)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/db/test_seat_persistence.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/models.py backend/tests/db/test_seat_persistence.py
git commit -m "feat: add AgentSeatPreference table for seat persistence"
```

---

## Task 9: Frontend — TypeScript Types for Multi-Project

**Files:**
- Create: `frontend/src/types/projects.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Create project types**

```typescript
// frontend/src/types/projects.ts

import type { Agent, Boss, OfficeState, TodoItem } from "./index";

export type ViewMode = "overview" | "room-detail" | "all-merged";

export interface ProjectGroup {
  key: string;
  name: string;
  color: string;
  root: string | null;
  agents: Agent[];
  boss: Boss;
  sessionCount: number;
  todos: TodoItem[];
}

export interface MultiProjectGameState {
  sessionId: string;
  projects: ProjectGroup[];
  office: OfficeState;
  lastUpdated: string;
}

export interface ProjectSummary {
  key: string;
  name: string;
  color: string;
  root: string | null;
  sessionCount: number;
}
```

- [ ] **Step 2: Export from index.ts**

In `frontend/src/types/index.ts`, add:

```typescript
export type { ViewMode, ProjectGroup, MultiProjectGameState, ProjectSummary } from "./projects";
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/projects.ts frontend/src/types/index.ts
git commit -m "feat: add TypeScript types for multi-project state"
```

---

## Task 10: Frontend — Project Zustand Store

**Files:**
- Create: `frontend/src/stores/projectStore.ts`

- [ ] **Step 1: Create projectStore**

```typescript
// frontend/src/stores/projectStore.ts
"use client";

import { create } from "zustand";
import type { ViewMode, ProjectGroup, MultiProjectGameState } from "@/types/projects";

interface ProjectStoreState {
  // State
  viewMode: ViewMode;
  activeRoomKey: string | null;
  projects: ProjectGroup[];
  lastUpdated: string | null;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setActiveRoom: (key: string | null) => void;
  zoomToRoom: (key: string) => void;
  zoomToOverview: () => void;
  updateFromServer: (state: MultiProjectGameState) => void;
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  viewMode: "overview",
  activeRoomKey: null,
  projects: [],
  lastUpdated: null,

  setViewMode: (mode) => set({ viewMode: mode }),

  setActiveRoom: (key) => set({ activeRoomKey: key }),

  zoomToRoom: (key) =>
    set({ viewMode: "room-detail", activeRoomKey: key }),

  zoomToOverview: () =>
    set({ viewMode: "overview", activeRoomKey: null }),

  updateFromServer: (state) =>
    set({
      projects: state.projects,
      lastUpdated: state.lastUpdated,
    }),
}));

// Selectors
export const selectViewMode = (s: ProjectStoreState) => s.viewMode;
export const selectActiveRoomKey = (s: ProjectStoreState) => s.activeRoomKey;
export const selectProjects = (s: ProjectStoreState) => s.projects;
export const selectActiveProject = (s: ProjectStoreState) =>
  s.projects.find((p) => p.key === s.activeRoomKey) ?? null;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/projectStore.ts
git commit -m "feat: add projectStore for multi-room view state"
```

---

## Task 11: Frontend — useProjectWebSocket Hook

**Files:**
- Create: `frontend/src/hooks/useProjectWebSocket.ts`

- [ ] **Step 1: Create the WebSocket hook**

Reference the existing WebSocket pattern in the codebase. Check `frontend/src/hooks/` for the current WebSocket hook pattern (likely `useWebSocket.ts` or similar in `gameStore.ts`).

```typescript
// frontend/src/hooks/useProjectWebSocket.ts
"use client";

import { useEffect, useRef } from "react";
import { useProjectStore } from "@/stores/projectStore";
import type { MultiProjectGameState } from "@/types/projects";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export function useProjectWebSocket() {
  const updateFromServer = useProjectStore((s) => s.updateFromServer);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/ws/projects`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "project_state" && msg.data) {
          updateFromServer(msg.data as MultiProjectGameState);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (wsRef.current === ws || wsRef.current === null) {
          const newWs = new WebSocket(`${WS_URL}/ws/projects`);
          newWs.onmessage = ws.onmessage;
          newWs.onclose = ws.onclose;
          wsRef.current = newWs;
        }
      }, 3000);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [updateFromServer]);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useProjectWebSocket.ts
git commit -m "feat: add useProjectWebSocket hook for /ws/projects"
```

---

## Task 12: Frontend — Room Constants

**Files:**
- Create: `frontend/src/constants/rooms.ts`

- [ ] **Step 1: Create room layout constants**

```typescript
// frontend/src/constants/rooms.ts

/** Standard room dimensions (scaled-down office) */
export const ROOM_WIDTH = 640;
export const ROOM_HEIGHT = 512;

/** Gap between rooms in grid */
export const ROOM_GAP = 16;

/** Max columns in overview grid */
export const ROOM_GRID_COLS = 2;

/** Thumbnail size in overview mode */
export const THUMBNAIL_WIDTH = 300;
export const THUMBNAIL_HEIGHT = 200;

/** Room furniture positions (scaled from full office positions) */
export const ROOM_POSITIONS = {
  clock: { x: 48, y: 24 },
  whiteboard: { x: 200, y: 24 },
  safetySign: { x: 400, y: 24 },
  employeeOfMonth: { x: 120, y: 24 },
  cityWindow: { x: 520, y: 40 },
  waterCooler: { x: 40, y: 400 },
  bossDesk: { x: 280, y: 380 },
  deskGridOrigin: { x: 80, y: 140 },
  elevator: { x: 560, y: 200 },
} as const;

/** Calculate grid dimensions for N rooms */
export function getRoomGridSize(roomCount: number) {
  const cols = Math.min(roomCount, ROOM_GRID_COLS);
  const rows = Math.ceil(roomCount / ROOM_GRID_COLS);
  return {
    cols,
    rows,
    width: cols * ROOM_WIDTH + (cols - 1) * ROOM_GAP,
    height: rows * ROOM_HEIGHT + (rows - 1) * ROOM_GAP,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/constants/rooms.ts
git commit -m "feat: add room layout constants for multi-project grid"
```

---

## Task 13: Frontend — MiniOffice Component

**Files:**
- Create: `frontend/src/components/game/MiniOffice.tsx`

This is the largest frontend task. MiniOffice is a scaled-down, self-contained office that renders at any size.

- [ ] **Step 1: Study existing OfficeGame.tsx structure**

Read `frontend/src/components/game/OfficeGame.tsx` fully to understand how it composes:
- OfficeBackground (walls/floor)
- DeskGrid
- BossSprite
- AgentSprite (per agent)
- WallClock, Whiteboard, CityWindow, SafetySign, Elevator, EmployeeOfTheMonth, etc.

Note which props each sub-component needs.

- [ ] **Step 2: Create MiniOffice component**

```typescript
// frontend/src/components/game/MiniOffice.tsx
/**
 * MiniOffice - A self-contained, scalable mini-office for a single project.
 *
 * Props determine the room's content (agents, boss, furniture).
 * Renders as a PixiJS Container that can be placed in a grid or viewed standalone.
 */

"use client";

import { Container, Graphics, Text } from "@pixi/react";
import { TextStyle } from "pixi.js";
import { useMemo } from "react";
import type { ProjectGroup } from "@/types/projects";
import { ROOM_WIDTH, ROOM_HEIGHT } from "@/constants/rooms";

interface MiniOfficeProps {
  project: ProjectGroup;
  x: number;
  y: number;
  scale?: number;
  isActive?: boolean;
  onClick?: () => void;
}

export function MiniOffice({
  project,
  x,
  y,
  scale = 1,
  isActive = false,
  onClick,
}: MiniOfficeProps) {
  const labelStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: "monospace",
        fontSize: 14,
        fill: project.color,
        fontWeight: "bold",
      }),
    [project.color]
  );

  const countStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: "monospace",
        fontSize: 11,
        fill: "#94a3b8",
      }),
    []
  );

  return (
    <Container x={x} y={y} scale={scale} eventMode="static" onclick={onClick}>
      {/* Room background */}
      <Graphics
        draw={(g) => {
          // Floor
          g.clear();
          g.beginFill(0x2d2d3d);
          g.drawRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);
          g.endFill();

          // Border (project color)
          const borderColor = parseInt(project.color.slice(1), 16);
          g.lineStyle(isActive ? 3 : 2, borderColor, isActive ? 1 : 0.6);
          g.drawRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);

          // Wall area (top strip)
          g.beginFill(0x3d3d5c);
          g.drawRect(2, 2, ROOM_WIDTH - 4, 80);
          g.endFill();
        }}
      />

      {/* Project label */}
      <Text text={project.name} style={labelStyle} x={10} y={8} />

      {/* Agent count badge */}
      <Text
        text={`${project.agents.length} agents | ${project.sessionCount} sessions`}
        style={countStyle}
        x={10}
        y={28}
      />

      {/* TODO: In future steps, add scaled versions of:
          - DeskGrid (agent desks)
          - BossSprite (mini)
          - WallClock, Whiteboard, SafetySign, etc.
          For now, render agent indicators as colored dots */}
      {project.agents.map((agent, i) => (
        <Graphics
          key={agent.id}
          draw={(g) => {
            g.clear();
            const color = parseInt(agent.color.slice(1), 16);
            g.beginFill(color);
            g.drawCircle(0, 0, 6);
            g.endFill();
          }}
          x={100 + (i % 4) * 40}
          y={140 + Math.floor(i / 4) * 40}
        />
      ))}
    </Container>
  );
}
```

**Note:** This is the initial scaffold. The component will be iteratively enhanced in Task 14 to include full furniture rendering (clock, whiteboard, etc.) by reusing existing components at reduced scale. The agent dots will be replaced with actual AgentSprite instances.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/game/MiniOffice.tsx
git commit -m "feat: add MiniOffice component scaffold for project rooms"
```

---

## Task 14: Frontend — MiniOffice Furniture Integration

**Files:**
- Modify: `frontend/src/components/game/MiniOffice.tsx`

- [ ] **Step 1: Integrate existing furniture components at room scale**

Update `MiniOffice.tsx` to import and render existing components (WallClock, Whiteboard, CityWindow, SafetySign, Elevator, EmployeeOfTheMonth) positioned per `ROOM_POSITIONS` constants. Each component is placed inside a Container with the room's scale applied.

Read each existing component to understand its required props. Components that depend on store selectors will need to receive their data as props instead (or check if they accept props).

- [ ] **Step 2: Replace agent dots with AgentSprite instances**

Map `project.agents` to actual `AgentSprite` components at desk positions within the room, using the existing AgentSprite component. Position them relative to `ROOM_POSITIONS.deskGridOrigin`.

- [ ] **Step 3: Add BossSprite for the room**

Render a `BossSprite` at `ROOM_POSITIONS.bossDesk` using the project's boss state.

- [ ] **Step 4: Verify visually**

Run: `cd frontend && make dev`
Navigate to the app and confirm furniture renders inside rooms.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/game/MiniOffice.tsx
git commit -m "feat: integrate furniture and agent sprites into MiniOffice"
```

---

## Task 15: Frontend — ProjectRoomGrid Component

**Files:**
- Create: `frontend/src/components/game/ProjectRoomGrid.tsx`

- [ ] **Step 1: Create the grid component**

```typescript
// frontend/src/components/game/ProjectRoomGrid.tsx
/**
 * ProjectRoomGrid - Renders multiple MiniOffice instances in a 2-column grid.
 */

"use client";

import { Container } from "@pixi/react";
import { useShallow } from "zustand/react/shallow";

import { useProjectStore, selectProjects, selectActiveRoomKey } from "@/stores/projectStore";
import { MiniOffice } from "./MiniOffice";
import { ROOM_WIDTH, ROOM_HEIGHT, ROOM_GAP, ROOM_GRID_COLS } from "@/constants/rooms";

export function ProjectRoomGrid() {
  const projects = useProjectStore(useShallow(selectProjects));
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const zoomToRoom = useProjectStore((s) => s.zoomToRoom);

  return (
    <Container>
      {projects.map((project, index) => {
        const col = index % ROOM_GRID_COLS;
        const row = Math.floor(index / ROOM_GRID_COLS);
        const x = col * (ROOM_WIDTH + ROOM_GAP);
        const y = row * (ROOM_HEIGHT + ROOM_GAP);

        return (
          <MiniOffice
            key={project.key}
            project={project}
            x={x}
            y={y}
            isActive={project.key === activeRoomKey}
            onClick={() => zoomToRoom(project.key)}
          />
        );
      })}
    </Container>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/game/ProjectRoomGrid.tsx
git commit -m "feat: add ProjectRoomGrid for multi-room overview layout"
```

---

## Task 16: Frontend — View Mode Switcher + OfficeGame Integration

**Files:**
- Modify: `frontend/src/components/game/OfficeGame.tsx`
- Modify: `frontend/src/stores/gameStore.ts`

- [ ] **Step 1: Add viewMode to gameStore**

In `frontend/src/stores/gameStore.ts`, add to the store state:

```typescript
// Add to GameStoreState interface:
viewMode: "overview" | "room-detail" | "all-merged";

// Add to initial state:
viewMode: "all-merged",  // Default to existing behavior

// Add action:
setViewMode: (mode: "overview" | "room-detail" | "all-merged") => set({ viewMode: mode }),
```

- [ ] **Step 2: Integrate ProjectRoomGrid into OfficeGame**

In `frontend/src/components/game/OfficeGame.tsx`, conditionally render based on viewMode:

```typescript
// Import:
import { ProjectRoomGrid } from "./ProjectRoomGrid";
import { useProjectStore } from "@/stores/projectStore";

// Inside the render, wrap the existing office content:
const viewMode = useProjectStore((s) => s.viewMode);

// In the JSX, replace the direct children with:
{viewMode === "overview" && <ProjectRoomGrid />}
{viewMode === "room-detail" && <ProjectRoomGrid />}  // Will zoom to active room
{viewMode === "all-merged" && (
  /* existing OfficeGame content unchanged */
)}
```

- [ ] **Step 3: Add view mode toggle UI**

Add a simple toggle in the header or as a floating control. Three buttons: Overview | Detail | Merged.

- [ ] **Step 4: Verify visually**

Run: `make dev-tmux` from project root.
Open browser. Toggle between view modes. Overview should show grid of rooms.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/game/OfficeGame.tsx frontend/src/stores/gameStore.ts
git commit -m "feat: integrate view mode switcher and ProjectRoomGrid into OfficeGame"
```

---

## Task 17: Frontend — Zoom Navigation (Programmatic Zoom to Room)

**Files:**
- Modify: `frontend/src/components/game/OfficeGame.tsx`

- [ ] **Step 1: Use react-zoom-pan-pinch for programmatic zoom**

The existing `OfficeGame.tsx` already wraps content in `<TransformWrapper>` / `<TransformComponent>`. Use the `ref` to call `zoomToElement` or `setTransform` when a room is selected.

```typescript
// In OfficeGame, get the transform ref:
const transformRef = useRef<ReactZoomPanPinchRef>(null);
const activeRoomKey = useProjectStore(selectActiveRoomKey);
const projects = useProjectStore(selectProjects);

// When activeRoomKey changes, zoom to that room:
useEffect(() => {
  if (!transformRef.current || !activeRoomKey) return;
  const index = projects.findIndex((p) => p.key === activeRoomKey);
  if (index < 0) return;

  const col = index % ROOM_GRID_COLS;
  const row = Math.floor(index / ROOM_GRID_COLS);
  const targetX = col * (ROOM_WIDTH + ROOM_GAP);
  const targetY = row * (ROOM_HEIGHT + ROOM_GAP);

  // Zoom to fit the room in viewport
  const { setTransform } = transformRef.current;
  setTransform(-targetX + 20, -targetY + 20, 1.2, 300);
}, [activeRoomKey, projects]);
```

- [ ] **Step 2: Add zoom-out-to-overview handler**

When `viewMode` switches back to `overview`, reset zoom:

```typescript
useEffect(() => {
  if (viewMode === "overview" && transformRef.current) {
    transformRef.current.resetTransform(300);
  }
}, [viewMode]);
```

- [ ] **Step 3: Verify zoom navigation works**

Run dev, click a room thumbnail in overview → should zoom in smoothly. Click breadcrumb → should zoom out.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/game/OfficeGame.tsx
git commit -m "feat: add programmatic zoom navigation between rooms"
```

---

## Task 18: Frontend — Project Sidebar (Collapsible Groups)

**Files:**
- Create: `frontend/src/components/layout/ProjectSidebar.tsx`
- Modify: `frontend/src/components/layout/SessionSidebar.tsx`

- [ ] **Step 1: Create ProjectSidebar component**

```typescript
// frontend/src/components/layout/ProjectSidebar.tsx
"use client";

import { useState } from "react";
import { useProjectStore, selectProjects } from "@/stores/projectStore";
import type { ProjectGroup } from "@/types/projects";

export function ProjectSidebar() {
  const projects = useProjectStore(selectProjects);
  const zoomToRoom = useProjectStore((s) => s.zoomToRoom);

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-slate-400 px-2 py-1">
        PROJECTS ({projects.length})
      </div>
      {projects.map((project) => (
        <ProjectEntry
          key={project.key}
          project={project}
          onClickProject={() => zoomToRoom(project.key)}
        />
      ))}
    </div>
  );
}

function ProjectEntry({
  project,
  onClickProject,
}: {
  project: ProjectGroup;
  onClickProject: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        className="w-full flex items-center gap-2 px-2 py-1 text-sm hover:bg-slate-700 rounded text-left"
        onClick={onClickProject}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: project.color }}
        />
        <span
          className="text-slate-400 text-xs flex-shrink-0 cursor-pointer"
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? "▼" : "▶"}
        </span>
        <span className="truncate">{project.name}</span>
        <span className="text-slate-500 text-xs ml-auto">
          {project.sessionCount}s {project.agents.length}a
        </span>
      </button>

      {expanded && (
        <div className="ml-6 text-xs text-slate-500">
          {project.agents.map((agent) => (
            <div key={agent.id} className="py-0.5 truncate">
              {agent.name || agent.id}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate into SessionSidebar**

In `frontend/src/components/layout/SessionSidebar.tsx`, add a conditional section at the top that renders `<ProjectSidebar />` when the project store has projects. Keep the existing sessions list below it.

- [ ] **Step 3: Verify visually**

Run dev, check sidebar shows project groups with counts.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/ProjectSidebar.tsx frontend/src/components/layout/SessionSidebar.tsx
git commit -m "feat: add collapsible project tree to sidebar"
```

---

## Task 19: Frontend — Agent Project Badge + Room Border Coloring

**Files:**
- Modify: `frontend/src/components/game/AgentSprite.tsx` (agent label area)
- Create: `frontend/src/components/game/RoomBorder.tsx`

- [ ] **Step 1: Add project badge to agent labels**

In the `AgentLabel` component within `AgentSprite.tsx`, check if the agent has a `projectKey` field. If so, render a small colored badge before the agent name:

```
[🟢 proj-name] Finder Fred
```

Rendered as a colored dot + project name prefix in the PixiJS text.

- [ ] **Step 2: Create RoomBorder component**

```typescript
// frontend/src/components/game/RoomBorder.tsx
"use client";

import { Graphics, Text } from "@pixi/react";
import { TextStyle } from "pixi.js";
import { useMemo } from "react";
import { ROOM_WIDTH, ROOM_HEIGHT } from "@/constants/rooms";

interface RoomBorderProps {
  color: string;
  name: string;
  isActive?: boolean;
}

export function RoomBorder({ color, name, isActive = false }: RoomBorderProps) {
  const style = useMemo(
    () =>
      new TextStyle({
        fontFamily: "monospace",
        fontSize: 16,
        fill: color,
        fontWeight: "bold",
      }),
    [color]
  );

  return (
    <>
      <Graphics
        draw={(g) => {
          g.clear();
          const c = parseInt(color.slice(1), 16);
          g.lineStyle(isActive ? 4 : 2, c, isActive ? 1 : 0.7);
          g.drawRoundedRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT, 8);
        }}
      />
      <Text text={name} style={style} x={12} y={-20} />
    </>
  );
}
```

- [ ] **Step 3: Verify visually**

Run dev, check that room borders show project color and name.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/game/AgentSprite.tsx frontend/src/components/game/RoomBorder.tsx
git commit -m "feat: add project badges to agents and colored room borders"
```

---

## Task 20: Integration — Connect WebSocket + Full Flow Test

**Files:**
- Modify: `frontend/src/app/page.tsx` (or main layout)

- [ ] **Step 1: Wire up useProjectWebSocket in the app**

In the main page/layout component, add:

```typescript
import { useProjectWebSocket } from "@/hooks/useProjectWebSocket";

// Inside component:
useProjectWebSocket();
```

- [ ] **Step 2: Run full stack**

Run: `make dev-tmux` from `claude-office/`

- [ ] **Step 3: Verify end-to-end**

1. Start a Claude Code session in any project
2. Check backend logs: "New project registered: <name>"
3. Check frontend: project appears in sidebar and overview grid
4. Click project → zoom to room detail
5. Click overview → zoom back out
6. Switch to "All Merged" → existing behavior preserved

- [ ] **Step 4: Run all checks**

Run: `cd claude-office && make checkall`
Expected: All lint, typecheck, and tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: integrate multi-project WebSocket and end-to-end flow"
```

---

## Summary

| Task | Component | What it produces |
|------|-----------|-----------------|
| 1 | Backend: ProjectRegistry | Session-to-project mapping with colors |
| 2 | Backend: Project models | ProjectGroup, MultiProjectGameState |
| 3 | Backend: EventProcessor wiring | Auto-register sessions with registry |
| 4 | Backend: Grouped state method | get_project_grouped_state() |
| 5 | Backend: REST API | /api/v1/projects endpoints |
| 6 | Backend: WebSocket | /ws/projects endpoint |
| 7 | Backend: TranscriptWatcher | Fallback session discovery |
| 8 | Backend: Seat persistence | AgentSeatPreference SQLite table |
| 9 | Frontend: Types | TypeScript project types |
| 10 | Frontend: Store | projectStore (Zustand) |
| 11 | Frontend: WebSocket hook | useProjectWebSocket |
| 12 | Frontend: Constants | Room sizing/layout constants |
| 13 | Frontend: MiniOffice scaffold | Basic room component |
| 14 | Frontend: MiniOffice furniture | Full furniture integration |
| 15 | Frontend: ProjectRoomGrid | Grid layout of rooms |
| 16 | Frontend: View mode switcher | Toggle overview/detail/merged |
| 17 | Frontend: Zoom navigation | Programmatic zoom to rooms |
| 18 | Frontend: Project sidebar | Collapsible project tree |
| 19 | Frontend: Agent badges + borders | Visual project identity |
| 20 | Integration: Full flow | End-to-end wiring |
