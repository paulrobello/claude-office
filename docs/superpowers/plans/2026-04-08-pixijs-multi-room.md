# PixiJS Multi-Room Office Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the HTML-based ProjectRoomGrid with PixiJS-rendered mini-offices — one per project, each with full furniture and agent sprites at 50% scale in a 2-column grid on the same canvas.

**Architecture:** Extract the entire OfficeGame rendering body into a reusable `OfficeRoom` component. In overview mode, render one `OfficeRoom` per project inside a scaled `<pixiContainer>`. A `RoomContext` provides per-room data (agents, boss, todos) so sub-components read room data instead of the global store. Animation system is skipped in overview mode — agents show static poses.

**Tech Stack:** React + @pixi/react (PixiJS), Zustand (state), Vitest (tests)

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `frontend/src/contexts/RoomContext.tsx` | React context providing per-room data to sub-components |
| `frontend/src/components/game/OfficeRoom.tsx` | Extracted office rendering body — reusable for both single and multi-room |
| `frontend/src/components/game/RoomLabel.tsx` | PixiJS project name label + color bar above each room |
| `frontend/src/components/game/MultiRoomCanvas.tsx` | Renders multiple `OfficeRoom` in a 2-col grid with scale + positioning |
| `frontend/tests/roomContext.test.ts` | Tests for RoomContext hooks |
| `frontend/tests/multiRoom.test.ts` | Tests for grid layout calculations |

### Modified files
| File | Changes |
|------|---------|
| `frontend/src/components/game/OfficeGame.tsx` | Delegate to `OfficeRoom` (all-merged) or `MultiRoomCanvas` (overview); skip animation system in overview |
| `frontend/src/components/game/Whiteboard.tsx:139-145` | Use `useRoomContext()` fallback for todos, whiteboardData, agents |
| `frontend/src/components/game/SafetySign.tsx:17` | Use `useRoomContext()` fallback for toolUsesSinceCompaction |
| `frontend/src/components/game/Elevator.tsx` | Accept optional room-level agent override |
| `frontend/src/constants/rooms.ts` | Add PixiJS room scale/offset constants |

### Deleted files
| File | Reason |
|------|--------|
| `frontend/src/components/game/MiniOffice.tsx` | Replaced by PixiJS OfficeRoom |
| `frontend/src/components/game/ProjectRoomGrid.tsx` | Replaced by MultiRoomCanvas |

---

## Task 1: RoomContext — Context Provider for Per-Room Data

**Files:**
- Create: `frontend/src/contexts/RoomContext.tsx`
- Test: `frontend/tests/roomContext.test.ts`

- [ ] **Step 1: Write failing tests for RoomContext**

```typescript
// frontend/tests/roomContext.test.ts
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { RoomProvider, useRoomAgents, useRoomBoss, useRoomTodos, useRoomToolUses } from "../src/contexts/RoomContext";
import type { ProjectGroup } from "../src/types/projects";

function makeProject(): ProjectGroup {
  return {
    key: "test",
    name: "Test Project",
    color: "#3B82F6",
    root: "/test",
    agents: [
      { id: "a1", name: "Agent 1", color: "#fff", number: 1, state: "working" as const, desk: 1 },
    ],
    boss: { state: "working" as const, currentTask: "Building", bubble: null, position: { x: 640, y: 830 } },
    sessionCount: 1,
    todos: [{ id: "1", content: "Do thing", status: "in_progress" }],
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(RoomProvider, { project: makeProject() }, children);
}

describe("RoomContext", () => {
  it("useRoomAgents returns project agents", () => {
    const { result } = renderHook(() => useRoomAgents(), { wrapper });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe("Agent 1");
  });

  it("useRoomBoss returns project boss", () => {
    const { result } = renderHook(() => useRoomBoss(), { wrapper });
    expect(result.current.state).toBe("working");
    expect(result.current.currentTask).toBe("Building");
  });

  it("useRoomTodos returns project todos", () => {
    const { result } = renderHook(() => useRoomTodos(), { wrapper });
    expect(result.current).toHaveLength(1);
  });

  it("hooks return null outside provider", () => {
    const { result } = renderHook(() => useRoomAgents());
    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 2: Install @testing-library/react if not present**

Run: `cd frontend && npm ls @testing-library/react 2>&1 || npm install -D @testing-library/react`

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/roomContext.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement RoomContext**

```typescript
// frontend/src/contexts/RoomContext.tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ProjectGroup } from "@/types/projects";
import type { Agent, Boss, TodoItem } from "@/types";

interface RoomContextValue {
  project: ProjectGroup;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({
  project,
  children,
}: {
  project: ProjectGroup;
  children: ReactNode;
}) {
  return (
    <RoomContext.Provider value={{ project }}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoomContext(): RoomContextValue | null {
  return useContext(RoomContext);
}

/** Returns room agents if inside RoomProvider, null otherwise. */
export function useRoomAgents(): Agent[] | null {
  const ctx = useContext(RoomContext);
  return ctx ? ctx.project.agents : null;
}

/** Returns room boss if inside RoomProvider, null otherwise. */
export function useRoomBoss(): Boss | null {
  const ctx = useContext(RoomContext);
  return ctx ? ctx.project.boss : null;
}

/** Returns room todos if inside RoomProvider, null otherwise. */
export function useRoomTodos(): TodoItem[] | null {
  const ctx = useContext(RoomContext);
  return ctx ? ctx.project.todos : null;
}

/** Returns room tool use count (from whiteboard data if available). */
export function useRoomToolUses(): number | null {
  // Tool uses are not yet tracked per-project; return null to fall back to store
  return null;
}

/** Returns whether we're inside a RoomProvider (overview mode). */
export function useIsInRoom(): boolean {
  return useContext(RoomContext) !== null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/roomContext.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/contexts/RoomContext.tsx frontend/tests/roomContext.test.ts
git commit -m "feat: add RoomContext for per-room data in multi-room view"
```

---

## Task 2: Update Room Constants for PixiJS Layout

**Files:**
- Modify: `frontend/src/constants/rooms.ts`
- Test: `frontend/tests/rooms.test.ts`

- [ ] **Step 1: Add failing test for getMultiRoomCanvasSize**

Add to `frontend/tests/rooms.test.ts`:

```typescript
import { getMultiRoomCanvasSize, ROOM_SCALE, SCALED_ROOM_W, SCALED_ROOM_H } from "../src/constants/rooms";

describe("getMultiRoomCanvasSize", () => {
  it("returns correct canvas size for 1 project", () => {
    const size = getMultiRoomCanvasSize(1, 1024);
    expect(size.width).toBe(SCALED_ROOM_W);
    expect(size.height).toBeGreaterThan(SCALED_ROOM_H);
  });

  it("returns correct canvas size for 2 projects", () => {
    const size = getMultiRoomCanvasSize(2, 1024);
    expect(size.width).toBeGreaterThan(SCALED_ROOM_W); // 2 cols
  });

  it("returns correct canvas size for 4 projects", () => {
    const size = getMultiRoomCanvasSize(4, 1024);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(2);
  });

  it("ROOM_SCALE is 0.5", () => {
    expect(ROOM_SCALE).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/rooms.test.ts`
Expected: FAIL — `getMultiRoomCanvasSize` not found

- [ ] **Step 3: Add PixiJS room constants**

Add to `frontend/src/constants/rooms.ts`:

```typescript
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "./canvas";

/** Scale factor for rooms in overview mode */
export const ROOM_SCALE = 0.5;

/** Scaled room dimensions */
export const SCALED_ROOM_W = CANVAS_WIDTH * ROOM_SCALE;   // 640
export const SCALED_ROOM_H = CANVAS_HEIGHT * ROOM_SCALE;  // 512

/** Calculate canvas size needed for N rooms in overview mode */
export function getMultiRoomCanvasSize(projectCount: number, roomHeight: number = CANVAS_HEIGHT) {
  const cols = Math.min(projectCount, ROOM_GRID_COLS);
  const rows = Math.ceil(projectCount / ROOM_GRID_COLS);
  const scaledW = CANVAS_WIDTH * ROOM_SCALE;
  const scaledH = roomHeight * ROOM_SCALE;
  return {
    cols,
    rows,
    width: cols * scaledW + (cols - 1) * ROOM_GAP + ROOM_GAP * 2,
    height: rows * scaledH + (rows - 1) * ROOM_GAP + ROOM_GAP * 2,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/rooms.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/constants/rooms.ts frontend/tests/rooms.test.ts
git commit -m "feat: add PixiJS room scale/offset constants"
```

---

## Task 3: RoomLabel Component

**Files:**
- Create: `frontend/src/components/game/RoomLabel.tsx`

- [ ] **Step 1: Create RoomLabel PixiJS component**

```typescript
// frontend/src/components/game/RoomLabel.tsx
"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { Graphics as PixiGraphics, TextStyle } from "pixi.js";
import { CANVAS_WIDTH } from "@/constants/canvas";

interface RoomLabelProps {
  name: string;
  color: string;
  agentCount: number;
  sessionCount: number;
}

export function RoomLabel({ name, color, agentCount, sessionCount }: RoomLabelProps): ReactNode {
  const colorHex = parseInt(color.slice(1), 16);

  const drawBar = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      // Color bar background
      g.roundRect(0, 0, CANVAS_WIDTH, 40, 4);
      g.fill({ color: colorHex, alpha: 0.3 });
      // Color accent line at top
      g.rect(0, 0, CANVAS_WIDTH, 4);
      g.fill(colorHex);
    },
    [colorHex]
  );

  const nameStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 20,
        fontWeight: "bold",
        fill: color,
      }),
    [color]
  );

  const countStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 14,
        fill: "#94a3b8",
      }),
    []
  );

  return (
    <pixiContainer y={-48}>
      <pixiGraphics draw={drawBar} />
      <pixiText text={name} style={nameStyle} x={12} y={10} />
      <pixiText
        text={`${agentCount} agents · ${sessionCount} sessions`}
        style={countStyle}
        x={CANVAS_WIDTH - 12}
        y={14}
        anchor={{ x: 1, y: 0 }}
      />
    </pixiContainer>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/game/RoomLabel.tsx
git commit -m "feat: add RoomLabel PixiJS component for project rooms"
```

---

## Task 4: OfficeRoom — Extract Reusable Office Rendering

This is the largest task. Extract the entire office rendering body from `OfficeGame.tsx` into a standalone `OfficeRoom` component that receives all its data as props.

**Files:**
- Create: `frontend/src/components/game/OfficeRoom.tsx`
- Modify: `frontend/src/components/game/OfficeGame.tsx`

- [ ] **Step 1: Study OfficeGame.tsx rendering body**

Read `OfficeGame.tsx` lines 267-594. The rendering body consists of:
1. OfficeBackground (floor/walls)
2. Boss rug sprite
3. Wall decorations (EmployeeOfTheMonth, CityWindow, SafetySign, WallClock, wallOutlet, Whiteboard, waterCooler, coffeeMachine)
4. PrinterStation, plant
5. Elevator
6. Y-sorted layer (chairs + agents)
7. DeskSurfacesBase (desks + keyboards)
8. Agent arms, headsets
9. DeskSurfacesTop (monitors + accessories)
10. BossSprite
11. MobileBoss + TrashCanSprite (compaction)
12. Debug overlays
13. Labels layer
14. Bubbles layer

- [ ] **Step 2: Create OfficeRoom component**

Create `frontend/src/components/game/OfficeRoom.tsx`. This component receives textures and renders the complete office. When inside a `RoomProvider` (overview mode), it uses room data. Otherwise, it reads from `gameStore` (all-merged mode).

```typescript
// frontend/src/components/game/OfficeRoom.tsx
"use client";

import { useMemo, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import type { OfficeTextures } from "@/hooks/useOfficeTextures";
import type { TodoItem } from "@/types";
import {
  useGameStore,
  selectAgents,
  selectBoss,
  selectTodos,
  selectElevatorState,
  selectContextUtilization,
  selectPrintReport,
} from "@/stores/gameStore";
import { useRoomContext } from "@/contexts/RoomContext";
import { getCanvasHeight, CANVAS_WIDTH } from "@/constants/canvas";
import {
  EMPLOYEE_OF_MONTH_POSITION,
  CITY_WINDOW_POSITION,
  SAFETY_SIGN_POSITION,
  WALL_CLOCK_POSITION,
  WALL_OUTLET_POSITION,
  WHITEBOARD_POSITION,
  WATER_COOLER_POSITION,
  COFFEE_MACHINE_POSITION,
  PRINTER_STATION_POSITION,
  PLANT_POSITION,
  BOSS_RUG_POSITION,
  TRASH_CAN_OFFSET,
} from "@/constants/positions";

import { OfficeBackground } from "./OfficeBackground";
import { EmployeeOfTheMonth } from "./EmployeeOfTheMonth";
import { CityWindow } from "./CityWindow";
import { SafetySign } from "./SafetySign";
import { WallClock } from "./WallClock";
import { Whiteboard } from "./Whiteboard";
import { PrinterStation } from "./PrinterStation";
import { Elevator, isAgentInElevator } from "./Elevator";
import { DeskSurfacesBase, DeskSurfacesTop, useDeskPositions } from "./DeskGrid";
import { BossSprite } from "./BossSprite";
import { AgentSprite, AgentArms, AgentHeadset, AgentLabel, Bubble as AgentBubble } from "./AgentSprite";
import { BossBubble } from "./BossSprite";
import { TrashCanSprite } from "./TrashCanSprite";
import { isInElevatorZone } from "@/systems/queuePositions";

interface OfficeRoomProps {
  textures: OfficeTextures;
  isOverview?: boolean; // true when rendering as a mini-room
}

export function OfficeRoom({ textures, isOverview = false }: OfficeRoomProps): ReactNode {
  // -- Data source: room context (overview) or global store (all-merged) --
  const roomCtx = useRoomContext();

  // Global store values (used in all-merged mode)
  const storeAgents = useGameStore(useShallow(selectAgents));
  const storeBoss = useGameStore(selectBoss);
  const storeTodos = useGameStore(selectTodos);
  const elevatorState = useGameStore(selectElevatorState);
  const contextUtilization = useGameStore(selectContextUtilization);
  const printReport = useGameStore(selectPrintReport);

  // Pick data source
  const isRoom = roomCtx !== null;

  // For overview mode: use room data with simplified agents
  // For all-merged mode: use store data with full animation state
  const todos: TodoItem[] = isRoom ? roomCtx.project.todos : storeTodos;
  const isElevatorOpen = isRoom ? false : elevatorState === "open";

  // Desk count
  const agentCount = isRoom ? roomCtx.project.agents.length : storeAgents.size;
  const deskCount = Math.max(8, Math.ceil(agentCount / 4) * 4);
  const canvasHeight = getCanvasHeight(deskCount);

  // Occupied desks
  const occupiedDesks = useMemo(() => {
    if (isRoom) {
      const desks = new Set<number>();
      roomCtx.project.agents.forEach((a, i) => desks.add(a.desk ?? i + 1));
      return desks;
    }
    const desks = new Set<number>();
    for (const agent of storeAgents.values()) {
      if (agent.desk && agent.phase === "idle") desks.add(agent.desk);
    }
    return desks;
  }, [isRoom, roomCtx, storeAgents]);

  // Desk tasks
  const deskTasks = useMemo(() => {
    const tasks = new Map<number, string>();
    if (isRoom) {
      roomCtx.project.agents.forEach((a, i) => {
        const desk = a.desk ?? i + 1;
        const label = a.currentTask ?? a.name ?? "";
        if (label) tasks.set(desk, label);
      });
    } else {
      for (const agent of storeAgents.values()) {
        if (agent.desk && agent.phase === "idle") {
          const label = agent.currentTask ?? agent.name ?? "";
          if (label) tasks.set(agent.desk, label);
        }
      }
    }
    return tasks;
  }, [isRoom, roomCtx, storeAgents]);

  const deskPositions = useDeskPositions(deskCount, occupiedDesks);

  // Boss data
  const bossState = isRoom ? roomCtx.project.boss.state : storeBoss.backendState;
  const bossPosition = isRoom ? roomCtx.project.boss.position ?? { x: 640, y: 830 } : storeBoss.position;
  const bossBubble = isRoom ? roomCtx.project.boss.bubble : storeBoss.bubble.content;
  const bossCurrentTask = isRoom ? roomCtx.project.boss.currentTask : storeBoss.currentTask;

  return (
    <>
      {/* Floor and walls */}
      <OfficeBackground floorTileTexture={textures.floorTile} canvasHeight={canvasHeight} />

      {/* Boss area rug */}
      {textures.bossRug && (
        <pixiSprite texture={textures.bossRug} anchor={0.5} x={BOSS_RUG_POSITION.x} y={BOSS_RUG_POSITION.y} scale={0.3} />
      )}

      {/* Wall decorations */}
      <pixiContainer x={EMPLOYEE_OF_MONTH_POSITION.x} y={EMPLOYEE_OF_MONTH_POSITION.y}>
        <EmployeeOfTheMonth />
      </pixiContainer>
      <pixiContainer x={CITY_WINDOW_POSITION.x} y={CITY_WINDOW_POSITION.y}>
        <CityWindow />
      </pixiContainer>
      <pixiContainer x={SAFETY_SIGN_POSITION.x} y={SAFETY_SIGN_POSITION.y}>
        <SafetySign />
      </pixiContainer>
      <pixiContainer x={WALL_CLOCK_POSITION.x} y={WALL_CLOCK_POSITION.y}>
        <WallClock />
      </pixiContainer>
      {textures.wallOutlet && (
        <pixiSprite texture={textures.wallOutlet} anchor={0.5} x={WALL_OUTLET_POSITION.x} y={WALL_OUTLET_POSITION.y} scale={0.04} />
      )}
      <pixiContainer x={WHITEBOARD_POSITION.x} y={WHITEBOARD_POSITION.y}>
        <Whiteboard todos={todos} />
      </pixiContainer>
      {textures.waterCooler && (
        <pixiSprite texture={textures.waterCooler} anchor={0.5} x={WATER_COOLER_POSITION.x} y={WATER_COOLER_POSITION.y} scale={0.198} />
      )}
      {textures.coffeeMachine && (
        <pixiSprite texture={textures.coffeeMachine} anchor={0.5} x={COFFEE_MACHINE_POSITION.x} y={COFFEE_MACHINE_POSITION.y} scale={0.1} />
      )}

      {/* Printer station */}
      <PrinterStation
        x={PRINTER_STATION_POSITION.x}
        y={PRINTER_STATION_POSITION.y}
        isPrinting={false}
        deskTexture={textures.desk}
        printerTexture={textures.printer}
      />

      {/* Plant */}
      {textures.plant && (
        <pixiSprite texture={textures.plant} anchor={0.5} x={PLANT_POSITION.x} y={PLANT_POSITION.y} scale={0.1} />
      )}

      {/* Elevator */}
      <Elevator
        isOpen={isElevatorOpen}
        agents={isRoom ? new Map() : storeAgents}
        frameTexture={textures.elevatorFrame}
        doorTexture={textures.elevatorDoor}
        headsetTexture={textures.headset}
        sunglassesTexture={textures.sunglasses}
      />

      {/* Chairs */}
      <pixiContainer sortableChildren={true}>
        {deskPositions.map((desk, i) => (
          <pixiContainer key={`chair-${i}`} x={desk.x} y={desk.y} zIndex={desk.y + 20}>
            {textures.chair && <pixiSprite texture={textures.chair} anchor={0.5} x={0} y={30} scale={0.1386} />}
          </pixiContainer>
        ))}

        {/* Overview mode: render agents at desk positions with static poses */}
        {isRoom &&
          roomCtx.project.agents.map((agent, i) => {
            const desk = deskPositions[agent.desk ? agent.desk - 1 : i];
            if (!desk) return null;
            return (
              <pixiContainer key={agent.id} zIndex={desk.y}>
                <AgentSprite
                  id={agent.id}
                  name={agent.name ?? null}
                  color={agent.color}
                  number={agent.number}
                  position={{ x: desk.x, y: desk.y }}
                  phase="idle"
                  bubble={agent.bubble ?? null}
                  headsetTexture={textures.headset}
                  sunglassesTexture={textures.sunglasses}
                  renderBubble={false}
                  renderLabel={false}
                  isTyping={agent.state === "working"}
                />
              </pixiContainer>
            );
          })}

        {/* All-merged mode: render animated agents */}
        {!isRoom &&
          Array.from(storeAgents.values())
            .filter((agent) => !isAgentInElevator(agent.currentPosition.x, agent.currentPosition.y))
            .map((agent) => (
              <pixiContainer key={agent.id} zIndex={agent.currentPosition.y}>
                <AgentSprite
                  id={agent.id}
                  name={agent.name}
                  color={agent.color}
                  number={agent.number}
                  position={agent.currentPosition}
                  phase={agent.phase}
                  bubble={agent.bubble.content}
                  headsetTexture={textures.headset}
                  sunglassesTexture={textures.sunglasses}
                  renderBubble={false}
                  renderLabel={false}
                  isTyping={agent.isTyping}
                />
              </pixiContainer>
            ))}
      </pixiContainer>

      {/* Desk surfaces */}
      <DeskSurfacesBase
        deskCount={deskCount}
        occupiedDesks={occupiedDesks}
        deskTexture={textures.desk}
        keyboardTexture={textures.keyboard}
      />

      {/* Agent arms (all-merged only — overview agents are at static pose) */}
      {!isRoom &&
        Array.from(storeAgents.values())
          .filter((agent) => agent.phase === "idle")
          .map((agent) => (
            <AgentArms key={`arms-${agent.id}`} position={agent.currentPosition} isTyping={agent.isTyping} />
          ))}

      {/* Overview mode: agent arms at desk positions */}
      {isRoom &&
        roomCtx.project.agents.map((agent, i) => {
          const desk = deskPositions[agent.desk ? agent.desk - 1 : i];
          if (!desk) return null;
          return <AgentArms key={`arms-${agent.id}`} position={{ x: desk.x, y: desk.y }} isTyping={agent.state === "working"} />;
        })}

      {/* Headsets */}
      {textures.headset && !isRoom &&
        Array.from(storeAgents.values())
          .filter((agent) => agent.phase === "idle")
          .map((agent) => (
            <AgentHeadset key={`headset-${agent.id}`} position={agent.currentPosition} headsetTexture={textures.headset!} />
          ))}
      {textures.headset && isRoom &&
        roomCtx.project.agents.map((agent, i) => {
          const desk = deskPositions[agent.desk ? agent.desk - 1 : i];
          if (!desk) return null;
          return <AgentHeadset key={`headset-${agent.id}`} position={{ x: desk.x, y: desk.y }} headsetTexture={textures.headset!} />;
        })}

      {/* Monitors and accessories */}
      <DeskSurfacesTop
        deskCount={deskCount}
        occupiedDesks={occupiedDesks}
        deskTasks={deskTasks}
        monitorTexture={textures.monitor}
        coffeeMugTexture={textures.coffeeMug}
        staplerTexture={textures.stapler}
        deskLampTexture={textures.deskLamp}
        penHolderTexture={textures.penHolder}
        magic8BallTexture={textures.magic8Ball}
        rubiksCubeTexture={textures.rubiksCube}
        rubberDuckTexture={textures.rubberDuck}
        thermosTexture={textures.thermos}
      />

      {/* Boss */}
      <BossSprite
        position={bossPosition}
        state={bossState}
        bubble={bossBubble}
        inUseBy={null}
        currentTask={bossCurrentTask}
        chairTexture={textures.chair}
        deskTexture={textures.desk}
        keyboardTexture={textures.keyboard}
        monitorTexture={textures.monitor}
        phoneTexture={textures.phone}
        headsetTexture={textures.headset}
        sunglassesTexture={textures.sunglasses}
        renderBubble={false}
        isTyping={isRoom ? bossState === "working" : storeBoss.isTyping}
        isAway={false}
      />

      {/* Trash Can (all-merged only) */}
      {!isRoom && (
        <TrashCanSprite
          x={bossPosition.x + TRASH_CAN_OFFSET.x}
          y={bossPosition.y + TRASH_CAN_OFFSET.y}
          contextUtilization={contextUtilization}
          isCompacting={false}
          isStomping={false}
        />
      )}

      {/* Labels */}
      {isRoom
        ? roomCtx.project.agents.map((agent, i) => {
            const desk = deskPositions[agent.desk ? agent.desk - 1 : i];
            if (!desk || !agent.name) return null;
            return <AgentLabel key={`label-${agent.id}`} name={agent.name} position={{ x: desk.x, y: desk.y }} />;
          })
        : Array.from(storeAgents.values())
            .filter((agent) => agent.name && !isInElevatorZone(agent.currentPosition))
            .map((agent) => <AgentLabel key={`label-${agent.id}`} name={agent.name!} position={agent.currentPosition} />)}

      {/* Bubbles */}
      {isRoom
        ? roomCtx.project.agents
            .filter((a) => a.bubble)
            .map((agent, i) => {
              const desk = deskPositions[agent.desk ? agent.desk - 1 : i];
              if (!desk) return null;
              return (
                <pixiContainer key={`bubble-${agent.id}`} x={desk.x} y={desk.y}>
                  <AgentBubble content={agent.bubble!} yOffset={-80} />
                </pixiContainer>
              );
            })
        : Array.from(storeAgents.values())
            .filter((agent) => agent.bubble.content && !isInElevatorZone(agent.currentPosition))
            .map((agent) => (
              <pixiContainer key={`bubble-${agent.id}`} x={agent.currentPosition.x} y={agent.currentPosition.y}>
                <AgentBubble content={agent.bubble.content!} yOffset={-80} />
              </pixiContainer>
            ))}
      {bossBubble && (
        <pixiContainer x={bossPosition.x} y={bossPosition.y}>
          <BossBubble content={bossBubble} yOffset={-80} />
        </pixiContainer>
      )}
    </>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/game/OfficeRoom.tsx
git commit -m "feat: extract OfficeRoom component from OfficeGame rendering body"
```

---

## Task 5: MultiRoomCanvas — Grid of PixiJS Rooms

**Files:**
- Create: `frontend/src/components/game/MultiRoomCanvas.tsx`
- Test: `frontend/tests/multiRoom.test.ts`

- [ ] **Step 1: Write failing test for grid position calculation**

```typescript
// frontend/tests/multiRoom.test.ts
import { describe, expect, it } from "vitest";
import { getRoomPosition } from "../src/components/game/MultiRoomCanvas";
import { ROOM_SCALE, ROOM_GAP } from "../src/constants/rooms";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "../src/constants/canvas";

describe("getRoomPosition", () => {
  it("first room is at top-left with padding", () => {
    const pos = getRoomPosition(0);
    expect(pos.x).toBe(ROOM_GAP);
    expect(pos.y).toBe(ROOM_GAP);
  });

  it("second room is to the right of first", () => {
    const pos = getRoomPosition(1);
    expect(pos.x).toBeGreaterThan(getRoomPosition(0).x);
    expect(pos.y).toBe(ROOM_GAP);
  });

  it("third room wraps to second row", () => {
    const pos = getRoomPosition(2);
    expect(pos.x).toBe(ROOM_GAP);
    expect(pos.y).toBeGreaterThan(ROOM_GAP);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/multiRoom.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement MultiRoomCanvas**

```typescript
// frontend/src/components/game/MultiRoomCanvas.tsx
"use client";

import { type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore, selectProjects } from "@/stores/projectStore";
import { RoomProvider } from "@/contexts/RoomContext";
import { OfficeRoom } from "./OfficeRoom";
import { RoomLabel } from "./RoomLabel";
import { ROOM_SCALE, ROOM_GAP, ROOM_GRID_COLS } from "@/constants/rooms";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";
import type { OfficeTextures } from "@/hooks/useOfficeTextures";

/** Calculate the x,y position for a room at the given index. */
export function getRoomPosition(index: number) {
  const col = index % ROOM_GRID_COLS;
  const row = Math.floor(index / ROOM_GRID_COLS);
  const scaledW = CANVAS_WIDTH * ROOM_SCALE;
  const scaledH = CANVAS_HEIGHT * ROOM_SCALE;
  return {
    x: ROOM_GAP + col * (scaledW + ROOM_GAP),
    y: ROOM_GAP + row * (scaledH + ROOM_GAP + 24), // 24px for room label
  };
}

interface MultiRoomCanvasProps {
  textures: OfficeTextures;
}

export function MultiRoomCanvas({ textures }: MultiRoomCanvasProps): ReactNode {
  const projects = useProjectStore(useShallow(selectProjects));

  return (
    <>
      {projects.map((project, index) => {
        const pos = getRoomPosition(index);
        return (
          <pixiContainer
            key={project.key}
            x={pos.x}
            y={pos.y}
            scale={ROOM_SCALE}
          >
            <RoomLabel
              name={project.name}
              color={project.color}
              agentCount={project.agents.length}
              sessionCount={project.sessionCount}
            />
            <RoomProvider project={project}>
              <OfficeRoom textures={textures} isOverview={true} />
            </RoomProvider>
          </pixiContainer>
        );
      })}
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/multiRoom.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/game/MultiRoomCanvas.tsx frontend/tests/multiRoom.test.ts
git commit -m "feat: add MultiRoomCanvas for PixiJS multi-room grid"
```

---

## Task 6: Integrate into OfficeGame — Mode Switching

**Files:**
- Modify: `frontend/src/components/game/OfficeGame.tsx`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Update OfficeGame to use OfficeRoom + MultiRoomCanvas**

In `OfficeGame.tsx`, make these changes:

1. Import `MultiRoomCanvas`, `OfficeRoom`, `useProjectStore`, `selectViewMode`, `getMultiRoomCanvasSize`
2. Skip `useAnimationSystem()` when `viewMode === "overview"`
3. Switch `<Application>` dimensions based on viewMode
4. Replace the rendering body with `<OfficeRoom>` or `<MultiRoomCanvas>`

Key changes to `OfficeGame.tsx`:

```typescript
// Add imports:
import { MultiRoomCanvas } from "./MultiRoomCanvas";
import { OfficeRoom } from "./OfficeRoom";
import { useProjectStore, selectViewMode, selectProjects } from "@/stores/projectStore";
import { getMultiRoomCanvasSize } from "@/constants/rooms";

// Inside OfficeGame():
const viewMode = useProjectStore(selectViewMode);
const projects = useProjectStore(selectProjects);

// Always call animation hook (React rules) but disable in overview mode
useAnimationSystem({ enabled: viewMode === "all-merged" });

// Calculate canvas dimensions
const multiRoomSize = useMemo(
  () => getMultiRoomCanvasSize(projects.length),
  [projects.length]
);
const appWidth = viewMode === "overview" ? multiRoomSize.width : CANVAS_WIDTH;
const appHeight = viewMode === "overview" ? multiRoomSize.height : canvasHeight;

// In <Application>:
<Application
  key={`pixi-app-${hmrVersion}-${viewMode}`}
  width={appWidth}
  height={appHeight}
  ...
>
  {spritesLoaded && (
    viewMode === "overview"
      ? <MultiRoomCanvas textures={textures} />
      : <OfficeRoom textures={textures} />
    // Plus compaction, debug, MobileBoss only in all-merged
  )}
</Application>
```

Note: The compaction animation (`MobileBoss`, `TrashCanSprite` animated mode), debug overlays, and the full agent labels/bubbles rendering from the original OfficeGame should remain in the all-merged branch only. `OfficeRoom` handles both modes via `isOverview` but the compaction-specific parts stay in OfficeGame.

Also update `useAnimationSystem` to accept an `enabled` option:
```typescript
// In frontend/src/systems/animationSystem.ts, change signature:
export function useAnimationSystem(options?: { enabled?: boolean }): void {
  const enabled = options?.enabled ?? true;
  // ... existing code, but wrap the tick callback:
  useTick((delta) => {
    if (!enabled) return;
    // ... existing tick logic
  });
}
```

- [ ] **Step 2: Update page.tsx — remove HTML ProjectRoomGrid**

In `page.tsx`:
- Remove the dynamic import of `ProjectRoomGrid`
- Remove the conditional rendering that switched between `<ProjectRoomGrid />` and `<OfficeGame />`
- Always render `<OfficeGame />` — it handles view mode internally
- Keep the view mode toggle buttons

- [ ] **Step 3: Delete old HTML components (if they exist)**

Delete if present (use `git rm --ignore-unmatch`):
- `frontend/src/components/game/MiniOffice.tsx`
- `frontend/src/components/game/ProjectRoomGrid.tsx`

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/game/OfficeGame.tsx frontend/src/app/page.tsx frontend/src/systems/animationSystem.ts
git rm --ignore-unmatch frontend/src/components/game/MiniOffice.tsx frontend/src/components/game/ProjectRoomGrid.tsx
git commit -m "feat: integrate PixiJS multi-room into OfficeGame with mode switching"
```

---

## Task 7: Full Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && uv run pytest tests/ -q --timeout=10`
Expected: All tests PASS

- [ ] **Step 2: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Backend lint**

Run: `cd backend && uv run ruff check app/`
Expected: All checks passed

- [ ] **Step 5: Visual verification**

Run: `make dev-tmux` from project root.
1. Open browser at localhost:3000
2. Click "Office" — should show existing all-merged view unchanged
3. Click "Projects" — should show PixiJS grid of mini offices
4. Each mini office should have: walls, floor, desks, boss, agents, all furniture
5. Agents should show correct state (typing if working, idle if idle)
6. Room labels should show project name with color

- [ ] **Step 6: Commit any fixes**

```bash
git commit -m "fix: resolve integration issues from visual verification"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | RoomContext provider | 4 (hooks return room data / null) |
| 2 | Room constants update | 4 (canvas size calculations) |
| 3 | RoomLabel component | tsc only |
| 4 | OfficeRoom extraction | tsc only (too coupled to PixiJS for unit test) |
| 5 | MultiRoomCanvas | 3 (grid position calculations) |
| 6 | OfficeGame integration | tsc + delete old files |
| 7 | Full verification | all tests + visual |
| **Total** | | **11 new tests** |
