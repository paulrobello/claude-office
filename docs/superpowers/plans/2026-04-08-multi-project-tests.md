# Multi-Project Office — Supplementary Tests Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add missing unit and integration tests for the multi-project office feature (Phase 1) — both backend and frontend.

**Architecture:** Backend tests use pytest + AsyncMock for integration scenarios (broadcast, multi-session lifecycle, transcript watcher integration). Frontend tests use Vitest for projectStore, getRoomGridSize, and selectActiveProject logic.

**Tech Stack:** pytest/pytest-asyncio (backend), Vitest (frontend), AsyncMock for WebSocket/broadcast mocking

---

## Gap Analysis

### Backend — Missing Tests

| Area | What's missing |
|------|---------------|
| ProjectRegistry edge cases | Re-register same session, color recycling after 8+ projects, register with None project_name |
| get_project_grouped_state | Sessions without registry entry ("unknown" fallback), multi-session same project merges boss correctly |
| Broadcast integration | broadcast_state triggers project broadcast, correct message shape |
| TranscriptWatcher integration | Watcher results fed into ProjectRegistry |
| API edge cases | GET /projects/{key}/sessions with 404 |

### Frontend — Missing Tests

| Area | What's missing |
|------|---------------|
| projectStore | All actions (setViewMode, zoomToRoom, zoomToOverview, updateFromServer), selectors (selectActiveProject) |
| getRoomGridSize | Grid calculations for 1-6 rooms |

---

## File Structure

### Backend (new test files)
| File | Responsibility |
|------|---------------|
| `backend/tests/test_project_registry_edge.py` | Edge cases for ProjectRegistry |
| `backend/tests/test_project_grouped_state_adv.py` | Advanced grouped state scenarios |
| `backend/tests/test_broadcast_projects.py` | Project broadcast integration |

### Frontend (new test files)
| File | Responsibility |
|------|---------------|
| `frontend/tests/projectStore.test.ts` | projectStore actions and selectors |
| `frontend/tests/rooms.test.ts` | getRoomGridSize calculations |

---

## Task 1: Backend — ProjectRegistry Edge Case Tests

**Files:**
- Create: `backend/tests/test_project_registry_edge.py`

- [ ] **Step 1: Write edge case tests**

```python
# backend/tests/test_project_registry_edge.py
from app.core.project_registry import ProjectRegistry, PROJECT_COLORS, normalize_project_key


def test_reregister_same_session_is_idempotent():
    """Registering the same session twice should not duplicate it."""
    registry = ProjectRegistry()
    registry.register_session("s1", "proj", "/path")
    registry.register_session("s1", "proj", "/path")
    project = registry.get_project_for_session("s1")
    assert project is not None
    assert project.session_ids.count("s1") == 1


def test_color_wraps_after_palette_exhausted():
    """After 8 projects, colors should cycle back to the beginning."""
    registry = ProjectRegistry()
    for i in range(10):
        registry.register_session(f"s{i}", f"proj-{i}", f"/path/{i}")
    projects = registry.get_all_projects()
    assert projects[0].color == projects[8].color
    assert projects[1].color == projects[9].color


def test_register_with_none_project_name_uses_unknown():
    """If project_name is empty/weird, key should normalize gracefully."""
    registry = ProjectRegistry()
    registry.register_session("s1", "", "/path")
    project = registry.get_project_for_session("s1")
    assert project is not None
    assert project.key == "unknown"


def test_unregister_nonexistent_session_is_noop():
    """Unregistering a session that was never registered should not raise."""
    registry = ProjectRegistry()
    registry.unregister_session("nonexistent")  # Should not raise


def test_get_project_for_unknown_session_returns_none():
    registry = ProjectRegistry()
    assert registry.get_project_for_session("nope") is None


def test_get_project_returns_none_for_unknown_key():
    registry = ProjectRegistry()
    assert registry.get_project("nope") is None


def test_normalize_project_key_special_chars():
    assert normalize_project_key("My App (v2)") == "my-app-v2"
    assert normalize_project_key("  spaces  ") == "spaces"
    assert normalize_project_key("UPPER-case") == "upper-case"
    assert normalize_project_key("---") == "unknown"
    assert normalize_project_key("a--b--c") == "a-b-c"


def test_multiple_projects_then_remove_one():
    """Removing one project should not affect the other."""
    registry = ProjectRegistry()
    registry.register_session("s1", "proj-a", "/a")
    registry.register_session("s2", "proj-b", "/b")
    registry.unregister_session("s1")
    assert registry.get_project("proj-a") is None
    assert registry.get_project("proj-b") is not None
    assert len(registry.get_all_projects()) == 1
```

- [ ] **Step 2: Run tests**

Run: `cd backend && uv run pytest tests/test_project_registry_edge.py -v`
Expected: All 8 tests PASS (these test already-implemented code)

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_project_registry_edge.py
git commit -m "test: add ProjectRegistry edge case tests"
```

---

## Task 2: Backend — Advanced Grouped State Tests

**Files:**
- Create: `backend/tests/test_project_grouped_state_adv.py`

- [ ] **Step 1: Write advanced grouped state tests**

```python
# backend/tests/test_project_grouped_state_adv.py
import pytest

from app.core.event_processor import event_processor
from app.core.project_registry import ProjectRegistry
from app.core.state_machine import StateMachine
from app.models.agents import Agent, AgentState, BossState


@pytest.fixture(autouse=True)
def clean_processor():
    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()
    yield
    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()


@pytest.mark.asyncio
async def test_session_without_registry_grouped_as_unknown():
    """Sessions not registered with ProjectRegistry should appear under 'unknown'."""
    sm = StateMachine()
    event_processor.sessions["orphan-session"] = sm
    # Note: NOT registering with project_registry

    result = await event_processor.get_project_grouped_state()
    assert result is not None
    assert len(result.projects) == 1
    assert result.projects[0].key == "unknown"


@pytest.mark.asyncio
async def test_multi_session_same_project_merges_agents():
    """Two sessions under the same project should have all agents in one group."""
    sm1 = StateMachine()
    sm1.agents["a1"] = Agent(
        id="a1", name="Agent A1", color="#fff", number=1, state=AgentState.WORKING
    )
    sm2 = StateMachine()
    sm2.agents["a2"] = Agent(
        id="a2", name="Agent A2", color="#fff", number=2, state=AgentState.WORKING
    )

    event_processor.sessions["s1"] = sm1
    event_processor.sessions["s2"] = sm2
    event_processor.project_registry.register_session("s1", "shared-proj", "/shared")
    event_processor.project_registry.register_session("s2", "shared-proj", "/shared")

    result = await event_processor.get_project_grouped_state()
    assert result is not None
    assert len(result.projects) == 1
    assert result.projects[0].session_count == 2
    assert len(result.projects[0].agents) == 2
    agent_names = {a.name for a in result.projects[0].agents}
    assert agent_names == {"Agent A1", "Agent A2"}


@pytest.mark.asyncio
async def test_grouped_state_boss_picks_first_active():
    """Room boss should be the first non-idle boss among sessions."""
    sm1 = StateMachine()
    sm1.boss_state = BossState.IDLE

    sm2 = StateMachine()
    sm2.boss_state = BossState.WORKING
    sm2.boss_task = "Doing important work"

    event_processor.sessions["s1"] = sm1
    event_processor.sessions["s2"] = sm2
    event_processor.project_registry.register_session("s1", "proj", "/proj")
    event_processor.project_registry.register_session("s2", "proj", "/proj")

    result = await event_processor.get_project_grouped_state()
    assert result is not None
    assert result.projects[0].boss.state == BossState.WORKING


@pytest.mark.asyncio
async def test_grouped_state_desk_numbers_are_sequential():
    """Desk numbers within a project should be sequential starting from 1."""
    sm = StateMachine()
    for i in range(4):
        sm.agents[f"a{i}"] = Agent(
            id=f"a{i}", name=f"Agent {i}", color="#fff", number=i, state=AgentState.WORKING
        )

    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session("s1", "proj", "/proj")

    result = await event_processor.get_project_grouped_state()
    desks = [a.desk for a in result.projects[0].agents]
    assert desks == [1, 2, 3, 4]


@pytest.mark.asyncio
async def test_grouped_state_serializes_to_json():
    """MultiProjectGameState should serialize correctly for WebSocket."""
    sm = StateMachine()
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session("s1", "proj", "/proj")

    result = await event_processor.get_project_grouped_state()
    json_data = result.model_dump(by_alias=True, mode="json")

    assert json_data["sessionId"] == "__all__"
    assert isinstance(json_data["projects"], list)
    assert json_data["projects"][0]["key"] == "proj"
    assert "lastUpdated" in json_data
```

- [ ] **Step 2: Run tests**

Run: `cd backend && uv run pytest tests/test_project_grouped_state_adv.py -v`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_project_grouped_state_adv.py
git commit -m "test: add advanced grouped state integration tests"
```

---

## Task 3: Backend — Broadcast Integration Tests

**Files:**
- Create: `backend/tests/test_broadcast_projects.py`

- [ ] **Step 1: Write broadcast integration tests**

```python
# backend/tests/test_broadcast_projects.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.core.broadcast_service import broadcast_state
from app.core.event_processor import event_processor
from app.core.project_registry import ProjectRegistry
from app.core.state_machine import StateMachine


@pytest.fixture(autouse=True)
def clean_processor():
    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()
    yield
    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()


@pytest.mark.asyncio
async def test_broadcast_state_sends_to_project_subscribers():
    """broadcast_state should send project_state to project WebSocket subscribers."""
    sm = StateMachine()
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session("s1", "my-proj", "/proj")

    mock_ws = MagicMock()
    mock_ws.client_state = MagicMock()

    with patch("app.core.broadcast_service.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()
        mock_manager.all_session_connections = []
        mock_manager.project_connections = [mock_ws]
        mock_manager.broadcast_to_project_subscribers = AsyncMock()

        await broadcast_state("s1", sm)

        # Should have been called with project_state message
        mock_manager.broadcast_to_project_subscribers.assert_called_once()
        call_args = mock_manager.broadcast_to_project_subscribers.call_args[0][0]
        assert call_args["type"] == "project_state"
        assert "data" in call_args
        assert isinstance(call_args["data"]["projects"], list)


@pytest.mark.asyncio
async def test_broadcast_state_skips_project_when_no_subscribers():
    """broadcast_state should not call project broadcast when no subscribers."""
    sm = StateMachine()
    event_processor.sessions["s1"] = sm

    with patch("app.core.broadcast_service.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()
        mock_manager.all_session_connections = []
        mock_manager.project_connections = []  # No subscribers

        await broadcast_state("s1", sm)

        mock_manager.broadcast_to_project_subscribers.assert_not_called()


@pytest.mark.asyncio
async def test_broadcast_project_state_has_correct_shape():
    """The project_state message should have the expected structure."""
    sm = StateMachine()
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session("s1", "test-proj", "/test")

    with patch("app.core.broadcast_service.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()
        mock_manager.all_session_connections = []
        mock_manager.project_connections = [MagicMock()]
        mock_manager.broadcast_to_project_subscribers = AsyncMock()

        await broadcast_state("s1", sm)

        msg = mock_manager.broadcast_to_project_subscribers.call_args[0][0]
        data = msg["data"]
        assert "projects" in data
        assert "office" in data
        assert "lastUpdated" in data
        project = data["projects"][0]
        assert project["key"] == "test-proj"
        assert "color" in project
        assert "agents" in project
        assert "boss" in project
        assert "sessionCount" in project
```

- [ ] **Step 2: Run tests**

Run: `cd backend && uv run pytest tests/test_broadcast_projects.py -v`
Expected: All 3 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_broadcast_projects.py
git commit -m "test: add broadcast integration tests for project state"
```

---

## Task 4: Frontend — projectStore Tests

**Files:**
- Create: `frontend/tests/projectStore.test.ts`

- [ ] **Step 1: Write projectStore tests**

```typescript
// frontend/tests/projectStore.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import {
  useProjectStore,
  selectViewMode,
  selectActiveRoomKey,
  selectProjects,
  selectActiveProject,
} from "../src/stores/projectStore";
import type { MultiProjectGameState, ProjectGroup } from "../src/types/projects";

function makeProject(key: string, agentCount = 0): ProjectGroup {
  return {
    key,
    name: key,
    color: "#3B82F6",
    root: `/${key}`,
    agents: Array.from({ length: agentCount }, (_, i) => ({
      id: `${key}-a${i}`,
      name: `Agent ${i}`,
      color: "#fff",
      number: i + 1,
      state: "working" as const,
      desk: i + 1,
    })),
    boss: { state: "idle" as const, currentTask: null, bubble: null, position: { x: 640, y: 830 } },
    sessionCount: 1,
    todos: [],
  };
}

describe("projectStore", () => {
  beforeEach(() => {
    useProjectStore.setState({
      viewMode: "all-merged",
      activeRoomKey: null,
      projects: [],
      lastUpdated: null,
    });
  });

  describe("initial state", () => {
    it("starts with all-merged view mode", () => {
      expect(selectViewMode(useProjectStore.getState())).toBe("all-merged");
    });

    it("starts with no active room", () => {
      expect(selectActiveRoomKey(useProjectStore.getState())).toBeNull();
    });

    it("starts with empty projects", () => {
      expect(selectProjects(useProjectStore.getState())).toEqual([]);
    });
  });

  describe("setViewMode", () => {
    it("changes view mode to overview", () => {
      useProjectStore.getState().setViewMode("overview");
      expect(selectViewMode(useProjectStore.getState())).toBe("overview");
    });

    it("changes view mode to room-detail", () => {
      useProjectStore.getState().setViewMode("room-detail");
      expect(selectViewMode(useProjectStore.getState())).toBe("room-detail");
    });
  });

  describe("zoomToRoom", () => {
    it("sets view mode to room-detail and active room key", () => {
      useProjectStore.getState().zoomToRoom("proj-a");
      const state = useProjectStore.getState();
      expect(selectViewMode(state)).toBe("room-detail");
      expect(selectActiveRoomKey(state)).toBe("proj-a");
    });
  });

  describe("zoomToOverview", () => {
    it("sets view mode to overview and clears active room", () => {
      useProjectStore.getState().zoomToRoom("proj-a");
      useProjectStore.getState().zoomToOverview();
      const state = useProjectStore.getState();
      expect(selectViewMode(state)).toBe("overview");
      expect(selectActiveRoomKey(state)).toBeNull();
    });
  });

  describe("updateFromServer", () => {
    it("updates projects from server state", () => {
      const serverState: MultiProjectGameState = {
        sessionId: "__all__",
        projects: [makeProject("proj-a", 2), makeProject("proj-b", 1)],
        office: {
          deskCount: 8,
          elevatorState: "closed",
          phoneState: "idle",
          contextUtilization: 0,
          toolUsesSinceCompaction: 0,
          printReport: false,
        },
        lastUpdated: "2026-04-08T10:00:00Z",
      };

      useProjectStore.getState().updateFromServer(serverState);
      const state = useProjectStore.getState();
      expect(state.projects).toHaveLength(2);
      expect(state.projects[0].key).toBe("proj-a");
      expect(state.lastUpdated).toBe("2026-04-08T10:00:00Z");
    });
  });

  describe("selectActiveProject", () => {
    it("returns null when no active room", () => {
      expect(selectActiveProject(useProjectStore.getState())).toBeNull();
    });

    it("returns null when active room key does not match any project", () => {
      useProjectStore.setState({
        activeRoomKey: "nonexistent",
        projects: [makeProject("proj-a")],
      });
      expect(selectActiveProject(useProjectStore.getState())).toBeNull();
    });

    it("returns the matching project", () => {
      const proj = makeProject("proj-a", 3);
      useProjectStore.setState({
        activeRoomKey: "proj-a",
        projects: [proj, makeProject("proj-b")],
      });
      const active = selectActiveProject(useProjectStore.getState());
      expect(active).not.toBeNull();
      expect(active!.key).toBe("proj-a");
      expect(active!.agents).toHaveLength(3);
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd frontend && npx vitest run tests/projectStore.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/projectStore.test.ts
git commit -m "test: add projectStore unit tests"
```

---

## Task 5: Frontend — getRoomGridSize Tests

**Files:**
- Create: `frontend/tests/rooms.test.ts`

- [ ] **Step 1: Write room grid calculation tests**

```typescript
// frontend/tests/rooms.test.ts
import { describe, expect, it } from "vitest";
import {
  getRoomGridSize,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  ROOM_GAP,
  ROOM_GRID_COLS,
} from "../src/constants/rooms";

describe("getRoomGridSize", () => {
  it("returns 1 col 1 row for 1 room", () => {
    const size = getRoomGridSize(1);
    expect(size.cols).toBe(1);
    expect(size.rows).toBe(1);
    expect(size.width).toBe(ROOM_WIDTH);
    expect(size.height).toBe(ROOM_HEIGHT);
  });

  it("returns 2 cols 1 row for 2 rooms", () => {
    const size = getRoomGridSize(2);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(1);
    expect(size.width).toBe(2 * ROOM_WIDTH + ROOM_GAP);
    expect(size.height).toBe(ROOM_HEIGHT);
  });

  it("returns 2 cols 2 rows for 3 rooms", () => {
    const size = getRoomGridSize(3);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(2);
  });

  it("returns 2 cols 2 rows for 4 rooms", () => {
    const size = getRoomGridSize(4);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(2);
    expect(size.width).toBe(2 * ROOM_WIDTH + ROOM_GAP);
    expect(size.height).toBe(2 * ROOM_HEIGHT + ROOM_GAP);
  });

  it("returns 2 cols 3 rows for 6 rooms", () => {
    const size = getRoomGridSize(6);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(3);
  });

  it("never exceeds ROOM_GRID_COLS columns", () => {
    for (let n = 1; n <= 10; n++) {
      const size = getRoomGridSize(n);
      expect(size.cols).toBeLessThanOrEqual(ROOM_GRID_COLS);
    }
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd frontend && npx vitest run tests/rooms.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/rooms.test.ts
git commit -m "test: add getRoomGridSize unit tests"
```

---

## Task 6: Run Full Test Suite

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && uv run pytest tests/ -v --timeout=10`
Expected: All tests PASS (201 existing + 16 new = ~217)

- [ ] **Step 2: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS (21 existing + 16 new = ~37)

- [ ] **Step 3: Run lint**

Run: `cd backend && uv run ruff check app/`
Expected: All checks passed

- [ ] **Step 4: Run typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit (if any fixes needed)**

```bash
git commit -m "fix: resolve any test/lint issues"
```

---

## Summary

| Task | Area | Tests Added | What They Cover |
|------|------|------------|----------------|
| 1 | Backend | 8 | ProjectRegistry edge cases (idempotency, color cycling, normalization) |
| 2 | Backend | 5 | Grouped state (unknown fallback, multi-session merge, boss selection, desk numbers, JSON serialization) |
| 3 | Backend | 3 | Broadcast integration (project subscribers, message shape, skip when empty) |
| 4 | Frontend | 10 | projectStore actions + selectors |
| 5 | Frontend | 6 | getRoomGridSize calculations |
| 6 | Full suite | — | Verify everything together |
| **Total** | | **32** | |
