# PixiJS Multi-Room Office Design Spec

> Date: 2026-04-08

## Goal

Replace the HTML-based ProjectRoomGrid with a PixiJS-rendered multi-room view. When the user clicks "Projects", the same PixiJS canvas shows multiple complete mini-offices (one per project), each with full furniture and agent animations at 50% scale, separated by walking corridors.

## User Requirements

1. Click "Projects" → see all project rooms in one PixiJS canvas
2. Each room is a **complete mini-office** — same as the All Merged view but smaller
3. Full furniture: clock, whiteboard, safety sign, city window, water cooler, coffee machine, printer, plant, elevator, employee of month, boss rug
4. Full agent animations: walking, typing, bubbles, arrival/departure queues
5. Each room has a project name label + color border
6. Rooms arranged in a 2-column grid with walking corridor gaps
7. "Office" button switches back to All Merged view (existing behavior unchanged)

## Architecture

### Rendering Strategy

Reuse ALL existing OfficeGame sub-components inside per-project `<pixiContainer>` wrappers with `scale` and position offsets. No new rendering components needed — just composition.

```
OfficeGame.tsx (modified)
├─ viewMode === "all-merged"
│   └─ existing rendering (unchanged)
│
└─ viewMode === "overview"
    └─ for each project in projectStore.projects:
        └─ <pixiContainer scale={ROOM_SCALE} x={col*ROOM_OFFSET_X} y={row*ROOM_OFFSET_Y}>
            ├─ <RoomLabel name={project.name} color={project.color} />
            ├─ <OfficeBackground />        ← existing component
            ├─ <WallClock />               ← existing component
            ├─ <Whiteboard todos={project.todos} />
            ├─ <SafetySign />
            ├─ <CityWindow />
            ├─ <EmployeeOfTheMonth />
            ├─ <Elevator />
            ├─ <DeskSurfacesBase />
            ├─ <DeskSurfacesTop />
            ├─ <BossSprite />              ← per-room boss state
            ├─ <AgentSprite /> × N         ← per-room agents
            └─ sprites (water cooler, coffee, plant, printer, boss rug)
        </pixiContainer>
```

### Data Flow

```
Backend (existing)                    Frontend
─────────────────                    ────────
/ws/projects                         projectStore
  → MultiProjectGameState             → projects: ProjectGroup[]
    → projects[]:                        each has: agents[], boss, todos
      { key, name, color,
        agents[], boss,              OfficeGame reads projectStore
        sessionCount, todos }         when viewMode === "overview"
```

Each room gets its data from `projectStore.projects[i]`, NOT from the global `gameStore`. The global `gameStore` continues to serve the All Merged view.

### Room Layout Constants

```typescript
const ROOM_SCALE = 0.5;           // Each room is 50% of full office
const ROOM_GAP_X = 32;            // Horizontal corridor between rooms
const ROOM_GAP_Y = 32;            // Vertical corridor between rooms
const ROOM_COLS = 2;              // 2-column grid
const FULL_ROOM_W = 1280;         // Full office canvas width
const FULL_ROOM_H = 1024;         // Full office canvas height (8 desks)

// Rendered room size = FULL_ROOM_W * ROOM_SCALE = 640px
// Rendered room height = FULL_ROOM_H * ROOM_SCALE = 512px
```

Canvas total size adjusts dynamically based on project count:
- 1-2 projects: 1 row
- 3-4 projects: 2 rows
- 5-6 projects: 3 rows

### Key Changes

#### 1. OfficeGame.tsx — Conditional Rendering

The main change. When `viewMode === "overview"`:
- Read `projects` from `projectStore` instead of `gameStore`
- For each project, render a complete office inside a scaled container
- Each room's sub-components receive that project's agents/boss/todos as props
- Canvas width/height adjusts to fit the grid

When `viewMode === "all-merged"`:
- Existing rendering completely unchanged

#### 2. Sub-Component Prop Drilling

Currently, components like `AgentSprite`, `BossSprite`, `Whiteboard` read from `gameStore` directly via selectors. For multi-room rendering, they need to accept **optional props** that override the store data.

Pattern:
```typescript
// Before (reads global store):
function Whiteboard() {
  const todos = useGameStore(selectTodos);
  ...
}

// After (props override store):
function Whiteboard({ todos: propTodos }: { todos?: TodoItem[] }) {
  const storeTodos = useGameStore(selectTodos);
  const todos = propTodos ?? storeTodos;
  ...
}
```

This preserves backward compatibility — All Merged view passes no props (uses store), Overview passes per-room data.

Components that need this change:
- `Whiteboard` — needs per-room `todos`
- `BossSprite` / `BossBubble` — needs per-room `boss` state
- `SafetySign` — needs per-room tool count
- `DeskGrid` — needs per-room `deskCount` / `occupiedDesks`
- `Elevator` — needs per-room agent list
- `AgentSprite` — already receives agent data as props (no change)

#### 3. Room Label Component

New small PixiJS component rendered above each room:

```typescript
function RoomLabel({ name, color, width }: { name: string; color: string; width: number }) {
  // Colored bar at top of room + project name text
  // Width matches the scaled room width
}
```

#### 4. Delete HTML Components

Remove the HTML-based components that are no longer needed:
- `frontend/src/components/game/MiniOffice.tsx` → delete
- `frontend/src/components/game/ProjectRoomGrid.tsx` → replace with PixiJS rendering in OfficeGame

#### 5. Animation System

Each room needs independent agent animation state. The current `animationSystem` drives agents from `gameStore`. For overview mode:
- Create per-room animation state derived from each `ProjectGroup.agents[]`
- Or: render agents in static poses (working/idle) for v1, add full animation later

**Recommendation:** Start with static agent poses for v1 (agents at desks, correct state-based sprite frame, bubbles showing). Full walk animation per-room is complex and can be added incrementally.

### Page.tsx Changes

- Remove the dynamic import of `ProjectRoomGrid` (HTML version)
- The view mode toggle ("Office" / "Projects") stays — it just switches `viewMode` in `projectStore`
- OfficeGame handles the rendering internally based on `viewMode`

## Non-Goals

- Room-detail zoom view (sidebar session switching already covers this)
- Per-room independent animation system (v1 uses static poses)
- Room furniture customization
- Agent migration between rooms
- Room-specific whiteboard modes (all rooms show same mode)
