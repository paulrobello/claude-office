# Panoptica Phase 3: Multi-Room Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Claude Code sessions to rooms based on their repo, so multiple concurrent sessions across Recepthor repos show as separate rooms with live data.

**Architecture:** Backend adds a ProductMapper service that derives `floor_id` + `room_id` from hook event payloads (project_dir/project_name → git root → repo name → BuildingConfig lookup). Room assignment is stored on SessionRecord and included in GameState broadcasts. Frontend filters sessions by room when in room view, auto-connecting to the latest active session for that room. FloorView and BuildingView show real session/agent counts.

**Tech Stack:** Python, FastAPI, SQLAlchemy, Pydantic, TypeScript, React, Zustand

---

## File Structure

### Backend
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `backend/app/core/product_mapper.py` | Map project_dir/project_name → floor_id + room_id |
| Create | `backend/tests/test_product_mapper.py` | ProductMapper unit tests |
| Modify | `backend/app/models/events.py` | Add floor_id, room_id to EventData |
| Modify | `backend/app/models/sessions.py` | Add floor_id, room_id to GameState |
| Modify | `backend/app/db/models.py` | Add floor_id, room_id columns to SessionRecord |
| Modify | `backend/app/core/event_processor.py` | Populate room assignment via ProductMapper |
| Modify | `backend/app/core/state_machine.py` | Store floor_id, room_id; include in to_game_state() |
| Modify | `backend/app/api/routes/sessions.py` | Add room_id query filter, include room in response |

### Frontend
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `frontend/src/hooks/useSessions.ts` | Add floorId/roomId to Session, add room filter param |
| Create | `frontend/src/hooks/useRoomSessions.ts` | Room-scoped session management for RoomView |
| Modify | `frontend/src/components/views/RoomView.tsx` | Use room-scoped session hook, auto-connect |
| Modify | `frontend/src/components/views/FloorView.tsx` | Show real session/agent counts per room |
| Modify | `frontend/src/components/views/BuildingView.tsx` | Show active room counts per floor |
| Modify | `frontend/src/app/page.tsx` | Pass room context to RoomView |

---

### Task 1: ProductMapper Service

**Files:**
- Create: `backend/app/core/product_mapper.py`
- Create: `backend/tests/test_product_mapper.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_product_mapper.py`:

```python
"""Tests for ProductMapper — maps project context to floor + room."""

from unittest.mock import patch

import pytest

from app.core.product_mapper import ProductMapper, RoomAssignment


SAMPLE_TOML = """
[[floors]]
name = "Recepthor"
floor_number = 3
accent = "#2563eb"
icon = "⚖️"
repos = ["recepthor-api", "recepthor-hub", "recepthor-scraper", "recepthor-web", "recepthor-serverless"]

[[floors]]
name = "Lexio"
floor_number = 2
accent = "#7c3aed"
icon = "📚"
repos = ["lexio"]

[[floors]]
name = "entreperros"
floor_number = 1
accent = "#059669"
icon = "🐕"
repos = ["entreperros"]
"""


@pytest.fixture
def mapper() -> ProductMapper:
    from app.core.floor_config import load_building_config

    config = load_building_config(toml_string=SAMPLE_TOML)
    return ProductMapper(config)


def test_resolve_from_project_name_exact_match(mapper: ProductMapper) -> None:
    result = mapper.resolve(project_name="recepthor-api")
    assert result is not None
    assert result.floor_id == "recepthor"
    assert result.room_id == "recepthor-api"


def test_resolve_from_project_name_with_prefix(mapper: ProductMapper) -> None:
    result = mapper.resolve(project_name="panoptica/recepthor-web")
    assert result is not None
    assert result.floor_id == "recepthor"
    assert result.room_id == "recepthor-web"


def test_resolve_from_project_dir(mapper: ProductMapper) -> None:
    with patch("app.core.product_mapper._git_root_name") as mock_git:
        mock_git.return_value = "recepthor-scraper"
        result = mapper.resolve(project_dir="/home/user/dev/tesseron/recepthor-scraper")
    assert result is not None
    assert result.floor_id == "recepthor"
    assert result.room_id == "recepthor-scraper"


def test_resolve_from_working_dir(mapper: ProductMapper) -> None:
    with patch("app.core.product_mapper._git_root_name") as mock_git:
        mock_git.return_value = "lexio"
        result = mapper.resolve(working_dir="/home/user/dev/tesseron/lexio/src/api")
    assert result is not None
    assert result.floor_id == "lexio"
    assert result.room_id == "lexio"


def test_resolve_unknown_repo(mapper: ProductMapper) -> None:
    with patch("app.core.product_mapper._git_root_name") as mock_git:
        mock_git.return_value = "unknown-repo"
        result = mapper.resolve(project_dir="/home/user/dev/unknown-repo")
    assert result is None


def test_resolve_no_context(mapper: ProductMapper) -> None:
    result = mapper.resolve()
    assert result is None


def test_resolve_project_name_takes_priority(mapper: ProductMapper) -> None:
    """project_name is tried first, before project_dir."""
    result = mapper.resolve(
        project_name="lexio",
        project_dir="/home/user/dev/tesseron/recepthor-api",
    )
    assert result is not None
    assert result.room_id == "lexio"


def test_resolve_dir_basename_fallback(mapper: ProductMapper) -> None:
    """If git root lookup fails, fall back to directory basename."""
    with patch("app.core.product_mapper._git_root_name") as mock_git:
        mock_git.return_value = None
        result = mapper.resolve(project_dir="/home/user/dev/tesseron/entreperros")
    assert result is not None
    assert result.floor_id == "entreperros"
    assert result.room_id == "entreperros"


def test_room_assignment_dataclass() -> None:
    ra = RoomAssignment(floor_id="recepthor", room_id="recepthor-api")
    assert ra.floor_id == "recepthor"
    assert ra.room_id == "recepthor-api"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_product_mapper.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.core.product_mapper'`

- [ ] **Step 3: Implement ProductMapper**

Create `backend/app/core/product_mapper.py`:

```python
"""ProductMapper — resolves hook event context to a floor + room.

Uses the BuildingConfig (floors.toml) to map a session's project
directory, project name, or working directory to a specific room
in the building hierarchy.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.core.floor_config import BuildingConfig, get_building_config

__all__ = ["ProductMapper", "RoomAssignment", "get_product_mapper"]

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RoomAssignment:
    """Result of mapping a session to a room."""

    floor_id: str
    room_id: str


def _git_root_name(directory: str) -> str | None:
    """Walk up from *directory* looking for a .git folder, return that dir's name."""
    path = Path(directory).resolve()
    for parent in [path, *path.parents]:
        if (parent / ".git").exists():
            return parent.name
        if parent == parent.parent:
            break
    return None


class ProductMapper:
    """Maps project context (cwd, project_name, project_dir) to a room."""

    def __init__(self, config: BuildingConfig) -> None:
        self._config = config
        self._repo_names: set[str] = set()
        for floor in config.floors:
            for room in floor.rooms:
                self._repo_names.add(room.repo_name)

    def resolve(
        self,
        *,
        project_name: str | None = None,
        project_dir: str | None = None,
        working_dir: str | None = None,
    ) -> RoomAssignment | None:
        """Resolve context to a room assignment.

        Priority:
        1. project_name (may be a bare repo name or contain path segments)
        2. project_dir (git root lookup, then basename fallback)
        3. working_dir (git root lookup, then basename fallback)
        """
        # 1. Try project_name
        if project_name:
            result = self._match_name(project_name)
            if result:
                return result

        # 2. Try project_dir
        if project_dir:
            result = self._match_dir(project_dir)
            if result:
                return result

        # 3. Try working_dir
        if working_dir:
            result = self._match_dir(working_dir)
            if result:
                return result

        return None

    def _match_name(self, name: str) -> RoomAssignment | None:
        """Try to match a project name to a room."""
        # Direct match
        hit = self._config.find_room(name)
        if hit:
            return RoomAssignment(floor_id=hit[0].id, room_id=hit[1].repo_name)

        # Name might be a path segment like "panoptica/recepthor-web"
        basename = name.rsplit("/", 1)[-1]
        if basename != name:
            hit = self._config.find_room(basename)
            if hit:
                return RoomAssignment(floor_id=hit[0].id, room_id=hit[1].repo_name)

        return None

    def _match_dir(self, directory: str) -> RoomAssignment | None:
        """Try to match a directory path to a room via git root or basename."""
        # Git root lookup
        repo_name = _git_root_name(directory)
        if repo_name:
            hit = self._config.find_room(repo_name)
            if hit:
                return RoomAssignment(floor_id=hit[0].id, room_id=hit[1].repo_name)

        # Basename fallback
        basename = Path(directory).name
        hit = self._config.find_room(basename)
        if hit:
            return RoomAssignment(floor_id=hit[0].id, room_id=hit[1].repo_name)

        return None


@lru_cache(maxsize=1)
def get_product_mapper() -> ProductMapper:
    """Return the cached ProductMapper singleton."""
    return ProductMapper(get_building_config())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_product_mapper.py -v`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/product_mapper.py backend/tests/test_product_mapper.py
git commit -m "feat: add ProductMapper service for cwd-to-room resolution"
```

---

### Task 2: Add Room Fields to Models

**Files:**
- Modify: `backend/app/models/events.py`
- Modify: `backend/app/models/sessions.py`
- Modify: `backend/app/db/models.py`
- Modify: `backend/app/core/state_machine.py`

- [ ] **Step 1: Add floor_id and room_id to EventData**

In `backend/app/models/events.py`, add two fields to `EventData` after the `task_list_id` field (line 78):

```python
    # Room assignment (populated by ProductMapper)
    floor_id: str | None = None
    room_id: str | None = None
```

- [ ] **Step 2: Add floor_id and room_id to SessionRecord**

In `backend/app/db/models.py`, add two columns to `SessionRecord` after `status` (line 28):

```python
    floor_id: Mapped[str | None] = mapped_column(String, nullable=True)
    room_id: Mapped[str | None] = mapped_column(String, nullable=True)
```

- [ ] **Step 3: Add floor_id and room_id to StateMachine**

In `backend/app/core/state_machine.py`, find the `StateMachine` dataclass fields and add after the existing session-level fields:

```python
    floor_id: str | None = None
    room_id: str | None = None
```

- [ ] **Step 4: Include floor_id and room_id in GameState**

In `backend/app/models/sessions.py`, add to `GameState` after `session_id` (line 130):

```python
    floor_id: str | None = None
    room_id: str | None = None
```

- [ ] **Step 5: Update to_game_state to include room info**

In `backend/app/core/state_machine.py`, find the `to_game_state` method and add `floor_id` and `room_id` to the GameState constructor call:

```python
    floor_id=self.floor_id,
    room_id=self.room_id,
```

- [ ] **Step 6: Delete the old SQLite database to apply schema changes**

```bash
rm -f backend/claude_office.db
```

SQLAlchemy's `create_all` in the lifespan handler will recreate the tables with new columns on next startup.

- [ ] **Step 7: Run backend tests**

Run: `cd backend && uv run pytest -v`
Expected: All tests pass (existing + new)

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/events.py backend/app/models/sessions.py backend/app/db/models.py backend/app/core/state_machine.py
git commit -m "feat: add floor_id and room_id fields to EventData, SessionRecord, StateMachine, GameState"
```

---

### Task 3: Populate Room Assignment in Event Processing

**Files:**
- Modify: `backend/app/core/event_processor.py`

- [ ] **Step 1: Add ProductMapper import**

At the top of `event_processor.py`, add:

```python
from app.core.product_mapper import get_product_mapper
```

- [ ] **Step 2: Populate room assignment in _persist_event**

In `_persist_event`, after the `project_root = derive_git_root(source_dir)` line (around line 523), add room resolution logic. Add this block right after `project_root` is computed:

```python
            # Resolve room assignment via ProductMapper
            room_assignment = get_product_mapper().resolve(
                project_name=project_name,
                project_dir=project_dir,
                working_dir=working_dir,
            )
```

Then in the `if not session_rec:` block (creating new session), after setting `project_root`, add:

```python
                    floor_id=room_assignment.floor_id if room_assignment else None,
                    room_id=room_assignment.room_id if room_assignment else None,
```

In the `else` block (existing session), after the project_root update, add:

```python
                if room_assignment and not session_rec.room_id:
                    session_rec.floor_id = room_assignment.floor_id
                    session_rec.room_id = room_assignment.room_id
                    logger.info(
                        f"Assigned session {event.session_id} to room "
                        f"{room_assignment.floor_id}/{room_assignment.room_id}"
                    )
```

Also in the SESSION_START block (where status is reset), add room update:

```python
                    if room_assignment:
                        session_rec.floor_id = room_assignment.floor_id
                        session_rec.room_id = room_assignment.room_id
```

- [ ] **Step 3: Propagate room to StateMachine**

In `_process_event_internal`, after `sm = self.sessions[event.session_id]` (line 245), add:

```python
        # Sync room assignment from DB to state machine
        if not sm.floor_id:
            room_assignment = get_product_mapper().resolve(
                project_name=event.data.project_name if event.data else None,
                project_dir=event.data.project_dir if event.data else None,
                working_dir=event.data.working_dir if event.data else None,
            )
            if room_assignment:
                sm.floor_id = room_assignment.floor_id
                sm.room_id = room_assignment.room_id
```

- [ ] **Step 4: Propagate room during session restore**

In `_restore_session`, after `sm = StateMachine()` (around line 402), add a DB read for room info:

```python
            # Load room assignment from session record
            session_result = await db.execute(
                select(SessionRecord).where(SessionRecord.id == session_id)
            )
            session_rec = session_result.scalar_one_or_none()
            if session_rec:
                sm.floor_id = session_rec.floor_id
                sm.room_id = session_rec.room_id
```

- [ ] **Step 5: Run tests**

Run: `cd backend && uv run pytest -v`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/event_processor.py
git commit -m "feat: populate room assignment via ProductMapper on event processing"
```

---

### Task 4: Add Room Filter to Sessions API

**Files:**
- Modify: `backend/app/api/routes/sessions.py`

- [ ] **Step 1: Add room fields to SessionSummary**

In `sessions.py`, add to `SessionSummary` TypedDict (after `eventCount`):

```python
    floorId: str | None
    roomId: str | None
```

- [ ] **Step 2: Add room_id query parameter to list_sessions**

Change the `list_sessions` function signature and add filtering:

```python
@router.get("")
async def list_sessions(
    db: Annotated[AsyncSession, Depends(get_db)],
    room_id: str | None = None,
) -> list[SessionSummary]:
    """List all sessions with event counts, optionally filtered by room."""
    logger.debug("API: list_sessions called (room_id=%s)", room_id)
    try:
        stmt = select(SessionRecord).order_by(SessionRecord.updated_at.desc())
        if room_id:
            stmt = stmt.where(SessionRecord.room_id == room_id)
        result = await db.execute(stmt)
        records = result.scalars().all()
```

- [ ] **Step 3: Include room fields in response**

In the same function, add to the `sessions.append(...)` dict (after `eventCount`):

```python
                    "floorId": rec.floor_id,
                    "roomId": rec.room_id,
```

- [ ] **Step 4: Test the endpoint**

Run:
```bash
curl "http://localhost:8000/api/v1/sessions" | python3 -m json.tool
curl "http://localhost:8000/api/v1/sessions?room_id=recepthor-api" | python3 -m json.tool
```
Expected: First returns all sessions with floorId/roomId fields. Second filters to only sessions in recepthor-api.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/sessions.py
git commit -m "feat: add room_id filter and floor/room fields to sessions API"
```

---

### Task 5: Frontend — Room-Scoped Session Hook

**Files:**
- Modify: `frontend/src/hooks/useSessions.ts`
- Create: `frontend/src/hooks/useRoomSessions.ts`

- [ ] **Step 1: Add room fields to Session interface**

In `useSessions.ts`, add to the `Session` interface (after `eventCount`):

```typescript
  floorId: string | null;
  roomId: string | null;
```

- [ ] **Step 2: Create useRoomSessions hook**

Create `frontend/src/hooks/useRoomSessions.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { agentMachineService } from "@/machines/agentMachineService";
import { useGameStore } from "@/stores/gameStore";
import type { Session } from "@/hooks/useSessions";

const API_BASE = "http://localhost:8000/api/v1";

interface UseRoomSessionsResult {
  /** Sessions for the current room */
  sessions: Session[];
  /** Whether sessions are loading */
  loading: boolean;
  /** Currently connected session ID */
  sessionId: string;
  /** Switch to a different session */
  selectSession: (id: string) => void;
}

/**
 * Manages sessions scoped to a specific room.
 * Auto-selects the latest active session when the room changes.
 */
export function useRoomSessions(roomId: string | null): UseRoomSessionsResult {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const prevRoomRef = useRef<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!roomId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/sessions?room_id=${encodeURIComponent(roomId)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as Session[];
        setSessions(data);
        return data;
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
    return null;
  }, [roomId]);

  // Fetch on mount and periodically
  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Auto-select session when room changes
  useEffect(() => {
    if (roomId !== prevRoomRef.current) {
      prevRoomRef.current = roomId;
      if (sessions.length > 0) {
        const active = sessions.find((s) => s.status === "active");
        const target = active || sessions[0];
        if (target && target.id !== sessionId) {
          agentMachineService.reset();
          useGameStore.getState().resetForSessionSwitch();
          setSessionId(target.id);
        }
      }
    }
  }, [roomId, sessions, sessionId]);

  // Auto-follow new active sessions in this room
  useEffect(() => {
    if (sessions.length > 0 && !sessionId) {
      const active = sessions.find((s) => s.status === "active");
      const target = active || sessions[0];
      if (target) {
        setSessionId(target.id);
      }
    }
  }, [sessions, sessionId]);

  const selectSession = useCallback(
    (id: string) => {
      if (id !== sessionId) {
        agentMachineService.reset();
        useGameStore.getState().resetForSessionSwitch();
        setSessionId(id);
      }
    },
    [sessionId],
  );

  return { sessions, loading, sessionId, selectSession };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSessions.ts frontend/src/hooks/useRoomSessions.ts
git commit -m "feat: add room-scoped session management hook"
```

---

### Task 6: Frontend — Wire Room Sessions into RoomView

**Files:**
- Modify: `frontend/src/components/views/RoomView.tsx`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Simplify RoomView to use room-scoped sessions**

Rewrite `frontend/src/components/views/RoomView.tsx` to manage its own sessions:

```typescript
"use client";

import dynamic from "next/dynamic";
import { useNavigationStore } from "@/stores/navigationStore";
import { useRoomSessions } from "@/hooks/useRoomSessions";
import { useWebSocketEvents } from "@/hooks/useWebSocketEvents";
import { SessionSidebar } from "@/components/layout/SessionSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";

const OfficeGame = dynamic(
  () =>
    import("@/components/game/OfficeGame").then((m) => ({
      default: m.OfficeGame,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-900 animate-pulse flex items-center justify-center text-white font-mono text-center">
        Initializing Room...
      </div>
    ),
  },
);

export function RoomView(): React.ReactNode {
  const { floorId, roomId, buildingConfig } = useNavigationStore();
  const floor = buildingConfig?.floors.find((f) => f.id === floorId);
  const room = floor?.rooms.find((r) => r.id === roomId);

  const { sessions, loading, sessionId, selectSession } =
    useRoomSessions(roomId);

  // Connect WebSocket to the selected session
  useWebSocketEvents({ sessionId });

  return (
    <div className="flex-grow flex gap-2 overflow-hidden min-h-0">
      <SessionSidebar
        sessions={sessions}
        sessionsLoading={loading}
        sessionId={sessionId}
        isCollapsed={false}
        onToggleCollapsed={() => {}}
        onSessionSelect={async (id) => selectSession(id)}
        onDeleteSession={() => {}}
      />

      <div className="flex-grow border border-slate-800 rounded-lg shadow-2xl bg-slate-900 overflow-hidden relative">
        {/* Room label overlay */}
        {room && floor && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 bg-black/60 rounded text-xs font-mono">
            <span>{floor.icon}</span>
            <span style={{ color: floor.accent }}>{room.repo_name}</span>
          </div>
        )}
        <OfficeGame />
      </div>

      <RightSidebar />
    </div>
  );
}
```

- [ ] **Step 2: Simplify page.tsx RoomView usage**

In `frontend/src/app/page.tsx`, the RoomView no longer needs session props. Find the `<RoomView` block inside the `<div className={view === "room" ? "contents" : "hidden"}>` and simplify it to:

```tsx
          <div className={view === "room" ? "contents" : "hidden"}>
            <RoomView />
          </div>
```

Remove the session-related props that were being passed (sessions, sessionsLoading, sessionId, leftSidebarCollapsed, onToggleLeftSidebar, onSessionSelect, onDeleteSession).

Also: The page-level `useWebSocketEvents({ sessionId })` call can stay — it handles the "global" session for when we're not in room view. But we need to ensure the RoomView's own `useWebSocketEvents` takes over when in room view. Add a guard to the page-level hook:

In page.tsx, change:
```typescript
useWebSocketEvents({ sessionId });
```
to:
```typescript
useWebSocketEvents({ sessionId: view === "room" ? "" : sessionId });
```

This disables the page-level WebSocket when in room view (RoomView has its own).

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/views/RoomView.tsx frontend/src/app/page.tsx
git commit -m "feat: wire room-scoped sessions into RoomView with auto-connect"
```

---

### Task 7: Frontend — Live Room Data in FloorView and BuildingView

**Files:**
- Modify: `frontend/src/components/views/FloorView.tsx`
- Modify: `frontend/src/components/views/BuildingView.tsx`
- Modify: `frontend/src/stores/navigationStore.ts`

- [ ] **Step 1: Add sessions data to navigation store**

In `frontend/src/stores/navigationStore.ts`, add a field for all sessions and its setter:

After `isLoading: boolean;` add:

```typescript
  /** All sessions from backend (for room/floor summaries) */
  allSessions: { id: string; roomId: string | null; status: string; eventCount: number }[];
  setAllSessions: (sessions: { id: string; roomId: string | null; status: string; eventCount: number }[]) => void;
```

In the store implementation, add:

```typescript
  allSessions: [],
  setAllSessions: (sessions) => set({ allSessions: sessions }),
```

- [ ] **Step 2: Fetch all sessions in useFloorConfig**

In `frontend/src/hooks/useFloorConfig.ts`, add a second fetch for sessions:

```typescript
import { useEffect } from "react";
import { useNavigationStore } from "@/stores/navigationStore";

const API_URL = "http://localhost:8000/api/v1";

/**
 * Fetches building configuration and session summaries from the backend.
 */
export function useFloorConfig(): void {
  const setBuildingConfig = useNavigationStore((s) => s.setBuildingConfig);
  const setLoading = useNavigationStore((s) => s.setLoading);
  const setAllSessions = useNavigationStore((s) => s.setAllSessions);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/floors`)
      .then((res) => res.json())
      .then((data) => setBuildingConfig(data))
      .catch(() => setBuildingConfig({ floors: [] }));
  }, [setBuildingConfig, setLoading]);

  // Periodically fetch session summaries for room/floor activity
  useEffect(() => {
    const fetchSessions = () => {
      fetch(`${API_URL}/sessions`)
        .then((res) => res.json())
        .then((data) =>
          setAllSessions(
            data.map((s: Record<string, unknown>) => ({
              id: s.id as string,
              roomId: (s.roomId as string) ?? null,
              status: s.status as string,
              eventCount: (s.eventCount as number) ?? 0,
            })),
          ),
        )
        .catch(() => setAllSessions([]));
    };
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [setAllSessions]);
}
```

- [ ] **Step 3: Update FloorView to show real data**

In `frontend/src/components/views/FloorView.tsx`, update the RoomCard to show real session counts:

Replace the import block:
```typescript
"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import type { RoomConfig, FloorConfig } from "@/types/navigation";
```

Update the `RoomCard` component — replace the footer section:

```typescript
function RoomCard({
  room,
  floor,
  onClick,
  sessionCount,
  isActive,
}: {
  room: RoomConfig;
  floor: FloorConfig;
  onClick: () => void;
  sessionCount: number;
  isActive: boolean;
}): React.ReactNode {
```

Replace the footer `<div>` (the one with "0 agents"):

```tsx
      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-800 flex justify-between items-center">
        <span className="text-[10px] text-slate-600 font-mono uppercase">
          {sessionCount} session{sessionCount !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1.5">
          {isActive && (
            <div
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: floor.accent }}
            />
          )}
          <span className="text-slate-600 group-hover:text-slate-400 transition-colors">
            →
          </span>
        </div>
      </div>
```

Replace the status text in the room content:

```tsx
        <span className="text-xs text-slate-600 font-mono">
          {isActive ? "active" : "idle"}
        </span>
```

Update `FloorView` to compute room stats:

```typescript
export function FloorView(): React.ReactNode {
  const { buildingConfig, floorId, goToRoom, allSessions } =
    useNavigationStore();

  const floor = buildingConfig?.floors.find((f) => f.id === floorId);
  if (!floor) return null;

  const roomStats = new Map<string, { count: number; active: boolean }>();
  for (const room of floor.rooms) {
    const roomSessions = allSessions.filter((s) => s.roomId === room.id);
    roomStats.set(room.id, {
      count: roomSessions.length,
      active: roomSessions.some((s) => s.status === "active"),
    });
  }
```

And update the room card rendering:

```tsx
        {floor.rooms.map((room) => {
          const stats = roomStats.get(room.id) ?? { count: 0, active: false };
          return (
            <RoomCard
              key={room.id}
              room={room}
              floor={floor}
              onClick={() => goToRoom(floor.id, room.id)}
              sessionCount={stats.count}
              isActive={stats.active}
            />
          );
        })}
```

- [ ] **Step 4: Update BuildingView to show floor activity**

In `frontend/src/components/views/BuildingView.tsx`, update `FloorRow` to accept and display active room counts:

Add `activeRooms` and `totalSessions` props to `FloorRow`:

```typescript
function FloorRow({
  floor,
  onClick,
  activeRooms,
  totalSessions,
}: {
  floor: FloorConfig;
  onClick: () => void;
  activeRooms: number;
  totalSessions: number;
}): React.ReactNode {
```

Replace the room count `<span>`:

```tsx
          <span className="text-xs text-slate-500 font-mono">
            {floor.rooms.length} room{floor.rooms.length !== 1 ? "s" : ""}
            {totalSessions > 0 && (
              <span className="text-emerald-500">
                {" "}
                · {totalSessions} active
              </span>
            )}
          </span>
```

Update `BuildingView` to compute floor stats:

```typescript
export function BuildingView(): React.ReactNode {
  const { buildingConfig, goToFloor, allSessions } = useNavigationStore();

  if (!buildingConfig) return null;
```

And in the render:

```tsx
        {buildingConfig.floors.map((floor) => {
          const floorRoomIds = new Set(floor.rooms.map((r) => r.id));
          const floorSessions = allSessions.filter(
            (s) => s.roomId && floorRoomIds.has(s.roomId),
          );
          const activeRooms = new Set(
            floorSessions
              .filter((s) => s.status === "active")
              .map((s) => s.roomId),
          ).size;
          return (
            <FloorRow
              key={floor.id}
              floor={floor}
              onClick={() => goToFloor(floor.id)}
              activeRooms={activeRooms}
              totalSessions={floorSessions.filter((s) => s.status === "active").length}
            />
          );
        })}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/navigationStore.ts frontend/src/hooks/useFloorConfig.ts frontend/src/components/views/FloorView.tsx frontend/src/components/views/BuildingView.tsx
git commit -m "feat: show live session counts in FloorView room cards and BuildingView"
```

---

### Task 8: Run Full Checks

**Files:** None (validation only)

- [ ] **Step 1: Run backend checks**

```bash
cd backend && make checkall
```

Expected: lint, typecheck, tests all pass

- [ ] **Step 2: Run frontend checks**

```bash
cd frontend && make checkall
```

Expected: lint, typecheck, build all pass

- [ ] **Step 3: Fix any issues**

If errors are found, fix them and re-run.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve lint and type check issues from Phase 3 integration"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] ProductMapper (cwd → floor + room) — Task 1
- [x] Room-scoped state machines (floor_id/room_id on StateMachine) — Task 2
- [x] Room assignment on event processing — Task 3
- [x] Sessions API with room filtering — Task 4
- [x] Frontend room-scoped session management — Task 5
- [x] RoomView auto-connects to room's session — Task 6
- [x] FloorView shows real session/agent counts — Task 7
- [x] BuildingView shows floor activity — Task 7

**2. Placeholder scan:** No TBD/TODO. All code provided in full.

**3. Type consistency:**
- `RoomAssignment` — floor_id + room_id, used in ProductMapper and event_processor
- `floor_id`/`room_id` — consistent across EventData, SessionRecord, StateMachine, GameState, SessionSummary
- `useRoomSessions` — returns sessions/loading/sessionId/selectSession
- `allSessions` in navigationStore — used by FloorView and BuildingView

**Phase 3 deliverable:** Multiple concurrent Claude Code sessions across Recepthor repos appear as separate rooms with live session counts on floor/building views. Clicking into a room auto-connects to the latest active session for that repo.
