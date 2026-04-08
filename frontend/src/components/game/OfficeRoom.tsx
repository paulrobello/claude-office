/**
 * OfficeRoom - Reusable office rendering for both single-room and multi-room modes.
 *
 * When wrapped in a RoomProvider (overview mode), renders using per-room data.
 * When not wrapped (all-merged mode), renders using the global gameStore.
 */

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
import { getCanvasHeight } from "@/constants/canvas";
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
import {
  DeskSurfacesBase,
  DeskSurfacesTop,
  useDeskPositions,
} from "./DeskGrid";
import {
  AgentSprite,
  AgentArms,
  AgentHeadset,
  AgentLabel,
  Bubble as AgentBubble,
} from "./AgentSprite";
import { BossSprite, BossBubble } from "./BossSprite";
import { TrashCanSprite } from "./TrashCanSprite";
import { isInElevatorZone } from "@/systems/queuePositions";

interface OfficeRoomProps {
  textures: OfficeTextures;
}

export function OfficeRoom({ textures }: OfficeRoomProps): ReactNode {
  const roomCtx = useRoomContext();
  const isRoom = roomCtx !== null;

  // Global store values (always called — React hook rules)
  const storeAgents = useGameStore(useShallow(selectAgents));
  const storeBoss = useGameStore(selectBoss);
  const storeTodos = useGameStore(selectTodos);
  const elevatorState = useGameStore(selectElevatorState);
  const contextUtilization = useGameStore(selectContextUtilization);
  const printReport = useGameStore(selectPrintReport);

  // Pick data source
  const todos: TodoItem[] = isRoom ? roomCtx.project.todos : storeTodos;
  const isElevatorOpen = isRoom ? false : elevatorState === "open";

  const agentCount = isRoom ? roomCtx.project.agents.length : storeAgents.size;
  // In overview mode, use fixed 8 desks for consistent room sizing
  const deskCount = isRoom ? 8 : Math.max(8, Math.ceil(agentCount / 4) * 4);
  const canvasHeight = getCanvasHeight(deskCount);

  const occupiedDesks = useMemo(() => {
    const desks = new Set<number>();
    if (isRoom) {
      roomCtx.project.agents.forEach((a, i) => desks.add(a.desk ?? i + 1));
    } else {
      for (const agent of storeAgents.values()) {
        if (agent.desk && agent.phase === "idle") desks.add(agent.desk);
      }
    }
    return desks;
  }, [isRoom, roomCtx, storeAgents]);

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
  const rawBossPos = isRoom ? roomCtx.project.boss.position : null;
  const bossPosition = rawBossPos && "x" in rawBossPos && "y" in rawBossPos
    ? { x: rawBossPos.x, y: rawBossPos.y }
    : isRoom
      ? { x: 640, y: 830 }
      : storeBoss.position;
  const bossState = isRoom
    ? roomCtx.project.boss.state
    : storeBoss.backendState;
  const bossBubble = isRoom
    ? (roomCtx.project.boss.bubble ?? null)
    : storeBoss.bubble.content;
  const bossCurrentTask = isRoom
    ? (roomCtx.project.boss.currentTask ?? null)
    : storeBoss.currentTask;

  return (
    <>
      {/* Floor and walls */}
      <OfficeBackground
        floorTileTexture={textures.floorTile}
        canvasHeight={canvasHeight}
      />

      {/* Boss area rug */}
      {textures.bossRug && (
        <pixiSprite
          texture={textures.bossRug}
          anchor={0.5}
          x={BOSS_RUG_POSITION.x}
          y={BOSS_RUG_POSITION.y}
          scale={0.3}
        />
      )}

      {/* Wall decorations */}
      <pixiContainer
        x={EMPLOYEE_OF_MONTH_POSITION.x}
        y={EMPLOYEE_OF_MONTH_POSITION.y}
      >
        <EmployeeOfTheMonth />
      </pixiContainer>
      <pixiContainer
        x={CITY_WINDOW_POSITION.x}
        y={CITY_WINDOW_POSITION.y}
      >
        <CityWindow />
      </pixiContainer>
      <pixiContainer
        x={SAFETY_SIGN_POSITION.x}
        y={SAFETY_SIGN_POSITION.y}
      >
        <SafetySign />
      </pixiContainer>
      <pixiContainer
        x={WALL_CLOCK_POSITION.x}
        y={WALL_CLOCK_POSITION.y}
      >
        <WallClock />
      </pixiContainer>
      {textures.wallOutlet && (
        <pixiSprite
          texture={textures.wallOutlet}
          anchor={0.5}
          x={WALL_OUTLET_POSITION.x}
          y={WALL_OUTLET_POSITION.y}
          scale={0.04}
        />
      )}
      <pixiContainer
        x={WHITEBOARD_POSITION.x}
        y={WHITEBOARD_POSITION.y}
      >
        <Whiteboard todos={todos} />
      </pixiContainer>
      {textures.waterCooler && (
        <pixiSprite
          texture={textures.waterCooler}
          anchor={0.5}
          x={WATER_COOLER_POSITION.x}
          y={WATER_COOLER_POSITION.y}
          scale={0.198}
        />
      )}
      {textures.coffeeMachine && (
        <pixiSprite
          texture={textures.coffeeMachine}
          anchor={0.5}
          x={COFFEE_MACHINE_POSITION.x}
          y={COFFEE_MACHINE_POSITION.y}
          scale={0.1}
        />
      )}

      {/* Printer station */}
      <PrinterStation
        x={PRINTER_STATION_POSITION.x}
        y={PRINTER_STATION_POSITION.y}
        isPrinting={!isRoom && printReport && !!bossBubble}
        deskTexture={textures.desk}
        printerTexture={textures.printer}
      />

      {/* Plant */}
      {textures.plant && (
        <pixiSprite
          texture={textures.plant}
          anchor={0.5}
          x={PLANT_POSITION.x}
          y={PLANT_POSITION.y}
          scale={0.1}
        />
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

      {/* Y-sorted layer: chairs and agents */}
      <pixiContainer sortableChildren={true}>
        {/* Chairs */}
        {deskPositions.map((desk, i) => (
          <pixiContainer
            key={`chair-${i}`}
            x={desk.x}
            y={desk.y}
            zIndex={desk.y + 20}
          >
            {textures.chair && (
              <pixiSprite
                texture={textures.chair}
                anchor={0.5}
                x={0}
                y={30}
                scale={0.1386}
              />
            )}
          </pixiContainer>
        ))}

        {/* Overview mode: agents at desk positions, static poses */}
        {isRoom &&
          roomCtx.project.agents.map((agent, i) => {
            const deskIdx = (agent.desk ?? i + 1) - 1;
            const desk = deskPositions[deskIdx];
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

        {/* All-merged mode: animated agents */}
        {!isRoom &&
          Array.from(storeAgents.values())
            .filter(
              (agent) =>
                !isAgentInElevator(
                  agent.currentPosition.x,
                  agent.currentPosition.y
                )
            )
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

      {/* Desk surfaces (behind agent arms) */}
      <DeskSurfacesBase
        deskCount={deskCount}
        occupiedDesks={occupiedDesks}
        deskTexture={textures.desk}
        keyboardTexture={textures.keyboard}
      />

      {/* Agent arms */}
      {isRoom
        ? roomCtx.project.agents.map((agent, i) => {
            const deskIdx = (agent.desk ?? i + 1) - 1;
            const desk = deskPositions[deskIdx];
            if (!desk) return null;
            return (
              <AgentArms
                key={`arms-${agent.id}`}
                position={{ x: desk.x, y: desk.y }}
                isTyping={agent.state === "working"}
              />
            );
          })
        : Array.from(storeAgents.values())
            .filter((agent) => agent.phase === "idle")
            .map((agent) => (
              <AgentArms
                key={`arms-${agent.id}`}
                position={agent.currentPosition}
                isTyping={agent.isTyping}
              />
            ))}

      {/* Headsets */}
      {textures.headset &&
        (isRoom
          ? roomCtx.project.agents.map((agent, i) => {
              const deskIdx = (agent.desk ?? i + 1) - 1;
              const desk = deskPositions[deskIdx];
              if (!desk) return null;
              return (
                <AgentHeadset
                  key={`headset-${agent.id}`}
                  position={{ x: desk.x, y: desk.y }}
                  headsetTexture={textures.headset!}
                />
              );
            })
          : Array.from(storeAgents.values())
              .filter((agent) => agent.phase === "idle")
              .map((agent) => (
                <AgentHeadset
                  key={`headset-${agent.id}`}
                  position={agent.currentPosition}
                  headsetTexture={textures.headset!}
                />
              )))}

      {/* Monitors and desk accessories */}
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
        inUseBy={isRoom ? null : storeBoss.inUseBy}
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
            const deskIdx = (agent.desk ?? i + 1) - 1;
            const desk = deskPositions[deskIdx];
            if (!desk || !agent.name) return null;
            return (
              <AgentLabel
                key={`label-${agent.id}`}
                name={agent.name}
                position={{ x: desk.x, y: desk.y }}
              />
            );
          })
        : Array.from(storeAgents.values())
            .filter(
              (agent) =>
                agent.name && !isInElevatorZone(agent.currentPosition)
            )
            .map((agent) => (
              <AgentLabel
                key={`label-${agent.id}`}
                name={agent.name!}
                position={agent.currentPosition}
              />
            ))}

      {/* Bubbles */}
      {isRoom
        ? roomCtx.project.agents
            .filter((a) => a.bubble)
            .map((agent, i) => {
              const deskIdx = (agent.desk ?? i + 1) - 1;
              const desk = deskPositions[deskIdx];
              if (!desk) return null;
              return (
                <pixiContainer
                  key={`bubble-${agent.id}`}
                  x={desk.x}
                  y={desk.y}
                >
                  <AgentBubble content={agent.bubble!} yOffset={-80} />
                </pixiContainer>
              );
            })
        : Array.from(storeAgents.values())
            .filter(
              (agent) =>
                agent.bubble.content &&
                !isInElevatorZone(agent.currentPosition)
            )
            .map((agent) => (
              <pixiContainer
                key={`bubble-${agent.id}`}
                x={agent.currentPosition.x}
                y={agent.currentPosition.y}
              >
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
