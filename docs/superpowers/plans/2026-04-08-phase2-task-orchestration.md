# Phase 2: Task Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Agent Orchestrator (AO) into Claude Office with adapter pattern, enabling task spawning, lifecycle tracking, and agent visualization — all with graceful degradation when AO is unavailable.

**Architecture:** TaskAdapter protocol abstracts external systems. AOAdapter implements it for AO. TaskService manages lifecycle, polls for metadata (PR/CI/review), matches tasks to office sessions via worktree_path, and broadcasts updates over existing `/ws/projects` WebSocket. Frontend adds a bottom drawer panel for task management.

**Tech Stack:** Python (FastAPI, Pydantic, httpx, asyncio), TypeScript (React, Zustand, Next.js), WebSocket

**Spec:** `docs/superpowers/specs/2026-04-08-phase2-task-orchestration-design.md`

---

## File Structure

### Backend — New Files
| File | Responsibility |
|------|---------------|
| `backend/app/models/tasks.py` | `TaskStatus` enum, `Task` Pydantic model |
| `backend/app/services/adapters/__init__.py` | `TaskAdapter` Protocol, `ExternalSession` model |
| `backend/app/services/adapters/ao.py` | `AOAdapter` — AO HTTP client |
| `backend/app/services/task_service.py` | `TaskService` — lifecycle, polling, session matching, broadcast |
| `backend/app/api/routes/tasks.py` | REST endpoints for tasks |
| `backend/tests/test_task_model.py` | Tests for Task model |
| `backend/tests/test_ao_adapter.py` | Tests for AOAdapter |
| `backend/tests/test_task_service.py` | Tests for TaskService |
| `backend/tests/test_tasks_api.py` | Tests for task API endpoints |

### Backend — Modified Files
| File | Change |
|------|--------|
| `backend/app/config.py` | Add `AO_URL`, `AO_POLL_INTERVAL` settings |
| `backend/app/main.py` | Add task_service lifecycle + tasks router |
| `backend/app/core/broadcast_service.py` | Add `broadcast_tasks_update()` |
| `backend/app/api/websocket.py` | (No change needed — reuses `project_connections`) |

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/types/tasks.ts` | `Task`, `TaskStatus`, `TasksUpdate` types |
| `frontend/src/stores/taskStore.ts` | Zustand store for tasks + drawer state |
| `frontend/src/components/tasks/TaskDrawer.tsx` | Bottom drawer container |
| `frontend/src/components/tasks/TaskList.tsx` | Project-grouped task list |
| `frontend/src/components/tasks/TaskCard.tsx` | Single task card with status |
| `frontend/src/components/tasks/SpawnModal.tsx` | Spawn new task modal |
| `frontend/src/components/tasks/TaskStatusBadge.tsx` | Status icon/badge |
| `frontend/tests/taskStore.test.ts` | Tests for task store |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `frontend/src/hooks/useProjectWebSocket.ts` | Handle `tasks_update` messages |
| `frontend/src/app/page.tsx` | Add `<TaskDrawer />` to layout |

---

### Task 1: Task Model + Adapter Protocol

**Files:**
- Create: `backend/app/models/tasks.py`
- Create: `backend/app/services/adapters/__init__.py`
- Test: `backend/tests/test_task_model.py`

- [ ] **Step 1: Write tests for TaskStatus and Task model**

Create `backend/tests/test_task_model.py`:

```python
"""Tests for Task model and TaskStatus enum."""

import pytest
from datetime import datetime, UTC

from app.models.tasks import Task, TaskStatus


class TestTaskStatus:
    def test_all_statuses_exist(self):
        expected = {
            "spawning", "working", "pr_open", "ci_failed",
            "review_pending", "changes_requested", "approved",
            "merged", "done", "error",
        }
        assert {s.value for s in TaskStatus} == expected

    def test_status_is_str_enum(self):
        assert TaskStatus.spawning == "spawning"
        assert isinstance(TaskStatus.working, str)


class TestTask:
    def _make_task(self, **overrides) -> Task:
        defaults = {
            "id": "task-1",
            "external_session_id": "ao-sess-1",
            "adapter_type": "ao",
            "project_key": "my-project",
            "issue": "#123 Fix bug",
            "status": TaskStatus.working,
            "pr_url": None,
            "pr_number": None,
            "ci_status": None,
            "review_status": None,
            "worktree_path": "/tmp/worktree/123",
            "office_session_id": None,
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
        defaults.update(overrides)
        return Task(**defaults)

    def test_create_task(self):
        task = self._make_task()
        assert task.id == "task-1"
        assert task.adapter_type == "ao"
        assert task.status == TaskStatus.working

    def test_camel_case_serialization(self):
        task = self._make_task()
        data = task.model_dump(by_alias=True, mode="json")
        assert "externalSessionId" in data
        assert "projectKey" in data
        assert "ciStatus" in data
        assert "officeSessionId" in data

    def test_optional_fields_default_none(self):
        task = self._make_task(pr_url=None, ci_status=None)
        assert task.pr_url is None
        assert task.ci_status is None

    def test_task_with_pr_info(self):
        task = self._make_task(
            status=TaskStatus.pr_open,
            pr_url="https://github.com/org/repo/pull/45",
            pr_number=45,
            ci_status="passing",
            review_status="pending",
        )
        assert task.pr_number == 45
        assert task.ci_status == "passing"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_task_model.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.tasks'`

- [ ] **Step 3: Implement TaskStatus and Task model**

Create `backend/app/models/tasks.py`:

```python
"""Models for orchestration tasks — independent of Agent lifecycle."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class TaskStatus(StrEnum):
    """Lifecycle stages for an orchestrated task."""

    spawning = "spawning"
    working = "working"
    pr_open = "pr_open"
    ci_failed = "ci_failed"
    review_pending = "review_pending"
    changes_requested = "changes_requested"
    approved = "approved"
    merged = "merged"
    done = "done"
    error = "error"


class Task(BaseModel):
    """An orchestrated task, tracked independently of Agent lifecycle."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    external_session_id: str
    adapter_type: str
    project_key: str
    issue: str | None = None
    status: TaskStatus
    pr_url: str | None = None
    pr_number: int | None = None
    ci_status: str | None = None
    review_status: str | None = None
    worktree_path: str | None = None
    office_session_id: str | None = None
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: Implement TaskAdapter Protocol and ExternalSession**

Create `backend/app/services/adapters/__init__.py`:

```python
"""Adapter protocol for external orchestration systems."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class ExternalSession(BaseModel):
    """Normalized session info from any external orchestration system."""

    session_id: str
    project_id: str
    worktree_path: str | None = None
    issue: str | None = None
    status: str
    pr_url: str | None = None
    pr_number: int | None = None
    ci_status: str | None = None
    review_status: str | None = None


@runtime_checkable
class TaskAdapter(Protocol):
    """Interface for external orchestration system adapters."""

    adapter_type: str
    connected: bool

    async def connect(self) -> bool:
        """Probe if the external system is reachable."""
        ...

    async def spawn(self, project_id: str, issue: str) -> ExternalSession:
        """Dispatch a new task to the external system."""
        ...

    async def poll(self) -> list[ExternalSession]:
        """Fetch current session states from the external system."""
        ...

    async def get_projects(self) -> list[dict]:
        """Get configured projects from the external system."""
        ...
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_task_model.py -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add backend/app/models/tasks.py backend/app/services/adapters/__init__.py backend/tests/test_task_model.py
git commit -m "feat: add Task model, TaskStatus enum, and TaskAdapter protocol"
```

---

### Task 2: AO Adapter

**Files:**
- Create: `backend/app/services/adapters/ao.py`
- Test: `backend/tests/test_ao_adapter.py`

- [ ] **Step 1: Write tests for AOAdapter**

Create `backend/tests/test_ao_adapter.py`:

```python
"""Tests for the Agent Orchestrator adapter."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import Response

from app.services.adapters.ao import AOAdapter
from app.services.adapters import ExternalSession


@pytest.fixture
def adapter():
    return AOAdapter(ao_url="http://localhost:3000")


class TestAOAdapterInit:
    def test_default_state(self, adapter: AOAdapter):
        assert adapter.adapter_type == "ao"
        assert adapter.connected is False
        assert adapter.ao_url == "http://localhost:3000"

    def test_strips_trailing_slash(self):
        a = AOAdapter(ao_url="http://localhost:3000/")
        assert a.ao_url == "http://localhost:3000"


class TestAOAdapterConnect:
    @pytest.mark.asyncio
    async def test_connect_success(self, adapter: AOAdapter):
        with patch("app.services.adapters.ao.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=Response(200, json=[]))
            mock_client_cls.return_value = mock_client

            result = await adapter.connect()
            assert result is True
            assert adapter.connected is True

    @pytest.mark.asyncio
    async def test_connect_failure(self, adapter: AOAdapter):
        with patch("app.services.adapters.ao.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(side_effect=Exception("Connection refused"))
            mock_client_cls.return_value = mock_client

            result = await adapter.connect()
            assert result is False
            assert adapter.connected is False


class TestAOAdapterPoll:
    @pytest.mark.asyncio
    async def test_poll_returns_external_sessions(self, adapter: AOAdapter):
        ao_response = [
            {
                "id": "sess-1",
                "project": "my-project",
                "worktreePath": "/tmp/worktree/1",
                "issue": "#42",
                "status": "working",
                "pr": {
                    "url": "https://github.com/org/repo/pull/10",
                    "number": 10,
                    "ciStatus": "passing",
                    "reviewStatus": "pending",
                },
            },
            {
                "id": "sess-2",
                "project": "other-project",
                "worktreePath": None,
                "issue": None,
                "status": "spawning",
                "pr": None,
            },
        ]
        with patch("app.services.adapters.ao.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=Response(200, json=ao_response))
            mock_client_cls.return_value = mock_client

            sessions = await adapter.poll()
            assert len(sessions) == 2
            assert sessions[0].session_id == "sess-1"
            assert sessions[0].pr_url == "https://github.com/org/repo/pull/10"
            assert sessions[0].ci_status == "passing"
            assert sessions[1].pr_url is None

    @pytest.mark.asyncio
    async def test_poll_empty_response(self, adapter: AOAdapter):
        with patch("app.services.adapters.ao.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=Response(200, json=[]))
            mock_client_cls.return_value = mock_client

            sessions = await adapter.poll()
            assert sessions == []


class TestAOAdapterSpawn:
    @pytest.mark.asyncio
    async def test_spawn_returns_external_session(self, adapter: AOAdapter):
        spawn_response = {
            "id": "new-sess-1",
            "project": "my-project",
            "worktreePath": "/tmp/worktree/new",
            "issue": "#99",
            "status": "spawning",
            "pr": None,
        }
        with patch("app.services.adapters.ao.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=Response(200, json=spawn_response))
            mock_client_cls.return_value = mock_client

            session = await adapter.spawn("my-project", "#99")
            assert session.session_id == "new-sess-1"
            assert session.status == "spawning"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_ao_adapter.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.adapters.ao'`

- [ ] **Step 3: Implement AOAdapter**

Create `backend/app/services/adapters/ao.py`:

```python
"""Agent Orchestrator (@composio/ao) adapter."""

from __future__ import annotations

import logging

import httpx

from app.services.adapters import ExternalSession

logger = logging.getLogger(__name__)


class AOAdapter:
    """Adapter for Agent Orchestrator HTTP API."""

    adapter_type = "ao"

    def __init__(self, ao_url: str) -> None:
        self.ao_url = ao_url.rstrip("/")
        self.connected = False

    async def connect(self) -> bool:
        """Probe AO connectivity by hitting GET /api/sessions."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.ao_url}/api/sessions")
                resp.raise_for_status()
                self.connected = True
                logger.info(f"Connected to Agent Orchestrator at {self.ao_url}")
                return True
        except Exception as e:
            self.connected = False
            logger.warning(f"Failed to connect to AO at {self.ao_url}: {e}")
            return False

    async def spawn(self, project_id: str, issue: str) -> ExternalSession:
        """POST /api/spawn to dispatch a new task."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.ao_url}/api/spawn",
                json={"project": project_id, "issue": issue},
            )
            resp.raise_for_status()
            data = resp.json()
            return self._to_external_session(data)

    async def poll(self) -> list[ExternalSession]:
        """GET /api/sessions and convert to ExternalSession list."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.ao_url}/api/sessions")
            resp.raise_for_status()
            return [self._to_external_session(s) for s in resp.json()]

    async def get_projects(self) -> list[dict]:
        """GET /api/projects from AO."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.ao_url}/api/projects")
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    def _to_external_session(data: dict) -> ExternalSession:
        """Convert AO session JSON to ExternalSession."""
        pr = data.get("pr") or {}
        return ExternalSession(
            session_id=data["id"],
            project_id=data.get("project", ""),
            worktree_path=data.get("worktreePath"),
            issue=data.get("issue"),
            status=data.get("status", "spawning"),
            pr_url=pr.get("url"),
            pr_number=pr.get("number"),
            ci_status=pr.get("ciStatus"),
            review_status=pr.get("reviewStatus"),
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_ao_adapter.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add backend/app/services/adapters/ao.py backend/tests/test_ao_adapter.py
git commit -m "feat: add AOAdapter for Agent Orchestrator integration"
```

---

### Task 3: Config + Broadcast Extensions

**Files:**
- Modify: `backend/app/config.py:26-34` (add AO settings)
- Modify: `backend/app/core/broadcast_service.py:15-19` (add to __all__ + new function)

- [ ] **Step 1: Add AO settings to config**

In `backend/app/config.py`, add after `CLAUDE_PATH_CONTAINER`:

```python
    AO_URL: str = ""
    AO_POLL_INTERVAL: int = 10
```

- [ ] **Step 2: Add broadcast_tasks_update to broadcast_service**

In `backend/app/core/broadcast_service.py`, add to `__all__`:

```python
__all__ = [
    "broadcast_state",
    "broadcast_event",
    "broadcast_error",
    "broadcast_tasks_update",
]
```

Add at end of file:

```python
async def broadcast_tasks_update(
    tasks: list,
    connected: bool,
    adapter_type: str | None,
) -> None:
    """Push tasks_update to all /ws/projects subscribers."""
    if not manager.project_connections:
        return
    from app.models.tasks import Task

    await manager.broadcast_to_project_subscribers(
        {
            "type": "tasks_update",
            "data": {
                "connected": connected,
                "adapterType": adapter_type,
                "tasks": [
                    t.model_dump(by_alias=True, mode="json")
                    if isinstance(t, Task)
                    else t
                    for t in tasks
                ],
            },
        },
    )
```

- [ ] **Step 3: Run existing tests to verify nothing breaks**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/ -x -q`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add backend/app/config.py backend/app/core/broadcast_service.py
git commit -m "feat: add AO config settings and tasks broadcast function"
```

---

### Task 4: TaskService

**Files:**
- Create: `backend/app/services/task_service.py`
- Test: `backend/tests/test_task_service.py`

- [ ] **Step 1: Write tests for TaskService**

Create `backend/tests/test_task_service.py`:

```python
"""Tests for TaskService — lifecycle, matching, and broadcasting."""

import asyncio
from datetime import datetime, UTC
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.tasks import Task, TaskStatus
from app.services.adapters import ExternalSession
from app.services.task_service import TaskService, get_task_service


@pytest.fixture
def mock_adapter():
    adapter = MagicMock()
    adapter.adapter_type = "ao"
    adapter.connected = True
    adapter.connect = AsyncMock(return_value=True)
    adapter.poll = AsyncMock(return_value=[])
    adapter.spawn = AsyncMock()
    adapter.get_projects = AsyncMock(return_value=[])
    return adapter


@pytest.fixture
def service(mock_adapter):
    svc = TaskService()
    svc.adapter = mock_adapter
    return svc


class TestTaskServiceSpawn:
    @pytest.mark.asyncio
    async def test_spawn_creates_task(self, service, mock_adapter):
        mock_adapter.spawn.return_value = ExternalSession(
            session_id="ao-1",
            project_id="my-project",
            worktree_path="/tmp/wt/1",
            issue="#42",
            status="spawning",
        )
        with patch("app.services.task_service.broadcast_tasks_update", new_callable=AsyncMock):
            task = await service.spawn("my-project", "#42")

        assert task.external_session_id == "ao-1"
        assert task.project_key == "my-project"
        assert task.status == TaskStatus.spawning
        assert task.id in service.tasks

    @pytest.mark.asyncio
    async def test_spawn_fails_when_disconnected(self, service, mock_adapter):
        mock_adapter.connected = False
        service.adapter = mock_adapter
        with pytest.raises(Exception, match="No orchestration system connected"):
            await service.spawn("proj", "#1")


class TestTaskServiceUpdateTasks:
    def test_update_creates_new_task(self, service):
        sessions = [
            ExternalSession(
                session_id="ao-1",
                project_id="proj-a",
                status="working",
                issue="#10",
            ),
        ]
        changed = service._update_tasks(sessions)
        assert changed is True
        assert len(service.tasks) == 1
        task = list(service.tasks.values())[0]
        assert task.external_session_id == "ao-1"
        assert task.status == TaskStatus.working

    def test_update_modifies_existing_task(self, service):
        # First sync
        sessions1 = [
            ExternalSession(session_id="ao-1", project_id="proj-a", status="working"),
        ]
        service._update_tasks(sessions1)

        # Second sync with status change
        sessions2 = [
            ExternalSession(
                session_id="ao-1",
                project_id="proj-a",
                status="pr_open",
                pr_url="https://github.com/pull/1",
                pr_number=1,
                ci_status="passing",
            ),
        ]
        changed = service._update_tasks(sessions2)
        assert changed is True
        task = list(service.tasks.values())[0]
        assert task.status == TaskStatus.pr_open
        assert task.pr_url == "https://github.com/pull/1"

    def test_no_change_returns_false(self, service):
        sessions = [
            ExternalSession(session_id="ao-1", project_id="proj-a", status="working"),
        ]
        service._update_tasks(sessions)
        changed = service._update_tasks(sessions)
        assert changed is False


class TestTaskServiceMatchSessions:
    def test_match_by_worktree_path(self, service):
        # Create a task with worktree_path
        sessions = [
            ExternalSession(
                session_id="ao-1",
                project_id="proj-a",
                status="working",
                worktree_path="/home/user/.agent-orchestrator/abc/worktrees/ao-1",
            ),
        ]
        service._update_tasks(sessions)

        # Mock event_processor with a session whose project_root matches
        mock_ep = MagicMock()
        mock_sm = MagicMock()
        mock_ep.sessions = {"office-sess-1": mock_sm}

        # SessionRecord lookup mock
        with patch("app.services.task_service.event_processor", mock_ep):
            with patch("app.services.task_service._get_session_working_dirs") as mock_roots:
                mock_roots.return_value = {
                    "office-sess-1": "/home/user/.agent-orchestrator/abc/worktrees/ao-1",
                }
                service._match_all_sessions()

        task = list(service.tasks.values())[0]
        assert task.office_session_id == "office-sess-1"


class TestTaskServiceGetTasks:
    def test_get_all_tasks(self, service):
        sessions = [
            ExternalSession(session_id="ao-1", project_id="proj-a", status="working"),
            ExternalSession(session_id="ao-2", project_id="proj-b", status="spawning"),
        ]
        service._update_tasks(sessions)
        tasks = service.get_tasks()
        assert len(tasks) == 2

    def test_filter_by_project(self, service):
        sessions = [
            ExternalSession(session_id="ao-1", project_id="proj-a", status="working"),
            ExternalSession(session_id="ao-2", project_id="proj-b", status="spawning"),
        ]
        service._update_tasks(sessions)
        tasks = service.get_tasks(project_key="proj-a")
        assert len(tasks) == 1
        assert tasks[0].project_key == "proj-a"


class TestTaskServiceConnected:
    def test_connected_with_adapter(self, service, mock_adapter):
        mock_adapter.connected = True
        assert service.connected is True

    def test_not_connected_without_adapter(self):
        svc = TaskService()
        assert svc.connected is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_task_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.task_service'`

- [ ] **Step 3: Implement TaskService**

Create `backend/app/services/task_service.py`:

```python
"""TaskService — manages orchestrated task lifecycle."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from functools import lru_cache
from uuid import uuid4

from app.config import get_settings
from app.core.broadcast_service import broadcast_tasks_update
from app.core.project_registry import normalize_project_key
from app.models.tasks import Task, TaskStatus
from app.services.adapters import ExternalSession
from app.services.adapters.ao import AOAdapter

logger = logging.getLogger(__name__)


def _get_session_working_dirs() -> dict[str, str | None]:
    """Get working_directory for all active sessions from the event processor.

    Returns dict of session_id -> working_directory. AO sessions run in
    worktree dirs like ~/.agent-orchestrator/{hash}/worktrees/{id}/ which
    differs from the project root. We need the actual working dir for matching.
    """
    from app.core.event_processor import event_processor

    dirs: dict[str, str | None] = {}
    for sid in event_processor.sessions:
        # The project root stored in ProjectRegistry is the git root,
        # but AO worktrees are separate directories. We use the project root
        # as a fallback, but also check if the session record has a more
        # specific path recorded.
        project = event_processor.project_registry.get_project_for_session(sid)
        if project and project.root:
            dirs[sid] = project.root
    return dirs


class TaskService:
    """Manages task lifecycle, session matching, and state broadcasting."""

    def __init__(self) -> None:
        self.adapter: AOAdapter | None = None
        self.tasks: dict[str, Task] = {}
        self._poll_task: asyncio.Task | None = None  # type: ignore[type-arg]

    async def start(self) -> None:
        """Initialize adapter from config. Skip if AO_URL is empty."""
        settings = get_settings()
        if not settings.AO_URL:
            logger.info("AO_URL not set, task orchestration disabled")
            return
        self.adapter = AOAdapter(settings.AO_URL)
        await self.adapter.connect()
        self._poll_task = asyncio.create_task(self._poll_loop())
        logger.info("TaskService started with AO adapter")

    async def stop(self) -> None:
        """Cancel polling loop."""
        if self._poll_task:
            self._poll_task.cancel()
            self._poll_task = None

    @property
    def connected(self) -> bool:
        return self.adapter.connected if self.adapter else False

    async def spawn(self, project_id: str, issue: str) -> Task:
        """Dispatch new task via adapter, create internal Task."""
        if not self.adapter or not self.adapter.connected:
            raise RuntimeError("No orchestration system connected")
        external = await self.adapter.spawn(project_id, issue)
        now = datetime.now(UTC)
        task = Task(
            id=str(uuid4()),
            external_session_id=external.session_id,
            adapter_type=self.adapter.adapter_type,
            project_key=normalize_project_key(project_id),
            issue=external.issue,
            status=TaskStatus(external.status),
            pr_url=external.pr_url,
            pr_number=external.pr_number,
            ci_status=external.ci_status,
            review_status=external.review_status,
            worktree_path=external.worktree_path,
            office_session_id=None,
            created_at=now,
            updated_at=now,
        )
        self.tasks[task.id] = task
        await self._broadcast()
        return task

    async def _poll_loop(self) -> None:
        """Poll adapter every N seconds, update tasks, match sessions, broadcast."""
        interval = get_settings().AO_POLL_INTERVAL
        while True:
            await asyncio.sleep(interval)
            if not self.adapter:
                continue
            try:
                sessions = await self.adapter.poll()
                changed = self._update_tasks(sessions)
                if changed:
                    self._match_all_sessions()
                    await self._broadcast()
                self.adapter.connected = True
            except Exception:
                logger.warning("AO poll failed", exc_info=True)
                self.adapter.connected = False

    def _update_tasks(self, sessions: list[ExternalSession]) -> bool:
        """Sync external sessions into internal tasks. Returns True if anything changed."""
        changed = False
        seen_external_ids: set[str] = set()

        for ext in sessions:
            seen_external_ids.add(ext.session_id)

            # Find existing task by external_session_id
            existing = None
            for task in self.tasks.values():
                if task.external_session_id == ext.session_id:
                    existing = task
                    break

            if existing is None:
                # New task discovered via polling
                now = datetime.now(UTC)
                task = Task(
                    id=str(uuid4()),
                    external_session_id=ext.session_id,
                    adapter_type=self.adapter.adapter_type if self.adapter else "unknown",
                    project_key=normalize_project_key(ext.project_id),
                    issue=ext.issue,
                    status=TaskStatus(ext.status),
                    pr_url=ext.pr_url,
                    pr_number=ext.pr_number,
                    ci_status=ext.ci_status,
                    review_status=ext.review_status,
                    worktree_path=ext.worktree_path,
                    office_session_id=None,
                    created_at=now,
                    updated_at=now,
                )
                self.tasks[task.id] = task
                changed = True
            else:
                # Update existing task fields
                new_status = TaskStatus(ext.status)
                if (
                    existing.status != new_status
                    or existing.pr_url != ext.pr_url
                    or existing.pr_number != ext.pr_number
                    or existing.ci_status != ext.ci_status
                    or existing.review_status != ext.review_status
                    or existing.worktree_path != ext.worktree_path
                ):
                    existing.status = new_status
                    existing.pr_url = ext.pr_url
                    existing.pr_number = ext.pr_number
                    existing.ci_status = ext.ci_status
                    existing.review_status = ext.review_status
                    existing.worktree_path = ext.worktree_path
                    existing.updated_at = datetime.now(UTC)
                    changed = True

        return changed

    def _match_all_sessions(self) -> None:
        """Match tasks to office sessions via worktree_path.

        AO worktrees are at e.g. ~/.agent-orchestrator/abc/worktrees/ao-1/
        while project root might be /home/user/my-project. We check if
        worktree_path starts with the session's working dir, or vice versa,
        to handle both AO-managed and regular sessions.
        """
        dirs = _get_session_working_dirs()

        for task in self.tasks.values():
            if not task.worktree_path:
                continue
            for sid, wdir in dirs.items():
                if not wdir:
                    continue
                # Match if either path is a prefix of the other
                if (
                    task.worktree_path.startswith(wdir)
                    or wdir.startswith(task.worktree_path)
                ):
                    if task.office_session_id != sid:
                        task.office_session_id = sid
                    break

    async def _broadcast(self) -> None:
        """Push tasks_update message to all /ws/projects clients."""
        await broadcast_tasks_update(
            tasks=list(self.tasks.values()),
            connected=self.connected,
            adapter_type=self.adapter.adapter_type if self.adapter else None,
        )

    def get_tasks(self, project_key: str | None = None) -> list[Task]:
        """Get all tasks, optionally filtered by project."""
        tasks = list(self.tasks.values())
        if project_key:
            tasks = [t for t in tasks if t.project_key == project_key]
        return sorted(tasks, key=lambda t: t.created_at, reverse=True)


_task_service: TaskService | None = None


def get_task_service() -> TaskService:
    """Get or create the singleton TaskService."""
    global _task_service
    if _task_service is None:
        _task_service = TaskService()
    return _task_service
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_task_service.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add backend/app/services/task_service.py backend/tests/test_task_service.py
git commit -m "feat: add TaskService with lifecycle, polling, and session matching"
```

---

### Task 5: Task API Endpoints + Lifespan Integration

**Files:**
- Create: `backend/app/api/routes/tasks.py`
- Modify: `backend/app/main.py:12` (add tasks import)
- Modify: `backend/app/main.py:31-43` (add task_service to lifespan)
- Modify: `backend/app/main.py:67` (add tasks router)
- Test: `backend/tests/test_tasks_api.py`

- [ ] **Step 1: Write tests for task API endpoints**

Create `backend/tests/test_tasks_api.py`:

```python
"""Tests for /api/v1/tasks endpoints."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, UTC

from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.tasks import Task, TaskStatus
from app.services.task_service import TaskService


def _make_task(**overrides) -> Task:
    defaults = {
        "id": "task-1",
        "external_session_id": "ao-1",
        "adapter_type": "ao",
        "project_key": "my-project",
        "issue": "#42",
        "status": TaskStatus.working,
        "pr_url": None,
        "pr_number": None,
        "ci_status": None,
        "review_status": None,
        "worktree_path": None,
        "office_session_id": None,
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
    }
    defaults.update(overrides)
    return Task(**defaults)


@pytest.fixture
def mock_task_service():
    svc = MagicMock(spec=TaskService)
    svc.connected = True
    svc.adapter = MagicMock()
    svc.adapter.adapter_type = "ao"
    svc.get_tasks.return_value = [_make_task()]
    svc.tasks = {"task-1": _make_task()}
    svc.spawn = AsyncMock()
    svc.adapter.get_projects = AsyncMock(return_value=[{"id": "proj-a", "name": "My Project"}])
    return svc


@pytest.mark.asyncio
class TestTasksAPI:
    async def test_get_status(self, mock_task_service):
        with patch("app.api.routes.tasks.get_task_service", return_value=mock_task_service):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/v1/tasks/status")
                assert resp.status_code == 200
                data = resp.json()
                assert data["connected"] is True
                assert data["adapterType"] == "ao"

    async def test_get_tasks(self, mock_task_service):
        with patch("app.api.routes.tasks.get_task_service", return_value=mock_task_service):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/v1/tasks")
                assert resp.status_code == 200
                data = resp.json()
                assert len(data) == 1
                assert data[0]["projectKey"] == "my-project"

    async def test_get_tasks_not_connected(self, mock_task_service):
        mock_task_service.connected = False
        mock_task_service.adapter = None
        with patch("app.api.routes.tasks.get_task_service", return_value=mock_task_service):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/v1/tasks/status")
                assert resp.status_code == 200
                data = resp.json()
                assert data["connected"] is False

    async def test_spawn_task(self, mock_task_service):
        mock_task_service.spawn.return_value = _make_task(status=TaskStatus.spawning)
        with patch("app.api.routes.tasks.get_task_service", return_value=mock_task_service):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/v1/tasks/spawn",
                    json={"project_id": "my-project", "issue": "#42"},
                )
                assert resp.status_code == 200
                data = resp.json()
                assert data["status"] == "spawning"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_tasks_api.py -v`
Expected: FAIL

- [ ] **Step 3: Implement task API routes**

Create `backend/app/api/routes/tasks.py`:

```python
"""API routes for task orchestration."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.task_service import get_task_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tasks", tags=["tasks"])


class SpawnRequest(BaseModel):
    project_id: str
    issue: str


@router.get("/status")
async def get_status() -> dict:
    """Get orchestration connection status."""
    svc = get_task_service()
    return {
        "connected": svc.connected,
        "adapterType": svc.adapter.adapter_type if svc.adapter else None,
        "taskCount": len(svc.tasks),
    }


@router.get("")
async def get_tasks(project_key: str | None = None) -> list[dict]:
    """List all tasks, optionally filtered by project."""
    svc = get_task_service()
    tasks = svc.get_tasks(project_key=project_key)
    return [t.model_dump(by_alias=True, mode="json") for t in tasks]


@router.post("/spawn")
async def spawn_task(req: SpawnRequest) -> dict:
    """Spawn a new task via the orchestration adapter."""
    svc = get_task_service()
    try:
        task = await svc.spawn(req.project_id, req.issue)
        return task.model_dump(by_alias=True, mode="json")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/projects")
async def get_projects() -> list[dict]:
    """Get projects configured in the external orchestration system."""
    svc = get_task_service()
    if not svc.adapter or not svc.connected:
        return []
    try:
        return await svc.adapter.get_projects()
    except Exception as e:
        logger.warning(f"Failed to fetch AO projects: {e}")
        return []
```

- [ ] **Step 4: Wire up main.py**

In `backend/app/main.py`:

Add import (after line 13, the projects import):
```python
from app.api.routes import agents, events, preferences, projects, sessions, tasks
```
(Replace the existing import line that has `agents, events, preferences, projects, sessions`)

Add to lifespan (after `event_processor.start_stale_agent_checker()`):
```python
    from app.services.task_service import get_task_service
    task_service = get_task_service()
    await task_service.start()
```

Add before `yield` cleanup:
```python
    yield

    await task_service.stop()
    await git_service.stop()
```

Add router (after `app.include_router(projects.router, ...)`):
```python
app.include_router(tasks.router, prefix=f"{settings.API_V1_STR}")
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_tasks_api.py -v`
Expected: All tests PASS

- [ ] **Step 6: Run all backend tests**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/ -x -q`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add backend/app/api/routes/tasks.py backend/app/main.py backend/tests/test_tasks_api.py
git commit -m "feat: add task API endpoints and lifespan integration"
```

---

### Task 6: Frontend Types + Store + WebSocket Integration

**Files:**
- Create: `frontend/src/types/tasks.ts`
- Create: `frontend/src/stores/taskStore.ts`
- Modify: `frontend/src/hooks/useProjectWebSocket.ts:18-26` (handle tasks_update)
- Test: `frontend/tests/taskStore.test.ts`

- [ ] **Step 1: Write tests for taskStore**

Create `frontend/tests/taskStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore } from "@/stores/taskStore";
import type { TasksUpdate, Task } from "@/types/tasks";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    externalSessionId: "ao-1",
    adapterType: "ao",
    projectKey: "my-project",
    issue: "#42 Fix bug",
    status: "working",
    prUrl: null,
    prNumber: null,
    ciStatus: null,
    reviewStatus: null,
    officeSessionId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    worktreePath: null,
    ...overrides,
  };
}

describe("taskStore", () => {
  beforeEach(() => {
    useTaskStore.setState({
      connected: false,
      adapterType: null,
      tasks: [],
      drawerOpen: false,
      drawerHeight: 250,
    });
  });

  it("updates from server", () => {
    const update: TasksUpdate = {
      connected: true,
      adapterType: "ao",
      tasks: [makeTask()],
    };
    useTaskStore.getState().updateFromServer(update);

    const state = useTaskStore.getState();
    expect(state.connected).toBe(true);
    expect(state.adapterType).toBe("ao");
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].projectKey).toBe("my-project");
  });

  it("toggles drawer", () => {
    expect(useTaskStore.getState().drawerOpen).toBe(false);
    useTaskStore.getState().toggleDrawer();
    expect(useTaskStore.getState().drawerOpen).toBe(true);
    useTaskStore.getState().toggleDrawer();
    expect(useTaskStore.getState().drawerOpen).toBe(false);
  });

  it("sets drawer height", () => {
    useTaskStore.getState().setDrawerHeight(400);
    expect(useTaskStore.getState().drawerHeight).toBe(400);
  });

  it("groups tasks by project", () => {
    const update: TasksUpdate = {
      connected: true,
      adapterType: "ao",
      tasks: [
        makeTask({ id: "t1", projectKey: "proj-a" }),
        makeTask({ id: "t2", projectKey: "proj-b" }),
        makeTask({ id: "t3", projectKey: "proj-a" }),
      ],
    };
    useTaskStore.getState().updateFromServer(update);

    const grouped = useTaskStore.getState().tasksByProject;
    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped["proj-a"]).toHaveLength(2);
    expect(grouped["proj-b"]).toHaveLength(1);
  });

  it("counts active tasks", () => {
    const update: TasksUpdate = {
      connected: true,
      adapterType: "ao",
      tasks: [
        makeTask({ id: "t1", status: "working" }),
        makeTask({ id: "t2", status: "merged" }),
        makeTask({ id: "t3", status: "spawning" }),
        makeTask({ id: "t4", status: "done" }),
      ],
    };
    useTaskStore.getState().updateFromServer(update);
    expect(useTaskStore.getState().activeTaskCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/apple/Projects/others/random/claude-office/frontend && npx vitest run tests/taskStore.test.ts`
Expected: FAIL

- [ ] **Step 3: Create types**

Create `frontend/src/types/tasks.ts`:

```typescript
/**
 * Types for orchestrated tasks.
 * Matches backend models in app/models/tasks.py.
 */

export type TaskStatus =
  | "spawning"
  | "working"
  | "pr_open"
  | "ci_failed"
  | "review_pending"
  | "changes_requested"
  | "approved"
  | "merged"
  | "done"
  | "error";

export interface Task {
  id: string;
  externalSessionId: string;
  adapterType: string;
  projectKey: string;
  issue: string | null;
  status: TaskStatus;
  prUrl: string | null;
  prNumber: number | null;
  ciStatus: string | null;
  reviewStatus: string | null;
  worktreePath: string | null;
  officeSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TasksUpdate {
  connected: boolean;
  adapterType: string | null;
  tasks: Task[];
}

/** Active statuses (not terminal). */
export const ACTIVE_TASK_STATUSES: TaskStatus[] = [
  "spawning",
  "working",
  "pr_open",
  "ci_failed",
  "review_pending",
  "changes_requested",
];
```

- [ ] **Step 4: Create taskStore**

Create `frontend/src/stores/taskStore.ts`:

```typescript
"use client";

import { create } from "zustand";
import type { Task, TasksUpdate } from "@/types/tasks";
import { ACTIVE_TASK_STATUSES } from "@/types/tasks";

interface TaskStoreState {
  // State
  connected: boolean;
  adapterType: string | null;
  tasks: Task[];
  drawerOpen: boolean;
  drawerHeight: number;

  // Derived (computed inline via getters)
  readonly tasksByProject: Record<string, Task[]>;
  readonly activeTaskCount: number;

  // Actions
  updateFromServer: (data: TasksUpdate) => void;
  toggleDrawer: () => void;
  setDrawerHeight: (h: number) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const useTaskStore = create<TaskStoreState>((set, get) => ({
  connected: false,
  adapterType: null,
  tasks: [],
  drawerOpen: false,
  drawerHeight: 250,

  get tasksByProject(): Record<string, Task[]> {
    const grouped: Record<string, Task[]> = {};
    for (const task of get().tasks) {
      if (!grouped[task.projectKey]) grouped[task.projectKey] = [];
      grouped[task.projectKey].push(task);
    }
    return grouped;
  },

  get activeTaskCount(): number {
    return get().tasks.filter((t) =>
      ACTIVE_TASK_STATUSES.includes(t.status),
    ).length;
  },

  updateFromServer: (data) =>
    set({
      connected: data.connected,
      adapterType: data.adapterType,
      tasks: data.tasks,
    }),

  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  setDrawerHeight: (h) => set({ drawerHeight: h }),
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}));

// Selectors
export const selectTasks = (s: TaskStoreState) => s.tasks;
export const selectConnected = (s: TaskStoreState) => s.connected;
export const selectDrawerOpen = (s: TaskStoreState) => s.drawerOpen;
export const selectDrawerHeight = (s: TaskStoreState) => s.drawerHeight;
export const selectActiveTaskCount = (s: TaskStoreState) => s.activeTaskCount;
```

- [ ] **Step 5: Add tasks_update handler to useProjectWebSocket**

In `frontend/src/hooks/useProjectWebSocket.ts`, modify the `ws.onmessage` handler (line 18-26):

```typescript
// Add import at top:
import { useTaskStore } from "@/stores/taskStore";

// Inside the hook, add:
const updateTasks = useTaskStore((s) => s.updateFromServer);

// Modify ws.onmessage to also handle tasks_update:
ws.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);
    if (msg.type === "project_state" && msg.data) {
      updateFromServer(msg.data as MultiProjectGameState);
    } else if (msg.type === "tasks_update" && msg.data) {
      updateTasks(msg.data);
    }
  } catch {
    // Ignore parse errors
  }
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/apple/Projects/others/random/claude-office/frontend && npx vitest run tests/taskStore.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add frontend/src/types/tasks.ts frontend/src/stores/taskStore.ts frontend/src/hooks/useProjectWebSocket.ts frontend/tests/taskStore.test.ts
git commit -m "feat: add task types, store, and WebSocket integration"
```

---

### Task 7: TaskDrawer + TaskList + TaskCard + TaskStatusBadge Components

**Files:**
- Create: `frontend/src/components/tasks/TaskStatusBadge.tsx`
- Create: `frontend/src/components/tasks/TaskCard.tsx`
- Create: `frontend/src/components/tasks/TaskList.tsx`
- Create: `frontend/src/components/tasks/TaskDrawer.tsx`
- Modify: `frontend/src/app/page.tsx:488-489` (add TaskDrawer to layout)

- [ ] **Step 1: Create TaskStatusBadge**

Create `frontend/src/components/tasks/TaskStatusBadge.tsx`:

```tsx
import type { TaskStatus } from "@/types/tasks";

const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: string; label: string; color: string }
> = {
  spawning: { icon: "⚪", label: "Spawning", color: "text-slate-400" },
  working: { icon: "🟢", label: "Working", color: "text-emerald-400" },
  pr_open: { icon: "🟣", label: "PR Open", color: "text-purple-400" },
  ci_failed: { icon: "🔴", label: "CI Failed", color: "text-red-400" },
  review_pending: { icon: "🟡", label: "Review Pending", color: "text-yellow-400" },
  changes_requested: { icon: "🟠", label: "Changes Requested", color: "text-orange-400" },
  approved: { icon: "✅", label: "Approved", color: "text-green-400" },
  merged: { icon: "🎉", label: "Merged", color: "text-blue-400" },
  done: { icon: "✔️", label: "Done", color: "text-slate-500" },
  error: { icon: "❌", label: "Error", color: "text-red-500" },
};

interface Props {
  status: TaskStatus;
}

export function TaskStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.error;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${config.color}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
```

- [ ] **Step 2: Create TaskCard**

Create `frontend/src/components/tasks/TaskCard.tsx`:

```tsx
import type { Task } from "@/types/tasks";
import { TaskStatusBadge } from "./TaskStatusBadge";

interface Props {
  task: Task;
}

export function TaskCard({ task }: Props) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-700/30 rounded text-sm">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <TaskStatusBadge status={task.status} />
        <span className="text-slate-200 truncate">
          {task.issue ?? task.externalSessionId}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
        {task.prUrl && task.prNumber && (
          <a
            href={task.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300"
          >
            PR #{task.prNumber}
          </a>
        )}
        {task.ciStatus && (
          <span
            className={
              task.ciStatus === "passing"
                ? "text-green-400"
                : task.ciStatus === "failing"
                  ? "text-red-400"
                  : "text-yellow-400"
            }
          >
            CI {task.ciStatus === "passing" ? "✓" : task.ciStatus === "failing" ? "✗" : "⏳"}
          </span>
        )}
        {task.reviewStatus && (
          <span
            className={
              task.reviewStatus === "approved"
                ? "text-green-400"
                : task.reviewStatus === "changes_requested"
                  ? "text-orange-400"
                  : "text-yellow-400"
            }
          >
            {task.reviewStatus === "approved" ? "Rev ✓" : task.reviewStatus === "changes_requested" ? "Rev ✗" : "Rev ⏳"}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create TaskList**

Create `frontend/src/components/tasks/TaskList.tsx`:

```tsx
import type { Task } from "@/types/tasks";
import { TaskCard } from "./TaskCard";

interface Props {
  tasksByProject: Record<string, Task[]>;
}

export function TaskList({ tasksByProject }: Props) {
  const projectKeys = Object.keys(tasksByProject).sort();

  if (projectKeys.length === 0) {
    return (
      <div className="text-center text-slate-500 text-sm py-4">
        No active tasks
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projectKeys.map((key) => (
        <div key={key}>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide px-2 py-1">
            {key}
          </div>
          {tasksByProject[key].map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create TaskDrawer**

Create `frontend/src/components/tasks/TaskDrawer.tsx`:

```tsx
"use client";

import { useCallback, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useTaskStore } from "@/stores/taskStore";
import { TaskList } from "./TaskList";

const MIN_HEIGHT = 150;
const MAX_HEIGHT_RATIO = 0.5;

export function TaskDrawer() {
  const connected = useTaskStore((s) => s.connected);
  const tasks = useTaskStore((s) => s.tasks);
  const drawerOpen = useTaskStore((s) => s.drawerOpen);
  const drawerHeight = useTaskStore((s) => s.drawerHeight);
  const toggleDrawer = useTaskStore((s) => s.toggleDrawer);
  const setDrawerHeight = useTaskStore((s) => s.setDrawerHeight);
  const activeCount = useTaskStore((s) => s.activeTaskCount);
  const tasksByProject = useTaskStore((s) => s.tasksByProject);

  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Don't render if not connected and no tasks
  if (!connected && tasks.length === 0) return null;

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      startYRef.current = e.clientY;
      startHeightRef.current = drawerHeight;
    },
    [drawerHeight],
  );

  // Drag handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
      const delta = startYRef.current - e.clientY;
      const newHeight = Math.max(MIN_HEIGHT, Math.min(maxH, startHeightRef.current + delta));
      setDrawerHeight(newHeight);
    };
    const handleMouseUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [setDrawerHeight]);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 z-20 flex flex-col"
      style={{ height: drawerOpen ? drawerHeight : 36 }}
    >
      {/* Drag handle */}
      {drawerOpen && (
        <div
          className="h-1.5 cursor-ns-resize bg-slate-700 hover:bg-slate-600 transition-colors flex-shrink-0"
          onMouseDown={handleDragStart}
        />
      )}

      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0 bg-slate-800/80">
        <button
          onClick={toggleDrawer}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
        >
          {drawerOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          <span className="font-bold">Tasks</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-purple-600 text-white rounded-full">
              {activeCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          {!connected && (
            <span className="text-xs text-slate-500">Not connected</span>
          )}
          {connected && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Connected
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {drawerOpen && (
        <div className="flex-1 overflow-y-auto px-2 py-1">
          <TaskList tasksByProject={tasksByProject} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add TaskDrawer to page layout**

In `frontend/src/app/page.tsx`, add import at top:

```typescript
import { TaskDrawer } from "@/components/tasks/TaskDrawer";
```

Find the main desktop content section (the `<div>` containing `<OfficeGame />`), around line 456. Add `<TaskDrawer />` inside the game container div, after `<OfficeGame />`:

The section with `<OfficeGame />` (around line 488) becomes:
```tsx
<div className="flex-grow border border-slate-800 rounded-lg shadow-2xl bg-slate-900 overflow-hidden relative">
  {/* View Mode Toggle */}
  <div className="absolute top-2 left-2 z-10 ...">
    {/* ... existing code ... */}
  </div>

  <OfficeGame />
  <TaskDrawer />
</div>
```

- [ ] **Step 6: Verify frontend compiles**

Run: `cd /Users/apple/Projects/others/random/claude-office/frontend && npx next build --no-lint`
Expected: Build succeeds (or at least no TypeScript errors)

- [ ] **Step 7: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add frontend/src/components/tasks/ frontend/src/app/page.tsx
git commit -m "feat: add TaskDrawer bottom panel with task list and status badges"
```

---

### Task 8: SpawnModal Component

**Files:**
- Create: `frontend/src/components/tasks/SpawnModal.tsx`
- Modify: `frontend/src/components/tasks/TaskDrawer.tsx` (add spawn button + modal)

- [ ] **Step 1: Create SpawnModal**

Create `frontend/src/components/tasks/SpawnModal.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/overlay/Modal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSpawn: (projectId: string, issue: string) => Promise<void>;
}

export function SpawnModal({ isOpen, onClose, onSpawn }: Props) {
  const [projectId, setProjectId] = useState("");
  const [issue, setIssue] = useState("");
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // Fetch AO projects when modal opens
  useEffect(() => {
    if (!isOpen) return;
    fetch("http://localhost:8000/api/v1/tasks/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { id: string; name: string }[]) => {
        setProjects(data);
        if (data.length > 0 && !projectId) {
          setProjectId(data[0].id ?? data[0].name ?? "");
        }
      })
      .catch(() => {});
  }, [isOpen]);

  const handleSpawn = async () => {
    if (!projectId || !issue) return;
    setLoading(true);
    try {
      await onSpawn(projectId, issue);
      setIssue("");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Spawn New Task"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white text-sm font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSpawn}
            disabled={!projectId || !issue || loading}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {loading ? "Spawning..." : "Spawn"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Project</label>
          {projects.length > 0 ? (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            >
              {projects.map((p) => (
                <option key={p.id ?? p.name} value={p.id ?? p.name}>
                  {p.name ?? p.id}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="project-name"
              className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
          )}
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Issue</label>
          <input
            type="text"
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            placeholder="#123 Fix login bug"
            className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            onKeyDown={(e) => e.key === "Enter" && handleSpawn()}
          />
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Add spawn button to TaskDrawer**

In `frontend/src/components/tasks/TaskDrawer.tsx`, add import:

```typescript
import { SpawnModal } from "./SpawnModal";
```

Add state inside the component:

```typescript
const [spawnOpen, setSpawnOpen] = useState(false);

const handleSpawn = async (projectId: string, issue: string) => {
  const res = await fetch("http://localhost:8000/api/v1/tasks/spawn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, issue }),
  });
  if (!res.ok) throw new Error("Spawn failed");
};
```

In the title bar section, add the Spawn button next to the connection status:

```tsx
{connected && (
  <button
    onClick={() => setSpawnOpen(true)}
    className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
  >
    <Plus size={12} />
    Spawn
  </button>
)}
```

Add the modal at the end of the component return, before the closing `</div>`:

```tsx
<SpawnModal
  isOpen={spawnOpen}
  onClose={() => setSpawnOpen(false)}
  onSpawn={handleSpawn}
/>
```

- [ ] **Step 3: Verify frontend compiles**

Run: `cd /Users/apple/Projects/others/random/claude-office/frontend && npx next build --no-lint`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add frontend/src/components/tasks/SpawnModal.tsx frontend/src/components/tasks/TaskDrawer.tsx
git commit -m "feat: add SpawnModal for dispatching new tasks from UI"
```

---

### Task 9: Run Full Test Suite + Final Commit

**Files:** None (validation only)

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 2: Run all frontend tests**

Run: `cd /Users/apple/Projects/others/random/claude-office/frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Run type checks**

Run: `cd /Users/apple/Projects/others/random/claude-office && make checkall`
Expected: All checks pass

- [ ] **Step 4: Final commit if any remaining changes**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add -A
git commit -m "feat: Phase 2 task orchestration integration complete"
```
