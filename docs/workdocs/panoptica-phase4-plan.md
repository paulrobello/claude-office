# Phase 4: Agent Teams Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Claude Code Agent Teams sessions with lead/teammate/subagent visual hierarchy, a live kanban board from real hook events, and multi-session room composition via a new RoomOrchestrator layer.

**Architecture:** Each Claude Code session keeps its own StateMachine (no changes to existing logic). A new `RoomOrchestrator` sits between StateMachines and WebSocket broadcast: it merges all sessions in a room into a single GameState with character types (lead/teammate/subagent) and an aggregated kanban board. Solo sessions get a trivial pass-through orchestrator, preserving existing behavior exactly. A new `/ws/room/{room_id}` WebSocket endpoint delivers merged state to the frontend's RoomView.

**Tech Stack:** Python 3.12 (FastAPI, SQLAlchemy, Pydantic), TypeScript (Next.js 15, PixiJS 8, Zustand), SQLite

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/app/models/events.py` | 3 new EventType values, 4 new EventData fields |
| Modify | `backend/app/models/agents.py` | IDLE state on AgentState; character_type, parent_session_id, parent_id on Agent |
| Modify | `backend/app/models/sessions.py` | KanbanTask model; kanban_tasks list on WhiteboardData |
| Modify | `backend/app/db/models.py` | team_name, teammate_name, is_lead on SessionRecord |
| Create | `backend/tests/test_models_phase4.py` | Model serialization tests |
| Modify | `hooks/manage_hooks.py` | TaskCreated, TaskCompleted, TeammateIdle in HOOK_TYPES |
| Modify | `hooks/src/claude_office_hooks/event_mapper.py` | 3 new handlers; team_name/teammate_name extraction on all events |
| Create | `hooks/tests/test_event_mapper_phase4.py` | Hook mapper tests |
| Modify | `backend/app/core/state_machine.py` | team_name/teammate_name/is_lead fields; kanban_tasks dict; TASK_CREATED/TASK_COMPLETED/TEAMMATE_IDLE handlers; kanban in to_game_state() |
| Create | `backend/tests/test_state_machine_teams.py` | StateMachine team/kanban tests |
| Create | `backend/app/core/room_orchestrator.py` | Multi-session merge, character allocation, kanban aggregation |
| Create | `backend/tests/test_room_orchestrator.py` | Orchestrator tests |
| Modify | `backend/app/core/event_processor.py` | Team detection; teammate room inheritance; orchestrator registry; orchestrator routing |
| Create | `backend/tests/test_team_detection.py` | Team detection + orchestrator routing tests |
| Modify | `backend/app/api/websocket.py` | room_connections dict; connect_room/disconnect_room/broadcast_room |
| Modify | `backend/app/core/broadcast_service.py` | broadcast_room_state function |
| Modify | `backend/app/main.py` | /ws/room/{room_id} WebSocket endpoint |
| Create | `backend/tests/test_websocket_room.py` | Room broadcast tests |
| Modify | `frontend/src/types/index.ts` | WhiteboardMode gains value 11 (kanban) |
| Create | `frontend/src/components/game/whiteboard/KanbanMode.tsx` | Three-column kanban board component |
| Modify | `frontend/src/components/game/whiteboard/WhiteboardModeRegistry.ts` | KANBAN entry; count 11→12 |
| Modify | `frontend/src/components/game/Whiteboard.tsx` | case 11 render; K hotkey |
| Modify | `frontend/src/hooks/useWebSocketEvents.ts` | roomId option; connect to /ws/room/{roomId} |
| Modify | `frontend/src/components/views/RoomView.tsx` | Pass roomId to useWebSocketEvents |
| Modify | `frontend/src/components/game/OfficeGame.tsx` | character_type overlays: crown (lead), badge+nameplate (teammate), shoulder dot (subagent) |

> **DB note:** SQLAlchemy's `create_all` does not alter existing tables. Delete `backend/claude_office.db` before running the backend so the new columns get created.

---

### Task 1: Backend Models — Event Types, Team Fields, Kanban Data

**Files:**
- Modify: `backend/app/models/events.py`
- Modify: `backend/app/models/agents.py`
- Modify: `backend/app/models/sessions.py`
- Modify: `backend/app/db/models.py`
- Create: `backend/tests/test_models_phase4.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_models_phase4.py
"""Tests for Phase 4 model additions: team fields, kanban, character types."""

from app.models.events import EventData, EventType
from app.models.agents import Agent, AgentState
from app.models.sessions import KanbanTask, WhiteboardData
from app.db.models import SessionRecord


class TestNewEventTypes:
    def test_task_created_event_type_exists(self) -> None:
        assert EventType.TASK_CREATED == "task_created"

    def test_task_completed_event_type_exists(self) -> None:
        assert EventType.TASK_COMPLETED == "task_completed"

    def test_teammate_idle_event_type_exists(self) -> None:
        assert EventType.TEAMMATE_IDLE == "teammate_idle"


class TestEventDataTeamFields:
    def test_team_name_field(self) -> None:
        d = EventData(team_name="my-team")
        assert d.team_name == "my-team"

    def test_teammate_name_field(self) -> None:
        d = EventData(teammate_name="implementer")
        assert d.teammate_name == "implementer"

    def test_task_id_field(self) -> None:
        d = EventData(task_id="abc-123")
        assert d.task_id == "abc-123"

    def test_task_subject_field(self) -> None:
        d = EventData(task_subject="Implement login [REC-42]")
        assert d.task_subject == "Implement login [REC-42]"

    def test_team_fields_default_none(self) -> None:
        d = EventData()
        assert d.team_name is None
        assert d.teammate_name is None
        assert d.task_id is None
        assert d.task_subject is None


class TestAgentStateIdle:
    def test_idle_state_exists(self) -> None:
        assert AgentState.IDLE == "idle"


class TestAgentCharacterTypeFields:
    def test_character_type_field(self) -> None:
        a = Agent(id="x", color="#fff", number=0, state=AgentState.WORKING,
                  character_type="teammate")
        assert a.character_type == "teammate"

    def test_parent_session_id_field(self) -> None:
        a = Agent(id="x", color="#fff", number=0, state=AgentState.WORKING,
                  parent_session_id="sess-abc")
        assert a.parent_session_id == "sess-abc"

    def test_parent_id_field(self) -> None:
        a = Agent(id="x", color="#fff", number=0, state=AgentState.WORKING,
                  parent_id="tm-abc123")
        assert a.parent_id == "tm-abc123"

    def test_character_fields_default_none(self) -> None:
        a = Agent(id="x", color="#fff", number=0, state=AgentState.WORKING)
        assert a.character_type is None
        assert a.parent_session_id is None
        assert a.parent_id is None


class TestKanbanTask:
    def test_kanban_task_required_fields(self) -> None:
        t = KanbanTask(task_id="t1", subject="Fix bug", status="pending")
        assert t.task_id == "t1"
        assert t.subject == "Fix bug"
        assert t.status == "pending"

    def test_kanban_task_optional_fields(self) -> None:
        t = KanbanTask(task_id="t2", subject="[REC-42] Add auth",
                       status="in_progress", assignee="implementer",
                       linear_id="REC-42")
        assert t.assignee == "implementer"
        assert t.linear_id == "REC-42"

    def test_kanban_task_defaults(self) -> None:
        t = KanbanTask(task_id="t3", subject="Do stuff", status="completed")
        assert t.assignee is None
        assert t.linear_id is None


class TestWhiteboardDataKanban:
    def test_kanban_tasks_field_defaults_empty(self) -> None:
        w = WhiteboardData()
        assert w.kanban_tasks == []

    def test_kanban_tasks_accepts_list(self) -> None:
        tasks = [KanbanTask(task_id="t1", subject="Work", status="pending")]
        w = WhiteboardData(kanban_tasks=tasks)
        assert len(w.kanban_tasks) == 1
        assert w.kanban_tasks[0].task_id == "t1"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && uv run pytest tests/test_models_phase4.py -v
```

Expected: many `ImportError` / `AttributeError` failures.

- [ ] **Step 3: Add 3 new EventType values and 4 new EventData fields**

In `backend/app/models/events.py`, add after `BACKGROUND_TASK_NOTIFICATION`:

```python
    # Agent Teams events (Phase 4)
    TASK_CREATED = "task_created"
    TASK_COMPLETED = "task_completed"
    TEAMMATE_IDLE = "teammate_idle"
```

Add after the `room_id` field at the bottom of `EventData`:

```python
    # Agent Teams fields (Phase 4) — present on all events from team sessions
    team_name: str | None = None
    teammate_name: str | None = None
    # Task-specific fields for TaskCreated/TaskCompleted events
    task_id: str | None = None
    task_subject: str | None = None
```

- [ ] **Step 4: Add IDLE to AgentState and character fields to Agent**

In `backend/app/models/agents.py`, add after `IN_ELEVATOR`:

```python
    IDLE = "idle"
```

Add after `position` in the `Agent` class:

```python
    # Agent Teams character hierarchy (Phase 4)
    character_type: str | None = None       # "lead" | "teammate" | "subagent"
    parent_session_id: str | None = None    # session that owns this character
    parent_id: str | None = None            # for subagents: parent lead/teammate id
```

- [ ] **Step 5: Add KanbanTask model and kanban_tasks to WhiteboardData**

In `backend/app/models/sessions.py`, add these imports if not already present:

```python
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
```

Add the `KanbanTask` class before `WhiteboardData` (around line 77):

```python
class KanbanTask(BaseModel):
    """A task on the team kanban board."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    task_id: str
    subject: str
    status: str  # "pending" | "in_progress" | "completed"
    assignee: str | None = None    # teammate_name if available
    linear_id: str | None = None   # parsed from subject, e.g. "REC-42"
```

In the `WhiteboardData` class, add after `background_tasks`:

```python
    # Kanban board tasks (Phase 4) — aggregated across all team sessions
    kanban_tasks: list[KanbanTask] = Field(default_factory=list)
```

- [ ] **Step 6: Add team columns to SessionRecord**

In `backend/app/db/models.py`, add these imports at the top if missing:

```python
from sqlalchemy import Boolean
```

Add after `room_id` in `SessionRecord`:

```python
    # Agent Teams fields (Phase 4)
    team_name: Mapped[str | None] = mapped_column(String, nullable=True)
    teammate_name: Mapped[str | None] = mapped_column(String, nullable=True)
    is_lead: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
cd backend && uv run pytest tests/test_models_phase4.py -v
```

Expected: all tests PASS.

- [ ] **Step 8: Regenerate frontend types**

```bash
make gen-types
```

Expected: `frontend/src/types/generated.ts` is updated with new fields.

- [ ] **Step 9: Run full backend check**

```bash
cd backend && uv run pytest tests/ -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add backend/app/models/events.py backend/app/models/agents.py \
    backend/app/models/sessions.py backend/app/db/models.py \
    backend/tests/test_models_phase4.py frontend/src/types/generated.ts
git commit -m "feat(phase4): add team models — EventType, EventData, Agent, KanbanTask, SessionRecord"
```

---

### Task 2: Hooks CLI — Register & Map New Events

**Files:**
- Modify: `hooks/manage_hooks.py`
- Modify: `hooks/src/claude_office_hooks/event_mapper.py`
- Create: `hooks/tests/test_event_mapper_phase4.py`

- [ ] **Step 1: Write failing tests**

First, create the hooks test directory if it doesn't exist:

```bash
mkdir -p hooks/tests && touch hooks/tests/__init__.py
```

```python
# hooks/tests/test_event_mapper_phase4.py
"""Tests for Phase 4 hook event mapping: TaskCreated, TaskCompleted, TeammateIdle."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from claude_office_hooks.event_mapper import map_event


class TestTaskCreatedMapping:
    def test_task_created_returns_payload(self) -> None:
        raw = {
            "session_id": "sess-1",
            "cwd": "/home/user/project",
            "id": "task-abc",
            "content": "Implement login",
        }
        result = map_event("task_created", raw, "sess-1")
        assert result is not None
        assert result["event_type"] == "task_created"

    def test_task_created_extracts_task_id(self) -> None:
        raw = {"session_id": "sess-1", "cwd": "/p", "id": "task-abc", "content": "Do X"}
        result = map_event("task_created", raw, "sess-1")
        assert result["data"]["task_id"] == "task-abc"

    def test_task_created_extracts_task_subject(self) -> None:
        raw = {"session_id": "sess-1", "cwd": "/p", "id": "task-abc", "content": "Do X"}
        result = map_event("task_created", raw, "sess-1")
        assert result["data"]["task_subject"] == "Do X"

    def test_task_created_extracts_team_name(self) -> None:
        raw = {
            "session_id": "sess-1", "cwd": "/p",
            "id": "t1", "content": "Do X",
            "team_name": "my-team",
        }
        result = map_event("task_created", raw, "sess-1")
        assert result["data"]["team_name"] == "my-team"

    def test_task_created_extracts_teammate_name(self) -> None:
        raw = {
            "session_id": "sess-1", "cwd": "/p",
            "id": "t1", "content": "Do X",
            "teammate_name": "implementer",
        }
        result = map_event("task_created", raw, "sess-1")
        assert result["data"]["teammate_name"] == "implementer"


class TestTaskCompletedMapping:
    def test_task_completed_returns_payload(self) -> None:
        raw = {"session_id": "sess-1", "cwd": "/p", "id": "task-abc"}
        result = map_event("task_completed", raw, "sess-1")
        assert result is not None
        assert result["event_type"] == "task_completed"

    def test_task_completed_extracts_task_id(self) -> None:
        raw = {"session_id": "sess-1", "cwd": "/p", "id": "task-abc"}
        result = map_event("task_completed", raw, "sess-1")
        assert result["data"]["task_id"] == "task-abc"


class TestTeammateIdleMapping:
    def test_teammate_idle_returns_payload(self) -> None:
        raw = {
            "session_id": "sess-1", "cwd": "/p",
            "team_name": "my-team", "teammate_name": "reviewer",
        }
        result = map_event("teammate_idle", raw, "sess-1")
        assert result is not None
        assert result["event_type"] == "teammate_idle"

    def test_teammate_idle_extracts_team_fields(self) -> None:
        raw = {
            "session_id": "sess-1", "cwd": "/p",
            "team_name": "my-team", "teammate_name": "reviewer",
        }
        result = map_event("teammate_idle", raw, "sess-1")
        assert result["data"]["team_name"] == "my-team"
        assert result["data"]["teammate_name"] == "reviewer"


class TestTeamFieldsOnAllEvents:
    def test_session_start_includes_team_name_when_present(self) -> None:
        raw = {
            "session_id": "sess-1", "cwd": "/p",
            "team_name": "squad", "teammate_name": "tester",
        }
        result = map_event("session_start", raw, "sess-1")
        assert result is not None
        assert result["data"]["team_name"] == "squad"
        assert result["data"]["teammate_name"] == "tester"

    def test_team_fields_absent_when_not_in_payload(self) -> None:
        raw = {"session_id": "sess-1", "cwd": "/p"}
        result = map_event("session_start", raw, "sess-1")
        assert result is not None
        assert "team_name" not in result["data"] or result["data"].get("team_name") is None
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd hooks && python -m pytest tests/test_event_mapper_phase4.py -v
```

Expected: `AttributeError` or assertion failures — `task_created` not handled.

- [ ] **Step 3: Add new events to HOOK_TYPES in manage_hooks.py**

In `hooks/manage_hooks.py`, find the `HOOK_TYPES` list and add three entries:

```python
HOOK_TYPES = [
    "SessionStart",
    "SessionEnd",
    "PreToolUse",
    "PostToolUse",
    "UserPromptSubmit",
    "PermissionRequest",
    "Notification",
    "Stop",
    "SubagentStart",
    "SubagentStop",
    "PreCompact",
    # Phase 4: Agent Teams
    "TaskCreated",
    "TaskCompleted",
    "TeammateIdle",
]
```

- [ ] **Step 4: Add team field extraction and 3 new handlers to event_mapper.py**

In `hooks/src/claude_office_hooks/event_mapper.py`:

After the last handler function (before `map_event`), add:

```python
def _handle_task_created(raw_data: dict[str, Any], data: dict[str, Any]) -> None:
    """Populate data for a task_created event."""
    # Claude Code may nest task data under "task" key or at top level
    task = raw_data.get("task") or raw_data
    data["task_id"] = task.get("id") or raw_data.get("id")
    data["task_subject"] = task.get("content") or raw_data.get("content")


def _handle_task_completed(raw_data: dict[str, Any], data: dict[str, Any]) -> None:
    """Populate data for a task_completed event."""
    task = raw_data.get("task") or raw_data
    data["task_id"] = task.get("id") or raw_data.get("id")
    data["task_subject"] = task.get("content") or raw_data.get("content")


def _handle_teammate_idle(raw_data: dict[str, Any], data: dict[str, Any]) -> None:
    """Populate data for a teammate_idle event (no extra fields beyond team fields)."""
    pass  # team_name and teammate_name are extracted globally below
```

In `map_event()`, after building the initial `data` dict (after the `task_list_id` extraction block, before the event-specific routing), add global team field extraction:

```python
    # Extract team fields — present on ALL events from Agent Teams sessions
    team_name = raw_data.get("team_name") or os.environ.get("CLAUDE_TEAM_NAME")
    if team_name:
        data["team_name"] = team_name
    teammate_name = raw_data.get("teammate_name") or os.environ.get("CLAUDE_TEAMMATE_NAME")
    if teammate_name:
        data["teammate_name"] = teammate_name
```

In `map_event()`'s event routing block, add the three new cases (before the final `return payload`):

```python
    elif event_type == "task_created":
        _handle_task_created(raw_data, data)

    elif event_type == "task_completed":
        _handle_task_completed(raw_data, data)

    elif event_type == "teammate_idle":
        _handle_teammate_idle(raw_data, data)
```

- [ ] **Step 5: Run tests**

```bash
cd hooks && python -m pytest tests/test_event_mapper_phase4.py -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add hooks/manage_hooks.py hooks/src/claude_office_hooks/event_mapper.py \
    hooks/tests/__init__.py hooks/tests/test_event_mapper_phase4.py
git commit -m "feat(phase4): register TaskCreated/TaskCompleted/TeammateIdle hooks and map team fields"
```

---

### Task 3: StateMachine — Team Fields & Kanban Tracking

**Files:**
- Modify: `backend/app/core/state_machine.py`
- Create: `backend/tests/test_state_machine_teams.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_state_machine_teams.py
"""Tests for Phase 4 StateMachine: team fields and kanban tracking."""

import re

import pytest

from app.core.state_machine import StateMachine
from app.models.agents import BossState
from app.models.events import Event, EventData, EventType


def _make_event(event_type: EventType, **kwargs: object) -> Event:
    return Event(event_type=event_type, session_id="s1", data=EventData(**kwargs))


class TestStateMachineTeamFields:
    def test_team_fields_default_none(self) -> None:
        sm = StateMachine()
        assert sm.team_name is None
        assert sm.teammate_name is None
        assert sm.is_lead is False

    def test_kanban_tasks_default_empty(self) -> None:
        sm = StateMachine()
        assert sm.kanban_tasks == {}


class TestTaskCreatedTransition:
    def test_task_created_adds_kanban_task(self) -> None:
        sm = StateMachine()
        event = _make_event(
            EventType.TASK_CREATED,
            task_id="t1",
            task_subject="Fix login bug",
            team_name="my-team",
        )
        sm.transition(event)
        assert "t1" in sm.kanban_tasks
        assert sm.kanban_tasks["t1"].subject == "Fix login bug"
        assert sm.kanban_tasks["t1"].status == "pending"

    def test_task_created_parses_linear_id(self) -> None:
        sm = StateMachine()
        event = _make_event(
            EventType.TASK_CREATED,
            task_id="t2",
            task_subject="Fix auth [REC-42]",
        )
        sm.transition(event)
        assert sm.kanban_tasks["t2"].linear_id == "REC-42"

    def test_task_created_no_linear_id_when_absent(self) -> None:
        sm = StateMachine()
        event = _make_event(EventType.TASK_CREATED, task_id="t3", task_subject="Plain task")
        sm.transition(event)
        assert sm.kanban_tasks["t3"].linear_id is None

    def test_task_created_stores_assignee_from_teammate_name(self) -> None:
        sm = StateMachine()
        sm.teammate_name = "implementer"
        event = _make_event(EventType.TASK_CREATED, task_id="t4", task_subject="Build X")
        sm.transition(event)
        assert sm.kanban_tasks["t4"].assignee == "implementer"

    def test_task_created_skipped_when_no_task_id(self) -> None:
        sm = StateMachine()
        event = _make_event(EventType.TASK_CREATED, task_subject="No ID")
        sm.transition(event)
        assert len(sm.kanban_tasks) == 0


class TestTaskCompletedTransition:
    def test_task_completed_marks_existing_task(self) -> None:
        sm = StateMachine()
        sm.transition(_make_event(EventType.TASK_CREATED, task_id="t1", task_subject="Work"))
        sm.transition(_make_event(EventType.TASK_COMPLETED, task_id="t1"))
        assert sm.kanban_tasks["t1"].status == "completed"

    def test_task_completed_creates_task_if_unseen(self) -> None:
        sm = StateMachine()
        sm.transition(_make_event(EventType.TASK_COMPLETED, task_id="new-t", task_subject="Done"))
        assert "new-t" in sm.kanban_tasks
        assert sm.kanban_tasks["new-t"].status == "completed"

    def test_task_completed_skipped_when_no_task_id(self) -> None:
        sm = StateMachine()
        sm.transition(_make_event(EventType.TASK_COMPLETED))
        assert len(sm.kanban_tasks) == 0


class TestTeammateIdleTransition:
    def test_teammate_idle_sets_boss_state_idle(self) -> None:
        sm = StateMachine()
        sm.boss_state = BossState.WORKING
        sm.transition(_make_event(EventType.TEAMMATE_IDLE))
        assert sm.boss_state == BossState.IDLE

    def test_teammate_idle_clears_boss_bubble(self) -> None:
        from app.models.common import BubbleContent, BubbleType
        sm = StateMachine()
        sm.boss_bubble = BubbleContent(type=BubbleType.THOUGHT, text="Thinking...")
        sm.transition(_make_event(EventType.TEAMMATE_IDLE))
        assert sm.boss_bubble is None


class TestKanbanInGameState:
    def test_game_state_includes_kanban_tasks(self) -> None:
        sm = StateMachine()
        sm.transition(_make_event(EventType.TASK_CREATED, task_id="t1", task_subject="Work"))
        state = sm.to_game_state("s1")
        assert len(state.whiteboard_data.kanban_tasks) == 1
        assert state.whiteboard_data.kanban_tasks[0].task_id == "t1"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && uv run pytest tests/test_state_machine_teams.py -v
```

Expected: `AttributeError` failures on `team_name`, `kanban_tasks`, etc.

- [ ] **Step 3: Add team fields and kanban_tasks to StateMachine dataclass**

In `backend/app/core/state_machine.py`, add these imports near the top:

```python
import re
from app.models.sessions import KanbanTask
```

After the `room_id` field (around line 168) add:

```python
    # Agent Teams fields (Phase 4)
    team_name: str | None = None
    teammate_name: str | None = None
    is_lead: bool = False
    kanban_tasks: dict[str, KanbanTask] = field(default_factory=dict)
```

Add a module-level constant after the imports:

```python
_LINEAR_ID_RE = re.compile(r'\[([A-Z]+-\d+)\]')
```

Add a module-level helper function (before the `StateMachine` class):

```python
def _parse_linear_id(subject: str) -> str | None:
    """Extract a Linear issue ID like 'REC-42' from a task subject."""
    match = _LINEAR_ID_RE.search(subject)
    return match.group(1) if match else None
```

- [ ] **Step 4: Add transition handlers for TASK_CREATED, TASK_COMPLETED, TEAMMATE_IDLE**

In `StateMachine.transition()`, add after the `CLEANUP` handler (around line 650):

```python
        elif event.event_type == EventType.TASK_CREATED:
            if event.data and event.data.task_id:
                subject = event.data.task_subject or event.data.task_description or ""
                self.kanban_tasks[event.data.task_id] = KanbanTask(
                    task_id=event.data.task_id,
                    subject=subject,
                    status="pending",
                    assignee=self.teammate_name,
                    linear_id=_parse_linear_id(subject),
                )

        elif event.event_type == EventType.TASK_COMPLETED:
            if event.data and event.data.task_id:
                task_id = event.data.task_id
                if task_id in self.kanban_tasks:
                    self.kanban_tasks[task_id].status = "completed"
                else:
                    # Task arrived as completed without a prior TaskCreated event
                    subject = event.data.task_subject or ""
                    self.kanban_tasks[task_id] = KanbanTask(
                        task_id=task_id,
                        subject=subject,
                        status="completed",
                        assignee=self.teammate_name,
                        linear_id=_parse_linear_id(subject),
                    )

        elif event.event_type == EventType.TEAMMATE_IDLE:
            self.boss_state = BossState.IDLE
            self.boss_bubble = None
```

- [ ] **Step 5: Include kanban_tasks in to_game_state()**

In `StateMachine.to_game_state()`, update the `whiteboard_data = WhiteboardData(...)` block to add `kanban_tasks`:

```python
        whiteboard_data = WhiteboardData(
            tool_usage=self.whiteboard.get_tool_usage_snapshot(),
            task_completed_count=self.whiteboard.task_completed_count,
            bug_fixed_count=self.whiteboard.bug_fixed_count,
            coffee_break_count=self.whiteboard.coffee_break_count,
            code_written_count=self.whiteboard.code_written_count,
            recent_error_count=self.whiteboard.recent_error_count,
            recent_success_count=self.whiteboard.recent_success_count,
            activity_level=activity_level,
            consecutive_successes=self.whiteboard.consecutive_successes,
            last_incident_time=self.whiteboard.last_incident_time,
            agent_lifespans=self.whiteboard.get_agent_lifespans_snapshot(),
            news_items=self.whiteboard.get_news_items_snapshot(),
            coffee_cups=self.whiteboard.coffee_cups,
            file_edits=self.whiteboard.get_file_edits_snapshot(),
            background_tasks=self.whiteboard.get_background_tasks_snapshot(),
            kanban_tasks=list(self.kanban_tasks.values()),
        )
```

- [ ] **Step 6: Run tests**

```bash
cd backend && uv run pytest tests/test_state_machine_teams.py tests/test_state_machine.py -v
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/core/state_machine.py backend/tests/test_state_machine_teams.py
git commit -m "feat(phase4): add team fields and kanban tracking to StateMachine"
```

---

### Task 4: RoomOrchestrator — Core Merging & Character Allocation

**Files:**
- Create: `backend/app/core/room_orchestrator.py`
- Create: `backend/tests/test_room_orchestrator.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_room_orchestrator.py
"""Tests for RoomOrchestrator: session merging, character types, kanban aggregation."""

from datetime import datetime

import pytest

from app.core.room_orchestrator import RoomOrchestrator
from app.core.state_machine import StateMachine
from app.models.agents import AgentState, BossState
from app.models.events import Event, EventData, EventType


def _make_sm(team_name: str | None = None, teammate_name: str | None = None,
             is_lead: bool = False) -> StateMachine:
    sm = StateMachine()
    sm.team_name = team_name
    sm.teammate_name = teammate_name
    sm.is_lead = is_lead
    sm.floor_id = "floor-1"
    sm.room_id = "room-1"
    return sm


def _task_created(task_id: str, subject: str) -> Event:
    return Event(
        event_type=EventType.TASK_CREATED,
        session_id="s",
        data=EventData(task_id=task_id, task_subject=subject),
    )

def _task_completed(task_id: str) -> Event:
    return Event(
        event_type=EventType.TASK_COMPLETED,
        session_id="s",
        data=EventData(task_id=task_id),
    )


class TestSoloPassThrough:
    def test_solo_merge_returns_game_state(self) -> None:
        orch = RoomOrchestrator("room-1")
        sm = _make_sm()
        sm.boss_state = BossState.IDLE
        orch.add_session("sess-1", sm)
        state = orch.merge()
        assert state is not None
        assert state.session_id == "sess-1"

    def test_solo_merge_is_pass_through(self) -> None:
        """Solo sessions: no character_type assigned, original agents unchanged."""
        orch = RoomOrchestrator("room-1")
        sm = _make_sm()
        orch.add_session("sess-1", sm)
        state = orch.merge()
        # For solo, agents list has no teammates injected
        teammate_agents = [a for a in state.agents if a.character_type == "teammate"]
        assert len(teammate_agents) == 0

    def test_empty_orchestrator_returns_none(self) -> None:
        orch = RoomOrchestrator("room-1")
        assert orch.merge() is None


class TestTeamMerge:
    def test_lead_boss_stays_as_boss(self) -> None:
        orch = RoomOrchestrator("room-1")
        lead_sm = _make_sm(team_name="squad", is_lead=True)
        lead_sm.boss_state = BossState.WORKING
        orch.add_session("lead-sess", lead_sm)

        tm_sm = _make_sm(team_name="squad", teammate_name="implementer")
        orch.add_session("tm-sess", tm_sm)

        state = orch.merge()
        assert state is not None
        assert state.boss.state == BossState.WORKING

    def test_teammate_boss_appears_as_agent_with_teammate_type(self) -> None:
        orch = RoomOrchestrator("room-1")
        orch.add_session("lead-sess", _make_sm(team_name="squad", is_lead=True))
        tm_sm = _make_sm(team_name="squad", teammate_name="implementer")
        orch.add_session("tm-sess", tm_sm)

        state = orch.merge()
        teammate_agents = [a for a in state.agents if a.character_type == "teammate"]
        assert len(teammate_agents) == 1
        assert teammate_agents[0].name == "implementer"

    def test_lead_subagents_have_subagent_type(self) -> None:
        from app.models.agents import Agent
        orch = RoomOrchestrator("room-1")
        lead_sm = _make_sm(team_name="squad", is_lead=True)
        lead_sm.agents["sub-1"] = Agent(
            id="sub-1", color="#aaa", number=0, state=AgentState.WORKING
        )
        orch.add_session("lead-sess", lead_sm)
        orch.add_session("tm-sess", _make_sm(team_name="squad", teammate_name="tm"))

        state = orch.merge()
        subagent_agents = [a for a in state.agents if a.character_type == "subagent"]
        assert any(a.id == "sub-1" for a in subagent_agents)

    def test_teammate_subagents_linked_to_parent(self) -> None:
        from app.models.agents import Agent
        orch = RoomOrchestrator("room-1")
        orch.add_session("lead-sess", _make_sm(team_name="squad", is_lead=True))
        tm_sm = _make_sm(team_name="squad", teammate_name="tm")
        tm_sm.agents["sub-tm"] = Agent(
            id="sub-tm", color="#aaa", number=0, state=AgentState.WORKING
        )
        orch.add_session("tm-sess", tm_sm)

        state = orch.merge()
        tm_sub = next((a for a in state.agents if a.id == "sub-tm"), None)
        assert tm_sub is not None
        assert tm_sub.character_type == "subagent"
        assert tm_sub.parent_id is not None


class TestKanbanAggregation:
    def test_kanban_tasks_merged_from_all_sessions(self) -> None:
        orch = RoomOrchestrator("room-1")
        lead_sm = _make_sm(team_name="squad", is_lead=True)
        lead_sm.transition(_task_created("t1", "Lead task"))
        orch.add_session("lead-sess", lead_sm)

        tm_sm = _make_sm(team_name="squad", teammate_name="tm")
        tm_sm.teammate_name = "tm"
        tm_sm.transition(_task_created("t2", "TM task"))
        orch.add_session("tm-sess", tm_sm)

        state = orch.merge()
        task_ids = {t.task_id for t in state.whiteboard_data.kanban_tasks}
        assert "t1" in task_ids
        assert "t2" in task_ids

    def test_completed_task_status_preserved(self) -> None:
        orch = RoomOrchestrator("room-1")
        sm = _make_sm(team_name="squad", is_lead=True)
        sm.transition(_task_created("t1", "Work"))
        sm.transition(_task_completed("t1"))
        orch.add_session("lead-sess", sm)
        orch.add_session("tm-sess", _make_sm(team_name="squad", teammate_name="tm"))

        state = orch.merge()
        task = next(t for t in state.whiteboard_data.kanban_tasks if t.task_id == "t1")
        assert task.status == "completed"


class TestSessionLifecycle:
    def test_remove_session(self) -> None:
        orch = RoomOrchestrator("room-1")
        orch.add_session("sess-1", _make_sm())
        orch.remove_session("sess-1")
        assert orch.merge() is None

    def test_update_session(self) -> None:
        orch = RoomOrchestrator("room-1")
        sm = _make_sm()
        orch.add_session("sess-1", sm)
        sm2 = _make_sm()
        sm2.boss_state = BossState.WORKING
        orch.update_session("sess-1", sm2)
        state = orch.merge()
        assert state.boss.state == BossState.WORKING
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && uv run pytest tests/test_room_orchestrator.py -v
```

Expected: `ImportError` — `room_orchestrator` doesn't exist yet.

- [ ] **Step 3: Create room_orchestrator.py**

```python
# backend/app/core/room_orchestrator.py
"""Room-level session orchestration for Agent Teams support.

Merges multiple session StateMachines into a single GameState.
Solo sessions (one session, no team_name) get a trivial pass-through.
Team sessions get lead/teammate/subagent character allocation and a
merged kanban board.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING

from app.models.agents import Agent, AgentState, Boss, BossState, ElevatorState, OfficeState, PhoneState
from app.models.sessions import GameState, KanbanTask, WhiteboardData

if TYPE_CHECKING:
    from app.core.state_machine import StateMachine

logger = logging.getLogger(__name__)

# Colors assigned to teammates in order of arrival (index 0 = first teammate)
_TEAMMATE_COLORS = [
    "#3b82f6",  # blue
    "#22c55e",  # green
    "#a855f7",  # purple
    "#f97316",  # orange
    "#ec4899",  # pink
    "#14b8a6",  # teal
]

# Maps BossState to AgentState for teammate character rendering
_BOSS_TO_AGENT: dict[BossState, AgentState] = {
    BossState.IDLE: AgentState.IDLE,
    BossState.PHONE_RINGING: AgentState.WAITING,
    BossState.ON_PHONE: AgentState.WORKING,
    BossState.RECEIVING: AgentState.THINKING,
    BossState.WORKING: AgentState.WORKING,
    BossState.DELEGATING: AgentState.WORKING,
    BossState.WAITING_PERMISSION: AgentState.WAITING_PERMISSION,
    BossState.REVIEWING: AgentState.WORKING,
    BossState.COMPLETING: AgentState.COMPLETED,
}


@dataclass
class _SessionEntry:
    session_id: str
    sm: StateMachine
    is_lead: bool
    color: str
    teammate_name: str | None


class RoomOrchestrator:
    """Merges all sessions in a room into a single GameState.

    For solo sessions (one session, no team_name), passes through unchanged.
    For team sessions, builds character hierarchy and aggregates kanban board.
    """

    def __init__(self, room_id: str) -> None:
        self.room_id = room_id
        self._sessions: dict[str, _SessionEntry] = {}

    # ------------------------------------------------------------------
    # Session registry
    # ------------------------------------------------------------------

    def add_session(self, session_id: str, sm: StateMachine) -> None:
        """Register a session. Call once when session first joins this room."""
        is_lead = sm.is_lead or (sm.team_name is not None and sm.teammate_name is None)
        if not sm.team_name:
            # No team_name → solo session, treated as lead
            is_lead = True

        color = "#f59e0b" if is_lead else self._next_teammate_color()

        self._sessions[session_id] = _SessionEntry(
            session_id=session_id,
            sm=sm,
            is_lead=is_lead,
            color=color,
            teammate_name=sm.teammate_name,
        )

    def remove_session(self, session_id: str) -> None:
        """Deregister a session."""
        self._sessions.pop(session_id, None)

    def update_session(self, session_id: str, sm: StateMachine) -> None:
        """Update the StateMachine reference for an existing session."""
        if session_id in self._sessions:
            self._sessions[session_id].sm = sm
        else:
            self.add_session(session_id, sm)

    @property
    def is_empty(self) -> bool:
        return len(self._sessions) == 0

    @property
    def _is_solo(self) -> bool:
        return len(self._sessions) <= 1

    # ------------------------------------------------------------------
    # Merge
    # ------------------------------------------------------------------

    def merge(self) -> GameState | None:
        """Return a merged GameState from all sessions, or None if empty."""
        if not self._sessions:
            return None

        lead_entry = self._lead_entry()
        if lead_entry is None:
            return None

        lead_state = lead_entry.sm.to_game_state(lead_entry.session_id)

        if self._is_solo:
            return lead_state

        return self._merge_team(lead_entry, lead_state)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _lead_entry(self) -> _SessionEntry | None:
        for entry in self._sessions.values():
            if entry.is_lead:
                return entry
        # Fallback: first session if no explicit lead
        return next(iter(self._sessions.values()), None)

    def _next_teammate_color(self) -> str:
        teammate_count = sum(1 for e in self._sessions.values() if not e.is_lead)
        return _TEAMMATE_COLORS[teammate_count % len(_TEAMMATE_COLORS)]

    def _merge_team(self, lead_entry: _SessionEntry, lead_state: GameState) -> GameState:
        merged_agents: list[Agent] = []
        all_kanban: dict[str, KanbanTask] = {}

        # Lead's subagents → character_type="subagent"
        for agent in lead_state.agents:
            agent.character_type = "subagent"
            agent.parent_session_id = lead_entry.session_id
            merged_agents.append(agent)

        # Lead's kanban tasks
        for task in lead_entry.sm.kanban_tasks.values():
            all_kanban[task.task_id] = KanbanTask(
                task_id=task.task_id, subject=task.subject, status=task.status,
                assignee=task.assignee, linear_id=task.linear_id,
            )

        desk_number = 0
        for session_id, entry in self._sessions.items():
            if entry.is_lead:
                continue

            tm_state = entry.sm.to_game_state(session_id)
            tm_id = f"tm-{session_id[:8]}"
            agent_state = _BOSS_TO_AGENT.get(tm_state.boss.state, AgentState.WORKING)

            # Teammate's boss → Agent with character_type="teammate"
            merged_agents.append(Agent(
                id=tm_id,
                name=entry.teammate_name or f"Teammate-{session_id[:4]}",
                color=entry.color,
                number=desk_number,
                state=agent_state,
                desk=desk_number,
                bubble=tm_state.boss.bubble,
                current_task=tm_state.boss.current_task,
                character_type="teammate",
                parent_session_id=session_id,
            ))

            # Teammate's subagents
            for agent in tm_state.agents:
                agent.character_type = "subagent"
                agent.parent_session_id = session_id
                agent.parent_id = tm_id
                merged_agents.append(agent)

            # Teammate's kanban tasks
            for task in entry.sm.kanban_tasks.values():
                all_kanban[task.task_id] = KanbanTask(
                    task_id=task.task_id, subject=task.subject, status=task.status,
                    assignee=entry.teammate_name or task.assignee,
                    linear_id=task.linear_id,
                )

            desk_number += 1

        # Infer in_progress for active sessions
        self._infer_in_progress(all_kanban)

        merged_whiteboard = WhiteboardData(
            **lead_state.whiteboard_data.model_dump(exclude={"kanban_tasks"}),
            kanban_tasks=list(all_kanban.values()),
        )
        desk_count = max(8, desk_number + len(merged_agents) + 2)

        return GameState(
            session_id=lead_entry.session_id,
            floor_id=lead_entry.sm.floor_id,
            room_id=lead_entry.sm.room_id,
            boss=lead_state.boss,
            agents=merged_agents,
            office=OfficeState(
                desk_count=desk_count,
                elevator_state=lead_state.office.elevator_state,
                phone_state=lead_state.office.phone_state,
                context_utilization=lead_state.office.context_utilization,
                tool_uses_since_compaction=lead_state.office.tool_uses_since_compaction,
                print_report=lead_state.office.print_report,
            ),
            last_updated=datetime.now(),
            history=lead_state.history,
            todos=lead_state.todos,
            arrival_queue=lead_state.arrival_queue,
            departure_queue=lead_state.departure_queue,
            whiteboard_data=merged_whiteboard,
            conversation=lead_state.conversation,
        )

    def _infer_in_progress(self, tasks: dict[str, KanbanTask]) -> None:
        """Mark the first pending task as in_progress for each active session."""
        active_assignees: set[str | None] = set()
        for entry in self._sessions.values():
            if entry.sm.boss_state not in (BossState.IDLE, BossState.COMPLETING):
                active_assignees.add(entry.teammate_name)

        promoted: set[str | None] = set()
        for task in tasks.values():
            if task.status == "pending" and task.assignee in active_assignees:
                if task.assignee not in promoted:
                    task.status = "in_progress"
                    promoted.add(task.assignee)
```

- [ ] **Step 4: Run tests**

```bash
cd backend && uv run pytest tests/test_room_orchestrator.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Run full backend tests**

```bash
cd backend && uv run pytest tests/ -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/room_orchestrator.py backend/tests/test_room_orchestrator.py
git commit -m "feat(phase4): add RoomOrchestrator for multi-session merging and kanban aggregation"
```

---

### Task 5: EventProcessor — Team Detection & Orchestrator Routing

**Files:**
- Modify: `backend/app/core/event_processor.py`
- Create: `backend/tests/test_team_detection.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_team_detection.py
"""Tests for team detection and orchestrator routing in EventProcessor."""

import asyncio
import pytest
import pytest_asyncio

from app.core.event_processor import EventProcessor
from app.core.room_orchestrator import RoomOrchestrator
from app.models.events import Event, EventData, EventType


def _make_event(event_type: EventType, session_id: str = "s1", **kwargs: object) -> Event:
    return Event(
        event_type=event_type,
        session_id=session_id,
        data=EventData(**kwargs),
    )


class TestTeamDetection:
    @pytest.mark.asyncio
    async def test_lead_session_detected_when_no_teammate_name(self) -> None:
        ep = EventProcessor()
        event = _make_event(
            EventType.SESSION_START, session_id="lead-sess",
            team_name="squad", project_name="myapp",
        )
        await ep.process_event(event)
        sm = ep.sessions.get("lead-sess")
        assert sm is not None
        assert sm.team_name == "squad"
        assert sm.is_lead is True

    @pytest.mark.asyncio
    async def test_teammate_session_detected_when_teammate_name_present(self) -> None:
        ep = EventProcessor()
        event = _make_event(
            EventType.SESSION_START, session_id="tm-sess",
            team_name="squad", teammate_name="implementer", project_name="myapp",
        )
        await ep.process_event(event)
        sm = ep.sessions.get("tm-sess")
        assert sm is not None
        assert sm.team_name == "squad"
        assert sm.teammate_name == "implementer"
        assert sm.is_lead is False

    @pytest.mark.asyncio
    async def test_orchestrator_created_for_room(self) -> None:
        ep = EventProcessor()
        # Solo session gets an orchestrator for its room
        event = _make_event(
            EventType.SESSION_START, session_id="solo-sess",
            project_name="panoptica",
        )
        await ep.process_event(event)
        sm = ep.sessions.get("solo-sess")
        if sm and sm.room_id:
            assert sm.room_id in ep.orchestrators


class TestOrchestratorUpdated:
    @pytest.mark.asyncio
    async def test_orchestrator_updated_on_event(self) -> None:
        ep = EventProcessor()
        event = _make_event(
            EventType.SESSION_START, session_id="s1",
            project_name="myapp",
        )
        await ep.process_event(event)
        sm = ep.sessions.get("s1")
        if sm and sm.room_id:
            orch = ep.orchestrators.get(sm.room_id)
            assert orch is not None
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && uv run pytest tests/test_team_detection.py -v
```

Expected: AttributeError on `ep.orchestrators`.

- [ ] **Step 3: Add orchestrators dict to EventProcessor**

In `backend/app/core/event_processor.py`, add the import near the top:

```python
from app.core.room_orchestrator import RoomOrchestrator
```

In `EventProcessor.__init__()`, add after `self.sessions`:

```python
        self.orchestrators: dict[str, RoomOrchestrator] = {}  # room_id -> orchestrator
```

- [ ] **Step 4: Add team field syncing in _persist_event**

In `EventProcessor._persist_event()`, after the block that updates `SessionRecord` with `floor_id`/`room_id` (around line 554–580), add:

```python
            # Sync team fields to SessionRecord
            if event.data.team_name:
                record.team_name = event.data.team_name
                record.teammate_name = event.data.teammate_name
                # Lead: teammate_name absent in payload
                record.is_lead = (event.data.teammate_name is None)
```

- [ ] **Step 5: Add team field propagation and orchestrator routing in _process_event_internal**

In `EventProcessor._process_event_internal()`, after the block that syncs room assignment from the DB (around line 246–257), add:

```python
            # Sync team identity from SessionRecord to StateMachine
            async with AsyncSession(get_engine()) as sess:
                record = await sess.get(SessionRecord, session_id)
                if record:
                    if record.team_name and not sm.team_name:
                        sm.team_name = record.team_name
                        sm.teammate_name = record.teammate_name
                        sm.is_lead = record.is_lead

                    # Teammate inherits lead's room assignment
                    if record.team_name and not record.is_lead and not sm.room_id:
                        lead = await _find_lead_session(sess, record.team_name)
                        if lead and lead.room_id:
                            sm.room_id = lead.room_id
                            sm.floor_id = lead.floor_id
                            record.room_id = lead.room_id
                            record.floor_id = lead.floor_id
                            await sess.commit()
```

Add this helper function before the class or as a module-level function:

```python
async def _find_lead_session(
    sess: Any, team_name: str
) -> "SessionRecord | None":
    """Find the lead session for a team."""
    from sqlalchemy import select
    from app.db.models import SessionRecord
    result = await sess.execute(
        select(SessionRecord).where(
            SessionRecord.team_name == team_name,
            SessionRecord.is_lead.is_(True),
        ).limit(1)
    )
    return result.scalar_one_or_none()
```

After the existing `broadcast_state(session_id, sm)` call, add orchestrator update and room broadcast:

```python
            # Update orchestrator and broadcast room-level state
            if sm.room_id:
                if sm.room_id not in self.orchestrators:
                    self.orchestrators[sm.room_id] = RoomOrchestrator(sm.room_id)
                orch = self.orchestrators[sm.room_id]
                orch.update_session(session_id, sm)
                await broadcast_room_state(sm.room_id, orch)
```

- [ ] **Step 6: Handle session cleanup for orchestrators**

In `EventProcessor.remove_session()`, add orchestrator cleanup:

```python
    def remove_session(self, session_id: str) -> None:
        sm = self.sessions.pop(session_id, None)
        if sm and sm.room_id and sm.room_id in self.orchestrators:
            self.orchestrators[sm.room_id].remove_session(session_id)
            if self.orchestrators[sm.room_id].is_empty:
                del self.orchestrators[sm.room_id]
```

- [ ] **Step 7: Run tests**

```bash
cd backend && uv run pytest tests/test_team_detection.py tests/ -v --tb=short
```

Expected: all tests PASS. (The `broadcast_room_state` import will fail until Task 6 — so scope the run to tests that don't require it, or add a stub for now. See note below.)

> **Note:** `broadcast_room_state` is added in Task 6. If the import fails, temporarily stub it: `async def broadcast_room_state(room_id, orch): pass` in broadcast_service.py.

- [ ] **Step 8: Commit**

```bash
git add backend/app/core/event_processor.py backend/tests/test_team_detection.py
git commit -m "feat(phase4): team detection, teammate room inheritance, orchestrator routing in EventProcessor"
```

---

### Task 6: WebSocket — Room Subscription & Broadcasting

**Files:**
- Modify: `backend/app/api/websocket.py`
- Modify: `backend/app/core/broadcast_service.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_websocket_room.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_websocket_room.py
"""Tests for room-level WebSocket connection management."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.api.websocket import ConnectionManager


class TestRoomConnections:
    @pytest.mark.asyncio
    async def test_connect_room_registers_connection(self) -> None:
        mgr = ConnectionManager()
        ws = MagicMock()
        ws.client_state = MagicMock()
        await mgr.connect_room(ws, "room-1")
        assert "room-1" in mgr.room_connections
        assert ws in mgr.room_connections["room-1"]

    @pytest.mark.asyncio
    async def test_disconnect_room_removes_connection(self) -> None:
        mgr = ConnectionManager()
        ws = MagicMock()
        ws.client_state = MagicMock()
        await mgr.connect_room(ws, "room-1")
        await mgr.disconnect_room(ws, "room-1")
        assert "room-1" not in mgr.room_connections

    @pytest.mark.asyncio
    async def test_broadcast_room_sends_to_room_connections(self) -> None:
        mgr = ConnectionManager()
        ws = AsyncMock()
        from starlette.websockets import WebSocketState
        ws.client_state = WebSocketState.CONNECTED
        await mgr.connect_room(ws, "room-1")
        await mgr.broadcast_room({"type": "test"}, "room-1")
        ws.send_json.assert_called_once_with({"type": "test"})

    @pytest.mark.asyncio
    async def test_broadcast_room_noop_when_no_connections(self) -> None:
        mgr = ConnectionManager()
        # Should not raise
        await mgr.broadcast_room({"type": "test"}, "room-with-no-subs")
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && uv run pytest tests/test_websocket_room.py -v
```

Expected: `AttributeError` — `connect_room` doesn't exist yet.

- [ ] **Step 3: Add room connection methods to ConnectionManager**

In `backend/app/api/websocket.py`, add `room_connections` to `__init__`:

```python
    def __init__(self) -> None:
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.room_connections: dict[str, list[WebSocket]] = {}
        self._lock = asyncio.Lock()
```

Add these three methods after `broadcast_all`:

```python
    async def connect_room(self, websocket: WebSocket, room_id: str) -> None:
        """Accept a WebSocket and register it for room-level broadcasts."""
        await websocket.accept()
        async with self._lock:
            if room_id not in self.room_connections:
                self.room_connections[room_id] = []
            self.room_connections[room_id].append(websocket)

    async def disconnect_room(self, websocket: WebSocket, room_id: str) -> None:
        """Remove a WebSocket from room-level subscriptions."""
        async with self._lock:
            if room_id in self.room_connections:
                if websocket in self.room_connections[room_id]:
                    self.room_connections[room_id].remove(websocket)
                if not self.room_connections[room_id]:
                    del self.room_connections[room_id]

    async def broadcast_room(self, message: dict[str, Any], room_id: str) -> None:
        """Send a message to all WebSocket connections subscribed to a room."""
        async with self._lock:
            connections = self.room_connections.get(room_id, []).copy()

        if not connections:
            return

        failed: list[WebSocket] = []
        for connection in connections:
            try:
                if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to room WebSocket: {e}")
                failed.append(connection)

        if failed:
            async with self._lock:
                if room_id in self.room_connections:
                    for conn in failed:
                        if conn in self.room_connections[room_id]:
                            self.room_connections[room_id].remove(conn)
                    if not self.room_connections[room_id]:
                        del self.room_connections[room_id]
```

- [ ] **Step 4: Add broadcast_room_state to broadcast_service.py**

In `backend/app/core/broadcast_service.py`, add the import and function:

```python
from app.core.room_orchestrator import RoomOrchestrator
```

Add at the end of the file:

```python
async def broadcast_room_state(room_id: str, orchestrator: RoomOrchestrator) -> None:
    """Broadcast merged room state to all room-level WebSocket subscribers.

    Args:
        room_id: The room whose subscribers should receive the update.
        orchestrator: The RoomOrchestrator holding merged state.
    """
    merged_state = orchestrator.merge()
    if merged_state is None:
        return
    await manager.broadcast_room(
        {
            "type": "state_update",
            "timestamp": merged_state.last_updated.isoformat(),
            "state": merged_state.model_dump(mode="json", by_alias=True),
        },
        room_id,
    )
```

- [ ] **Step 5: Add /ws/room/{room_id} endpoint to main.py**

In `backend/app/main.py`, after the existing `/ws/{session_id}` endpoint, add:

```python
@app.websocket("/ws/room/{room_id}")
async def websocket_room_endpoint(websocket: WebSocket, room_id: str) -> None:
    """Room-level WebSocket: sends merged GameState for all sessions in a room."""
    await manager.connect_room(websocket, room_id)

    # Send current merged state immediately if available
    orch = event_processor.orchestrators.get(room_id)
    if orch:
        merged = orch.merge()
        if merged:
            await manager.send_personal_message(
                {
                    "type": "state_update",
                    "timestamp": merged.last_updated.isoformat(),
                    "state": merged.model_dump(mode="json", by_alias=True),
                },
                websocket,
            )

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect_room(websocket, room_id)
```

- [ ] **Step 6: Add broadcast_room_state import to event_processor.py**

In `backend/app/core/event_processor.py`, ensure this import exists:

```python
from app.core.broadcast_service import broadcast_event, broadcast_room_state, broadcast_state
```

- [ ] **Step 7: Run tests**

```bash
cd backend && uv run pytest tests/test_websocket_room.py tests/ -v --tb=short
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/websocket.py backend/app/core/broadcast_service.py \
    backend/app/main.py backend/tests/test_websocket_room.py \
    backend/app/core/event_processor.py
git commit -m "feat(phase4): room-level WebSocket endpoint and broadcast for RoomOrchestrator"
```

---

### Task 7: Frontend — Kanban Whiteboard Mode

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/components/game/whiteboard/KanbanMode.tsx`
- Modify: `frontend/src/components/game/whiteboard/WhiteboardModeRegistry.ts`
- Modify: `frontend/src/components/game/Whiteboard.tsx`

- [ ] **Step 1: Add WhiteboardMode value 11**

In `frontend/src/types/index.ts`, update the `WhiteboardMode` type:

```typescript
export type WhiteboardMode =
  | 0  // Todo List — hotkey T
  | 1  // Remote Workers (background tasks) — hotkey B
  | 2  // Tool Pizza
  | 3  // Org Chart
  | 4  // Stonks
  | 5  // Weather
  | 6  // Safety Board
  | 7  // Timeline
  | 8  // News Ticker
  | 9  // Coffee
  | 10 // Heat Map
  | 11; // Kanban Board — hotkey K
```

- [ ] **Step 2: Add KANBAN entry to WhiteboardModeRegistry.ts**

In `frontend/src/components/game/whiteboard/WhiteboardModeRegistry.ts`, add to `MODE_INFO`:

```typescript
export const MODE_INFO: Record<WhiteboardMode, ModeInfo> = {
  0: { name: "TODO", icon: "📋" },
  1: { name: "REMOTE", icon: "📹" },
  2: { name: "TOOL USE", icon: "🍕" },
  3: { name: "ORG", icon: "📊" },
  4: { name: "STONKS", icon: "📈" },
  5: { name: "WEATHER", icon: "🌤️" },
  6: { name: "SAFETY", icon: "⚠️" },
  7: { name: "TIMELINE", icon: "📅" },
  8: { name: "NEWS", icon: "📰" },
  9: { name: "COFFEE", icon: "☕" },
  10: { name: "HEATMAP", icon: "🔥" },
  11: { name: "KANBAN", icon: "📌" },
};

export const WHITEBOARD_MODE_COUNT = 12;
```

- [ ] **Step 3: Create KanbanMode.tsx**

```tsx
// frontend/src/components/game/whiteboard/KanbanMode.tsx
"use client";

/**
 * KanbanMode - Three-column kanban board for team tasks.
 *
 * Shows tasks from whiteboard_data.kanbanTasks in three columns:
 * Todo | In Progress | Done
 *
 * Each task is a sticky note with subject, Linear badge if detected,
 * and assignee name.
 */

import { Container, Graphics, Text } from "pixi.js";
import { useCallback, type ReactNode } from "react";
import { extend, useApp } from "@pixi/react";
import { useGameStore } from "@/stores/gameStore";
import type { KanbanTask } from "@/types";

extend({ Container, Graphics, Text });

// ============================================================================
// CONSTANTS
// ============================================================================

const BOARD_W = 320;
const BOARD_H = 180;
const COL_W = 100;
const COL_PAD = 6;
const NOTE_H = 36;
const NOTE_GAP = 4;

const COL_DEFS = [
  { status: "pending",     label: "TODO",        color: 0x64748b, textColor: 0x94a3b8 },
  { status: "in_progress", label: "IN PROGRESS",  color: 0x3b82f6, textColor: 0x60a5fa },
  { status: "completed",   label: "DONE",         color: 0x22c55e, textColor: 0x4ade80 },
] as const;

// ============================================================================
// COMPONENT
// ============================================================================

export function KanbanMode(): ReactNode {
  const whiteboardData = useGameStore((s) => s.whiteboardData);
  const tasks: KanbanTask[] = (whiteboardData as { kanbanTasks?: KanbanTask[] }).kanbanTasks ?? [];

  const drawBoard = useCallback((g: Graphics) => {
    g.clear();
    g.rect(0, 0, BOARD_W, BOARD_H);
    g.fill({ color: 0x0f172a });
  }, []);

  const drawColumn = useCallback(
    (g: Graphics, colIndex: number) => {
      const x = COL_PAD + colIndex * (COL_W + COL_PAD);
      const col = COL_DEFS[colIndex];
      g.clear();
      // Column header background
      g.rect(x, 4, COL_W, 18);
      g.fill({ color: col.color, alpha: 0.15 });
      // Column border
      g.rect(x, 4, COL_W, BOARD_H - 8);
      g.stroke({ color: col.color, alpha: 0.2, width: 1 });
    },
    [],
  );

  return (
    <pixiContainer x={0} y={0}>
      <pixiGraphics draw={drawBoard} />

      {COL_DEFS.map((col, colIndex) => {
        const colTasks = tasks.filter((t) => t.status === col.status);
        const x = COL_PAD + colIndex * (COL_W + COL_PAD);

        return (
          <pixiContainer key={col.status} x={x} y={4}>
            {/* Column header */}
            <pixiText
              text={col.label}
              style={{
                fontSize: 7,
                fill: col.textColor,
                fontFamily: "monospace",
                fontWeight: "bold",
              }}
              x={4}
              y={4}
            />
            {/* Task sticky notes */}
            {colTasks.slice(0, 4).map((task, taskIndex) => (
              <KanbanNote
                key={task.taskId}
                task={task}
                y={22 + taskIndex * (NOTE_H + NOTE_GAP)}
                colColor={col.color}
              />
            ))}
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
}

// ============================================================================
// STICKY NOTE
// ============================================================================

interface KanbanNoteProps {
  task: KanbanTask;
  y: number;
  colColor: number;
}

function KanbanNote({ task, y, colColor }: KanbanNoteProps): ReactNode {
  const drawNote = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 0, COL_W - 4, NOTE_H);
      g.fill({ color: 0x1e293b });
      g.rect(0, 0, COL_W - 4, NOTE_H);
      g.stroke({ color: colColor, alpha: 0.3, width: 1 });
    },
    [colColor],
  );

  // Truncate subject to fit
  const subject = task.subject.length > 28 ? task.subject.slice(0, 26) + "…" : task.subject;

  return (
    <pixiContainer x={2} y={y}>
      <pixiGraphics draw={drawNote} />
      {/* Linear badge */}
      {task.linearId && (
        <pixiText
          text={task.linearId}
          style={{ fontSize: 6, fill: 0xf59e0b, fontFamily: "monospace" }}
          x={3}
          y={3}
        />
      )}
      {/* Task subject */}
      <pixiText
        text={subject}
        style={{ fontSize: 7, fill: 0xe2e8f0, fontFamily: "monospace", wordWrap: true, wordWrapWidth: COL_W - 8 }}
        x={3}
        y={task.linearId ? 12 : 4}
      />
      {/* Assignee */}
      {task.assignee && (
        <pixiText
          text={task.assignee}
          style={{ fontSize: 6, fill: 0x64748b, fontFamily: "monospace" }}
          x={3}
          y={NOTE_H - 10}
        />
      )}
    </pixiContainer>
  );
}
```

- [ ] **Step 4: Add case 11 and K hotkey to Whiteboard.tsx**

In `frontend/src/components/game/Whiteboard.tsx`, update the top comment:

```typescript
 * Keyboard shortcuts: 0-9 jump to that mode, T = Todo, B = Background Tasks, K = Kanban
```

In the imports, add `KanbanMode`:

```typescript
import { KanbanMode } from "./whiteboard/KanbanMode";
```

In the `handleKeyDown` switch statement, add after `case "b"`:

```typescript
        case "k":
          setMode(11);
          break;
```

In the `renderMode()` switch, add after `case 10`:

```typescript
      case 11:
        return <KanbanMode />;
```

- [ ] **Step 5: Check TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Check lint**

```bash
cd frontend && npx next lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/index.ts \
    frontend/src/components/game/whiteboard/WhiteboardModeRegistry.ts \
    frontend/src/components/game/whiteboard/KanbanMode.tsx \
    frontend/src/components/game/Whiteboard.tsx
git commit -m "feat(phase4): kanban whiteboard mode (K key, mode 11) with Linear badge support"
```

---

### Task 8: Frontend — Room WebSocket & Character Type Rendering

**Files:**
- Modify: `frontend/src/hooks/useWebSocketEvents.ts`
- Modify: `frontend/src/components/views/RoomView.tsx`
- Modify: `frontend/src/components/game/OfficeGame.tsx`

- [ ] **Step 1: Add roomId option to useWebSocketEvents**

In `frontend/src/hooks/useWebSocketEvents.ts`, find the `UseWebSocketEventsOptions` interface (around line 25) and add `roomId`:

```typescript
interface UseWebSocketEventsOptions {
  sessionId: string;
  roomId?: string;
  enabled?: boolean;
}
```

In the hook function signature (around line 34), destructure `roomId`:

```typescript
export function useWebSocketEvents({
  sessionId,
  roomId,
  enabled = true,
}: UseWebSocketEventsOptions): void {
```

In the `connect()` function, find where the WebSocket URL is built (around line 405) and update it:

```typescript
    const wsUrl = roomId
      ? `ws://localhost:8000/ws/room/${roomId}`
      : `ws://localhost:8000/ws/${sessionId}`;
    const ws = new WebSocket(wsUrl);
```

Update the dependency that determines when to reconnect. Find the `useEffect` that calls `connect()` and add `roomId` to the deps array:

```typescript
  }, [connect, sessionId, roomId, enabled]);
```

- [ ] **Step 2: Update RoomView to use roomId WebSocket**

In `frontend/src/components/views/RoomView.tsx`, read the full file and update the `useWebSocketEvents` call to pass `roomId`:

```typescript
// Replace the existing:
// useWebSocketEvents({ sessionId });
// With:
useWebSocketEvents({ sessionId, roomId: roomId ?? undefined });
```

where `roomId` comes from `useNavigationStore((s) => s.roomId)`. Verify this is already available in the component (it is, from existing Phase 3 code).

- [ ] **Step 3: Add character type overlay rendering to OfficeGame.tsx**

In `frontend/src/components/game/OfficeGame.tsx`, import character type utilities at the top:

```typescript
import { useShallow } from "zustand/react/shallow";
```

Find the agents rendering section (around line 399–427). Inside the agent render loop, add character type overlays based on `agent.characterType`. Add after each agent sprite render:

```typescript
{/* Lead crown overlay */}
{agent.characterType === "lead" && (
  <pixiText
    text="👑"
    style={{ fontSize: 14 }}
    x={agent.currentPosition.x - 8}
    y={agent.currentPosition.y - 52}
    zIndex={agent.currentPosition.y + 10}
  />
)}

{/* Teammate badge overlay */}
{agent.characterType === "teammate" && (
  <>
    <pixiText
      text="🎖️"
      style={{ fontSize: 10 }}
      x={agent.currentPosition.x - 6}
      y={agent.currentPosition.y - 46}
      zIndex={agent.currentPosition.y + 10}
    />
    {/* Teammate nameplate */}
    {agent.name && (
      <pixiText
        text={agent.name}
        style={{
          fontSize: 7,
          fill: agent.color ?? "#3b82f6",
          fontFamily: "monospace",
          fontWeight: "bold",
        }}
        x={agent.currentPosition.x - 18}
        y={agent.currentPosition.y - 34}
        zIndex={agent.currentPosition.y + 11}
      />
    )}
  </>
)}

{/* Subagent shoulder dot */}
{agent.characterType === "subagent" && (() => {
  // Find parent agent color for the dot
  const parentAgent = agent.parentId
    ? Array.from(agents.values()).find((a) => a.id === agent.parentId)
    : null;
  const dotColor = parentAgent?.color ?? "#f59e0b";
  return (
    <pixiGraphics
      draw={(g) => {
        g.clear();
        g.circle(0, 0, 4);
        g.fill({ color: parseInt(dotColor.replace("#", "0x"), 16) });
        g.circle(0, 0, 4);
        g.stroke({ color: 0xffffff, alpha: 0.4, width: 1 });
      }}
      x={agent.currentPosition.x + 10}
      y={agent.currentPosition.y - 28}
      zIndex={agent.currentPosition.y + 12}
    />
  );
})()}
```

> **Note:** The exact location within the agent render loop depends on OfficeGame.tsx's current structure. Find where each `<Agent>` sprite is rendered (around line 399–427 in the y-sorted container) and add the overlays adjacent to each agent's sprite. The `agent.characterType` and `agent.parentId` fields come from the backend via GameState and are already present in the `AgentAnimationState` type after `make gen-types` in Task 1.

- [ ] **Step 4: Add characterType and parentId to AgentAnimationState in gameStore**

In `frontend/src/stores/gameStore.ts`, find the `AgentAnimationState` interface (around line 45–93) and add:

```typescript
  // Agent Teams character hierarchy (Phase 4)
  characterType?: string | null;    // "lead" | "teammate" | "subagent" | null
  parentSessionId?: string | null;
  parentId?: string | null;
```

In the store's agent creation/update logic (find where `AgentAnimationState` is populated from backend `Agent`), propagate these fields:

```typescript
  characterType: backendAgent.characterType ?? null,
  parentSessionId: backendAgent.parentSessionId ?? null,
  parentId: backendAgent.parentId ?? null,
```

- [ ] **Step 5: TypeScript and lint check**

```bash
cd frontend && npx tsc --noEmit && npx next lint
```

Expected: no errors.

- [ ] **Step 6: Run full checks**

```bash
make checkall
```

Expected: backend tests pass, frontend compiles and lints clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useWebSocketEvents.ts \
    frontend/src/components/views/RoomView.tsx \
    frontend/src/components/game/OfficeGame.tsx \
    frontend/src/stores/gameStore.ts
git commit -m "feat(phase4): room WebSocket subscription and character type overlays (crown/badge/dot)"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|-----------|
| TaskCreated/TaskCompleted/TeammateIdle hooks | Task 2 |
| team_name/teammate_name on all events | Task 2 (global extraction) |
| team_name/teammate_name/is_lead on SessionRecord | Task 1 |
| team_name/teammate_name/is_lead on StateMachine | Task 3 |
| Lead detection: teammate_name absent = lead | Task 5 (_persist_event) |
| Teammate inherits lead's room assignment | Task 5 |
| RoomOrchestrator created per room | Task 5 |
| Lead/teammate/subagent character types in merge | Task 4 |
| KanbanBoard: TaskCreated adds pending task | Task 3 |
| KanbanBoard: TaskCompleted marks completed | Task 3 |
| Linear ID parsing `[XXX-NNN]` | Task 3 (state_machine) + Task 7 (frontend badge) |
| in_progress inference from session activity | Task 4 (_infer_in_progress) |
| subscribe_room / room WebSocket | Task 6 (/ws/room/{room_id}) |
| kanban_tasks in whiteboard_data | Tasks 1, 3, 4 |
| K hotkey → kanban whiteboard mode | Task 7 |
| Lead: crown sprite | Task 8 |
| Teammate: badge + nameplate | Task 8 |
| Subagent: shoulder dot with parent color | Task 8 |
| Solo sessions: pass-through orchestrator | Task 4 (_is_solo) |
| Backward compat session WebSocket | Untouched (existing /ws/{session_id}) |

**No placeholder scan:** All steps contain actual code. No "TBD" or "implement later."

**Type consistency:** `KanbanTask` used consistently in sessions.py, state_machine.py, room_orchestrator.py. `character_type` field uses `str | None` throughout (backend) and `string | null` (frontend). `broadcast_room_state` signature matches across broadcast_service.py, event_processor.py, and main.py.
