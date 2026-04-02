# Panoptica Phase 2: Building Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three-tier navigation (Building → Floor → Room) so users can click through a building cross-section to reach the existing pixel-art room view.

**Architecture:** Backend serves floor configuration from a TOML file via a new API endpoint. Frontend adds a navigation store (Zustand) with three view modes. Building View is an SVG cross-section, Floor View shows room cards, Room View wraps the existing OfficeGame. Breadcrumb enables back-navigation. No changes to event processing, state machines, or WebSocket protocol — those are Phase 3.

**Tech Stack:** Python (tomli), FastAPI, Pydantic, Next.js, React, Zustand, TypeScript, SVG

---

## File Structure

### Backend
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `backend/floors.toml` | Floor/room configuration (Recepthor + placeholders) |
| Create | `backend/app/core/floor_config.py` | TOML loader, Pydantic models, cached singleton |
| Create | `backend/app/api/routes/floors.py` | `GET /api/v1/floors` endpoint |
| Modify | `backend/app/main.py:62` | Register floors router |
| Create | `backend/tests/test_floor_config.py` | Unit tests for TOML loader |

### Frontend
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/types/navigation.ts` | ViewMode, FloorConfig, RoomConfig types |
| Create | `frontend/src/stores/navigationStore.ts` | Current view, floor, room selection |
| Create | `frontend/src/hooks/useFloorConfig.ts` | Fetch floor config from backend API |
| Create | `frontend/src/components/navigation/Breadcrumb.tsx` | Clickable breadcrumb trail |
| Create | `frontend/src/components/views/BuildingView.tsx` | SVG building cross-section |
| Create | `frontend/src/components/views/FloorView.tsx` | Horizontal room cards |
| Create | `frontend/src/components/views/RoomView.tsx` | Wrapper around OfficeGame + sidebars |
| Modify | `frontend/src/app/page.tsx` | View routing based on navigation store |

---

### Task 1: Floor Configuration — Backend TOML + Loader

**Files:**
- Create: `backend/floors.toml`
- Create: `backend/app/core/floor_config.py`
- Create: `backend/tests/test_floor_config.py`
- Modify: `backend/pyproject.toml` (add tomli dependency)

- [ ] **Step 1: Add tomli dependency**

```bash
cd backend && uv add tomli
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_floor_config.py`:

```python
"""Tests for floor configuration loading."""

from pathlib import Path

import pytest

from app.core.floor_config import FloorConfig, RoomConfig, BuildingConfig, load_building_config


SAMPLE_TOML = """
[[floors]]
name = "TestProduct"
floor_number = 2
accent = "#ff0000"
icon = "🔴"
repos = ["test-api", "test-web"]

[[floors]]
name = "Other"
floor_number = 1
accent = "#00ff00"
icon = "🟢"
repos = ["other-service"]
"""


def test_load_building_config_from_string():
    config = load_building_config(toml_string=SAMPLE_TOML)
    assert len(config.floors) == 2
    assert config.floors[0].name == "TestProduct"
    assert config.floors[0].floor_number == 2
    assert config.floors[0].accent == "#ff0000"
    assert config.floors[0].icon == "🔴"
    assert config.floors[0].rooms == [
        RoomConfig(id="test-api", repo_name="test-api"),
        RoomConfig(id="test-web", repo_name="test-web"),
    ]


def test_floor_config_generates_id_from_name():
    config = load_building_config(toml_string=SAMPLE_TOML)
    assert config.floors[0].id == "testproduct"
    assert config.floors[1].id == "other"


def test_floors_sorted_by_floor_number_descending():
    config = load_building_config(toml_string=SAMPLE_TOML)
    assert config.floors[0].floor_number == 2
    assert config.floors[1].floor_number == 1


def test_load_building_config_from_file(tmp_path: Path):
    toml_file = tmp_path / "floors.toml"
    toml_file.write_text(SAMPLE_TOML)
    config = load_building_config(toml_path=toml_file)
    assert len(config.floors) == 2


def test_load_building_config_missing_file():
    config = load_building_config(toml_path=Path("/nonexistent/floors.toml"))
    assert len(config.floors) == 0


def test_get_floor_by_id():
    config = load_building_config(toml_string=SAMPLE_TOML)
    floor = config.get_floor("testproduct")
    assert floor is not None
    assert floor.name == "TestProduct"


def test_get_floor_by_id_not_found():
    config = load_building_config(toml_string=SAMPLE_TOML)
    assert config.get_floor("nonexistent") is None


def test_find_room():
    config = load_building_config(toml_string=SAMPLE_TOML)
    result = config.find_room("test-api")
    assert result is not None
    floor, room = result
    assert floor.name == "TestProduct"
    assert room.repo_name == "test-api"


def test_find_room_not_found():
    config = load_building_config(toml_string=SAMPLE_TOML)
    assert config.find_room("unknown-repo") is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_floor_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.core.floor_config'`

- [ ] **Step 4: Implement floor_config.py**

Create `backend/app/core/floor_config.py`:

```python
"""Floor and building configuration loader.

Reads ``floors.toml`` to define the building hierarchy:
Building > Floor > Room.  Each floor maps to a Tesseron product,
each room maps to a repository.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

import tomli
from pydantic import BaseModel, Field

__all__ = [
    "RoomConfig",
    "FloorConfig",
    "BuildingConfig",
    "load_building_config",
    "get_building_config",
]

logger = logging.getLogger(__name__)

DEFAULT_TOML_PATH = Path(__file__).parent.parent.parent / "floors.toml"


class RoomConfig(BaseModel):
    """A single room (repository) on a floor."""

    id: str
    repo_name: str


class FloorConfig(BaseModel):
    """A single floor (product) in the building."""

    id: str = ""
    name: str
    floor_number: int
    accent: str
    icon: str
    rooms: list[RoomConfig] = Field(default_factory=list)


class BuildingConfig(BaseModel):
    """Top-level building configuration."""

    floors: list[FloorConfig] = Field(default_factory=list)

    def get_floor(self, floor_id: str) -> FloorConfig | None:
        """Look up a floor by its generated id."""
        return next((f for f in self.floors if f.id == floor_id), None)

    def find_room(self, repo_name: str) -> tuple[FloorConfig, RoomConfig] | None:
        """Find which floor and room a repo belongs to."""
        for floor in self.floors:
            for room in floor.rooms:
                if room.repo_name == repo_name:
                    return floor, room
        return None


def load_building_config(
    *,
    toml_path: Path | None = None,
    toml_string: str | None = None,
) -> BuildingConfig:
    """Load building config from a TOML file or string.

    Args:
        toml_path: Path to a ``floors.toml`` file.
        toml_string: Raw TOML content (takes priority over *toml_path*).

    Returns:
        A :class:`BuildingConfig`. Returns an empty config on errors.
    """
    raw: dict = {}

    if toml_string is not None:
        raw = tomli.loads(toml_string)
    elif toml_path is not None:
        if not toml_path.exists():
            logger.warning("floors.toml not found at %s — using empty config", toml_path)
            return BuildingConfig()
        raw = tomli.loads(toml_path.read_text(encoding="utf-8"))

    floors: list[FloorConfig] = []
    for entry in raw.get("floors", []):
        floor_id = entry["name"].lower().replace(" ", "")
        rooms = [RoomConfig(id=r, repo_name=r) for r in entry.get("repos", [])]
        floors.append(
            FloorConfig(
                id=floor_id,
                name=entry["name"],
                floor_number=entry["floor_number"],
                accent=entry["accent"],
                icon=entry["icon"],
                rooms=rooms,
            )
        )

    floors.sort(key=lambda f: f.floor_number, reverse=True)
    return BuildingConfig(floors=floors)


@lru_cache(maxsize=1)
def get_building_config() -> BuildingConfig:
    """Return the cached building configuration singleton."""
    return load_building_config(toml_path=DEFAULT_TOML_PATH)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_floor_config.py -v`
Expected: All 8 tests PASS

- [ ] **Step 6: Create floors.toml**

Create `backend/floors.toml`:

```toml
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
```

- [ ] **Step 7: Commit**

```bash
git add backend/floors.toml backend/app/core/floor_config.py backend/tests/test_floor_config.py backend/pyproject.toml backend/uv.lock
git commit -m "feat: add floor configuration TOML loader with building hierarchy"
```

---

### Task 2: Floors API Endpoint

**Files:**
- Create: `backend/app/api/routes/floors.py`
- Modify: `backend/app/main.py:62`

- [ ] **Step 1: Create the floors route**

Create `backend/app/api/routes/floors.py`:

```python
"""Floor configuration API."""

from fastapi import APIRouter

from app.core.floor_config import get_building_config

router = APIRouter()


@router.get("/floors")
async def get_floors() -> dict:
    """Return the building floor configuration."""
    config = get_building_config()
    return config.model_dump()
```

- [ ] **Step 2: Register the router in main.py**

In `backend/app/main.py`, add import and router registration.

After the existing router imports (line ~9), add:

```python
from app.api.routes import events, floors, preferences, sessions
```

After the existing `app.include_router` lines (line ~64), add:

```python
app.include_router(floors.router, prefix=f"{settings.API_V1_STR}")
```

- [ ] **Step 3: Verify endpoint works**

Run: `curl http://localhost:8000/api/v1/floors | python3 -m json.tool`
Expected: JSON with `floors` array containing Recepthor (3 rooms), Lexio, entreperros

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routes/floors.py backend/app/main.py
git commit -m "feat: add GET /api/v1/floors endpoint for building configuration"
```

---

### Task 3: Frontend Navigation Types

**Files:**
- Create: `frontend/src/types/navigation.ts`

- [ ] **Step 1: Create navigation types**

Create `frontend/src/types/navigation.ts`:

```typescript
/** View modes for the three-tier navigation */
export type ViewMode = "building" | "floor" | "room";

/** Room configuration from backend */
export interface RoomConfig {
  id: string;
  repo_name: string;
}

/** Floor configuration from backend */
export interface FloorConfig {
  id: string;
  name: string;
  floor_number: number;
  accent: string;
  icon: string;
  rooms: RoomConfig[];
}

/** Full building configuration from backend */
export interface BuildingConfig {
  floors: FloorConfig[];
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/navigation.ts
git commit -m "feat: add frontend navigation types for building/floor/room hierarchy"
```

---

### Task 4: Navigation Store

**Files:**
- Create: `frontend/src/stores/navigationStore.ts`

- [ ] **Step 1: Create the navigation store**

Create `frontend/src/stores/navigationStore.ts`:

```typescript
import { create } from "zustand";
import type { ViewMode, BuildingConfig, FloorConfig } from "@/types/navigation";

interface NavigationState {
  /** Current view mode */
  view: ViewMode;
  /** Selected floor ID (null when in building view) */
  floorId: string | null;
  /** Selected room ID (null when not in room view) */
  roomId: string | null;
  /** Building configuration loaded from backend */
  buildingConfig: BuildingConfig | null;
  /** Whether config is loading */
  isLoading: boolean;

  /** Navigate to building view */
  goToBuilding: () => void;
  /** Navigate to a specific floor */
  goToFloor: (floorId: string) => void;
  /** Navigate to a specific room */
  goToRoom: (floorId: string, roomId: string) => void;
  /** Set building config from API */
  setBuildingConfig: (config: BuildingConfig) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Get the currently selected floor config */
  getCurrentFloor: () => FloorConfig | null;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  view: "building",
  floorId: null,
  roomId: null,
  buildingConfig: null,
  isLoading: true,

  goToBuilding: () => set({ view: "building", floorId: null, roomId: null }),

  goToFloor: (floorId) => set({ view: "floor", floorId, roomId: null }),

  goToRoom: (floorId, roomId) => set({ view: "room", floorId, roomId }),

  setBuildingConfig: (config) => set({ buildingConfig: config, isLoading: false }),

  setLoading: (loading) => set({ isLoading: loading }),

  getCurrentFloor: () => {
    const { buildingConfig, floorId } = get();
    if (!buildingConfig || !floorId) return null;
    return buildingConfig.floors.find((f) => f.id === floorId) ?? null;
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/navigationStore.ts
git commit -m "feat: add navigation Zustand store for view mode routing"
```

---

### Task 5: useFloorConfig Hook

**Files:**
- Create: `frontend/src/hooks/useFloorConfig.ts`

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useFloorConfig.ts`:

```typescript
import { useEffect } from "react";
import { useNavigationStore } from "@/stores/navigationStore";

const API_URL = "http://localhost:8000/api/v1/floors";

/**
 * Fetches building configuration from the backend on mount
 * and stores it in the navigation store.
 */
export function useFloorConfig(): void {
  const setBuildingConfig = useNavigationStore((s) => s.setBuildingConfig);
  const setLoading = useNavigationStore((s) => s.setLoading);

  useEffect(() => {
    setLoading(true);
    fetch(API_URL)
      .then((res) => res.json())
      .then((data) => setBuildingConfig(data))
      .catch(() => setBuildingConfig({ floors: [] }));
  }, [setBuildingConfig, setLoading]);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useFloorConfig.ts
git commit -m "feat: add useFloorConfig hook to fetch building config from backend"
```

---

### Task 6: Breadcrumb Component

**Files:**
- Create: `frontend/src/components/navigation/Breadcrumb.tsx`

- [ ] **Step 1: Create the breadcrumb**

Create `frontend/src/components/navigation/Breadcrumb.tsx`:

```typescript
"use client";

import { useNavigationStore } from "@/stores/navigationStore";

export function Breadcrumb(): React.ReactNode {
  const { view, floorId, roomId, buildingConfig, goToBuilding, goToFloor } =
    useNavigationStore();

  const floor = buildingConfig?.floors.find((f) => f.id === floorId);

  return (
    <nav className="flex items-center gap-1.5 text-sm font-mono">
      <button
        onClick={goToBuilding}
        className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
          view === "building"
            ? "text-white bg-slate-800"
            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
        }`}
      >
        <span>🏢</span>
        <span>Panoptica</span>
      </button>

      {floor && (
        <>
          <span className="text-slate-600">/</span>
          <button
            onClick={() => goToFloor(floor.id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
              view === "floor"
                ? "text-white bg-slate-800"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <span>{floor.icon}</span>
            <span>{floor.name}</span>
          </button>
        </>
      )}

      {roomId && floor && (
        <>
          <span className="text-slate-600">/</span>
          <span className="px-2 py-0.5 rounded text-white bg-slate-800">
            {roomId}
          </span>
        </>
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/navigation/Breadcrumb.tsx
git commit -m "feat: add breadcrumb navigation component for building/floor/room"
```

---

### Task 7: Building View Component

**Files:**
- Create: `frontend/src/components/views/BuildingView.tsx`

- [ ] **Step 1: Create the building view**

Create `frontend/src/components/views/BuildingView.tsx`:

```typescript
"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import type { FloorConfig } from "@/types/navigation";

function FloorRow({
  floor,
  onClick,
}: {
  floor: FloorConfig;
  onClick: () => void;
}): React.ReactNode {
  const roomCount = floor.rooms.length;
  const isPlaceholder = roomCount <= 1;

  return (
    <button
      onClick={onClick}
      className={`group flex items-stretch w-full rounded-lg border transition-all duration-200 ${
        isPlaceholder
          ? "border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900"
          : "border-slate-700 bg-slate-900 hover:border-slate-500 hover:bg-slate-800"
      }`}
    >
      {/* Floor number badge */}
      <div
        className="flex items-center justify-center w-16 rounded-l-lg text-2xl font-bold font-mono"
        style={{ backgroundColor: floor.accent + "20", color: floor.accent }}
      >
        {floor.floor_number}F
      </div>

      {/* Floor info */}
      <div className="flex-grow flex items-center gap-4 px-5 py-4">
        <span className="text-2xl">{floor.icon}</span>
        <div className="flex flex-col items-start">
          <span
            className="text-lg font-bold"
            style={{ color: floor.accent }}
          >
            {floor.name}
          </span>
          <span className="text-xs text-slate-500 font-mono">
            {roomCount} room{roomCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Room windows preview */}
      <div className="flex items-center gap-1.5 px-4">
        {floor.rooms.map((room) => (
          <div
            key={room.id}
            className={`w-3 h-5 rounded-sm ${
              isPlaceholder ? "bg-slate-800" : "bg-slate-700 group-hover:bg-slate-600"
            }`}
            title={room.repo_name}
          />
        ))}
      </div>

      {/* Arrow */}
      <div className="flex items-center px-4 text-slate-600 group-hover:text-slate-400 transition-colors">
        →
      </div>
    </button>
  );
}

export function BuildingView(): React.ReactNode {
  const { buildingConfig, goToFloor } = useNavigationStore();

  if (!buildingConfig) return null;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {/* Building header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight mb-1">
          TESSERON TECH
        </h2>
        <p className="text-sm text-slate-500 font-mono">
          {buildingConfig.floors.length} floors
        </p>
      </div>

      {/* Building cross-section */}
      <div className="w-full max-w-2xl flex flex-col gap-2">
        {/* Roof */}
        <div className="h-2 bg-slate-800 rounded-t-lg mx-4" />

        {/* Floors (sorted top-down by floor_number) */}
        {buildingConfig.floors.map((floor) => (
          <FloorRow
            key={floor.id}
            floor={floor}
            onClick={() => goToFloor(floor.id)}
          />
        ))}

        {/* Lobby / Ground */}
        <div className="flex items-center gap-3 px-5 py-3 border border-dashed border-slate-800 rounded-lg">
          <span className="text-slate-600">🚪</span>
          <span className="text-sm text-slate-600 font-mono">
            Lobby — agents awaiting room assignment
          </span>
        </div>

        {/* Foundation */}
        <div className="h-2 bg-slate-800 rounded-b-lg mx-4" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/views/BuildingView.tsx
git commit -m "feat: add BuildingView component with floor cross-section"
```

---

### Task 8: Floor View Component

**Files:**
- Create: `frontend/src/components/views/FloorView.tsx`

- [ ] **Step 1: Create the floor view**

Create `frontend/src/components/views/FloorView.tsx`:

```typescript
"use client";

import { useNavigationStore } from "@/stores/navigationStore";
import type { RoomConfig, FloorConfig } from "@/types/navigation";

function RoomCard({
  room,
  floor,
  onClick,
}: {
  room: RoomConfig;
  floor: FloorConfig;
  onClick: () => void;
}): React.ReactNode {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col border border-slate-800 rounded-lg bg-slate-900 hover:border-slate-600 hover:bg-slate-800/80 transition-all duration-200 overflow-hidden w-56 flex-shrink-0"
    >
      {/* Room header with accent */}
      <div
        className="px-4 py-2 border-b border-slate-800 flex items-center gap-2"
        style={{ backgroundColor: floor.accent + "10" }}
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: floor.accent }}
        />
        <span className="text-sm font-bold text-white truncate">
          {room.repo_name}
        </span>
      </div>

      {/* Room content placeholder */}
      <div className="px-4 py-6 flex flex-col items-center gap-2">
        {/* Desk icons */}
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-5 h-4 bg-slate-800 rounded-sm group-hover:bg-slate-700 transition-colors"
            />
          ))}
        </div>
        <span className="text-xs text-slate-600 font-mono">idle</span>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-800 flex justify-between items-center">
        <span className="text-[10px] text-slate-600 font-mono uppercase">
          0 agents
        </span>
        <span className="text-slate-600 group-hover:text-slate-400 transition-colors">
          →
        </span>
      </div>
    </button>
  );
}

export function FloorView(): React.ReactNode {
  const { buildingConfig, floorId, goToRoom } = useNavigationStore();

  const floor = buildingConfig?.floors.find((f) => f.id === floorId);
  if (!floor) return null;

  return (
    <div className="flex flex-col h-full p-6">
      {/* Floor header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">{floor.icon}</span>
        <div>
          <h2 className="text-2xl font-bold" style={{ color: floor.accent }}>
            {floor.name}
          </h2>
          <p className="text-sm text-slate-500 font-mono">
            Floor {floor.floor_number} — {floor.rooms.length} room
            {floor.rooms.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Room cards */}
      <div className="flex-grow flex items-start gap-3 overflow-x-auto pb-4">
        {floor.rooms.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            floor={floor}
            onClick={() => goToRoom(floor.id, room.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/views/FloorView.tsx
git commit -m "feat: add FloorView component with scrollable room cards"
```

---

### Task 9: Room View Wrapper

**Files:**
- Create: `frontend/src/components/views/RoomView.tsx`

- [ ] **Step 1: Create the room view wrapper**

This wraps the existing OfficeGame component and sidebars. For Phase 2, it renders the same single-room view regardless of which room is selected. Phase 3 will add room-scoped state.

Create `frontend/src/components/views/RoomView.tsx`:

```typescript
"use client";

import dynamic from "next/dynamic";
import { useNavigationStore } from "@/stores/navigationStore";
import { SessionSidebar } from "@/components/layout/SessionSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import type { Session } from "@/hooks/useSessions";

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

interface RoomViewProps {
  sessions: Session[];
  sessionsLoading: boolean;
  sessionId: string;
  leftSidebarCollapsed: boolean;
  onToggleLeftSidebar: () => void;
  onSessionSelect: (id: string) => Promise<void>;
  onDeleteSession: (session: Session) => void;
}

export function RoomView({
  sessions,
  sessionsLoading,
  sessionId,
  leftSidebarCollapsed,
  onToggleLeftSidebar,
  onSessionSelect,
  onDeleteSession,
}: RoomViewProps): React.ReactNode {
  const { floorId, roomId, buildingConfig } = useNavigationStore();
  const floor = buildingConfig?.floors.find((f) => f.id === floorId);
  const room = floor?.rooms.find((r) => r.id === roomId);

  return (
    <div className="flex-grow flex gap-2 overflow-hidden min-h-0">
      <SessionSidebar
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        sessionId={sessionId}
        isCollapsed={leftSidebarCollapsed}
        onToggleCollapsed={onToggleLeftSidebar}
        onSessionSelect={onSessionSelect}
        onDeleteSession={onDeleteSession}
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

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/views/RoomView.tsx
git commit -m "feat: add RoomView wrapper around OfficeGame with room label overlay"
```

---

### Task 10: Wire View Routing into page.tsx

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Add imports for new components and hooks**

At the top of `page.tsx`, after the existing imports, add:

```typescript
import { useFloorConfig } from "@/hooks/useFloorConfig";
import { useNavigationStore } from "@/stores/navigationStore";
import { Breadcrumb } from "@/components/navigation/Breadcrumb";
import { BuildingView } from "@/components/views/BuildingView";
import { FloorView } from "@/components/views/FloorView";
import { RoomView } from "@/components/views/RoomView";
```

- [ ] **Step 2: Remove the old dynamic OfficeGame import**

Delete the `const OfficeGame = dynamic(...)` block at lines 42-55 of page.tsx (the RoomView now handles this).

- [ ] **Step 3: Add hooks and store subscriptions**

Inside the `V2TestPage` component, after the existing store subscriptions block, add:

```typescript
  // ------------------------------------------------------------------
  // Floor configuration + navigation
  // ------------------------------------------------------------------
  useFloorConfig();
  const view = useNavigationStore((s) => s.view);
```

- [ ] **Step 4: Add Breadcrumb to the header**

Replace the `<h1>` block in the header with the breadcrumb + title. Find the `<h1>` element (around line 303) and replace the entire `<h1>...</h1>` with:

```tsx
          <div className="flex items-center gap-3">
            <h1
              className={`font-bold text-white tracking-tight flex items-center gap-2 ${
                isMobile ? "text-lg" : "text-2xl"
              }`}
            >
              <span className="text-orange-500">Claude</span>{" "}
              {!isMobile && "Office Visualizer"}
              {!isMobile && (
                <span className="text-xs font-mono font-normal px-2 py-0.5 bg-slate-800 rounded text-slate-400 border border-slate-700">
                  v0.11.0
                </span>
              )}
            </h1>
            {!isMobile && (
              <div className="border-l border-slate-800 pl-3">
                <Breadcrumb />
              </div>
            )}
          </div>
```

- [ ] **Step 5: Replace the desktop main content area**

Find the desktop content block (the `else` branch around line 378 that renders `SessionSidebar`, `OfficeGame`, and `RightSidebar`). Replace the entire desktop content section:

```tsx
        <div className="flex-grow flex gap-2 overflow-hidden min-h-0">
          {view === "building" && <BuildingView />}
          {view === "floor" && <FloorView />}
          {view === "room" && (
            <RoomView
              sessions={sessions}
              sessionsLoading={sessionsLoading}
              sessionId={sessionId}
              leftSidebarCollapsed={leftSidebarCollapsed}
              onToggleLeftSidebar={() =>
                setLeftSidebarCollapsed(!leftSidebarCollapsed)
              }
              onSessionSelect={handleSessionSelect}
              onDeleteSession={setSessionPendingDelete}
            />
          )}
        </div>
```

- [ ] **Step 6: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Verify in browser**

Open `http://localhost:3000`:
- Should see Building View by default with 3 floors (Recepthor, Lexio, entreperros)
- Click Recepthor → Floor View with 5 room cards
- Click recepthor-api → Room View with the pixel art office
- Breadcrumb shows `🏢 Panoptica / ⚖️ Recepthor / recepthor-api`
- Click breadcrumb segments to navigate back

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: wire three-tier navigation into main page with view routing"
```

---

### Task 11: Run Full Checks + Final Commit

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

Expected: lint, typecheck, build, tests all pass

- [ ] **Step 3: Fix any issues found by checks**

If linting or type errors are found, fix them and re-run.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve lint and type check issues from Phase 2 integration"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] Building View as default landing page (Task 7, Task 10)
- [x] Floor View with room cards (Task 8)
- [x] Room View with existing OfficeGame (Task 9)
- [x] Breadcrumb navigation (Task 6, Task 10)
- [x] `floors.toml` configuration (Task 1)
- [x] Zustand navigation store (Task 4)
- [x] API endpoint for floor config (Task 2)
- [x] Recepthor + Lexio + entreperros floors configured (Task 1 Step 6)

**2. Placeholder scan:** No TBD/TODO. All code provided in full.

**3. Type consistency:**
- `FloorConfig` / `RoomConfig` / `BuildingConfig` — consistent between backend (Pydantic) and frontend (TypeScript)
- `ViewMode` = `"building" | "floor" | "room"` — consistent in store and page routing
- `goToBuilding/goToFloor/goToRoom` — consistent between store and component calls
- `useNavigationStore` — same import path everywhere

**Phase 2 deliverable:** Click through Building → Floor → Room with the original single-room PixiJS rendering at the deepest level. Breadcrumb navigation enables back-travel.
