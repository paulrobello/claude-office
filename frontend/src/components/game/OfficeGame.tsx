/**
 * OfficeGame - Main Game Canvas
 *
 * Main visualization component using:
 * - Centralized Zustand store
 * - XState state machines
 * - Single animation tick loop
 *
 * The component is purely for rendering - all state logic is in the store/machines.
 */

"use client";

import { Application, extend } from "@pixi/react";
import {
  Container,
  Text,
  Graphics,
  Sprite,
  Application as PixiApplication,
} from "pixi.js";
import { useMemo, useEffect, useRef, useCallback, type ReactNode } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { useShallow } from "zustand/react/shallow";
import { performSoftReset, getHmrVersion } from "@/systems/hmrCleanup";

import {
  useGameStore,
  selectAgents,
  selectBoss,
  selectTodos,
  selectDebugMode,
  selectShowPaths,
  selectShowQueueSlots,
  selectShowPhaseLabels,
  selectShowObstacles,
  selectElevatorState,
  selectContextUtilization,
  selectIsCompacting,
  selectPrintReport,
} from "@/stores/gameStore";
import { useAnimationSystem } from "@/systems/animationSystem";
import { useCompactionAnimation } from "@/systems/compactionAnimation";
import { useOfficeTextures } from "@/hooks/useOfficeTextures";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BACKGROUND_COLOR,
} from "@/constants/canvas";
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
import {
  AgentSprite,
  AgentArms,
  AgentHeadset,
  AgentLabel,
  Bubble as AgentBubble,
} from "./AgentSprite";
import { BossSprite, BossBubble, MobileBoss } from "./BossSprite";
import { useNavigationStore } from "@/stores/navigationStore";
import { LOBBY_FLOOR_ID } from "@/types/navigation";
import { ELEVATOR_POSITION, isInElevatorZone } from "@/systems/queuePositions";
import { TrashCanSprite } from "./TrashCanSprite";
import { WallClock } from "./WallClock";
import { Whiteboard } from "./Whiteboard";
import { SafetySign } from "./SafetySign";
import { CityWindow } from "./CityWindow";
import { EmployeeOfTheMonth } from "./EmployeeOfTheMonth";
import { Elevator, isAgentInElevator } from "./Elevator";
import { PrinterStation } from "./PrinterStation";
import { DebugOverlays } from "./DebugOverlays";
import {
  DeskSurfacesBase,
  DeskSurfacesTop,
  useDeskPositions,
} from "./DeskGrid";
import { ZoomControls } from "./ZoomControls";
import { LoadingScreen } from "./LoadingScreen";
import { OfficeBackground } from "./OfficeBackground";

// Register PixiJS components
extend({ Container, Text, Graphics, Sprite });

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface SubagentDotProps {
  x: number;
  y: number;
  color: string;
}

function SubagentDot({ x, y, color }: SubagentDotProps): ReactNode {
  const drawDot = useCallback(
    (g: Graphics) => {
      g.clear();
      g.circle(0, 0, 4);
      // Safe hex parsing with fallback
      const hex = /^#[0-9a-fA-F]{6}$/.test(color)
        ? parseInt(color.slice(1), 16)
        : 0xf59e0b;
      g.fill({ color: hex });
      g.circle(0, 0, 4);
      g.stroke({ color: 0xffffff, alpha: 0.4, width: 1 });
    },
    [color],
  );

  return <pixiGraphics draw={drawDot} x={x} y={y} />;
}

function FloorSign({
  label,
  accent,
}: {
  label: string;
  accent: string;
}): ReactNode {
  const w = 120;
  const h = 24;
  const drawSign = useCallback(
    (g: Graphics) => {
      g.clear();
      // Backing plate
      g.roundRect(-w / 2, -h / 2, w, h, 4);
      g.fill({ color: 0x1e1e1e, alpha: 0.9 });
      // Border
      g.roundRect(-w / 2, -h / 2, w, h, 4);
      const hex = /^#[0-9a-fA-F]{6}$/.test(accent)
        ? parseInt(accent.slice(1), 16)
        : 0x6366f1;
      g.stroke({ color: hex, width: 1.5, alpha: 0.7 });
    },
    [accent],
  );

  return (
    <pixiContainer x={ELEVATOR_POSITION.x} y={ELEVATOR_POSITION.y - 88}>
      <pixiGraphics draw={drawSign} />
      <pixiContainer scale={0.5}>
        <pixiText
          text={label}
          anchor={0.5}
          resolution={2}
          style={{
            fontSize: 18,
            fill: "#ffffff",
            fontFamily: "monospace",
            fontWeight: "bold",
          }}
        />
      </pixiContainer>
    </pixiContainer>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OfficeGame(): ReactNode {
  // Track PixiJS app for cleanup
  const appRef = useRef<PixiApplication | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  // HMR version for forcing remount
  const hmrVersion = getHmrVersion();

  // Load all office textures
  const { textures, loaded: spritesLoaded } = useOfficeTextures();

  // Start animation system
  useAnimationSystem();

  // Cleanup on unmount (HMR or navigation)
  useEffect(() => {
    return () => {
      // @pixi/react Application handles Pixi app destruction.
      // Only reset game systems to avoid double-destroy of the WebGL context.
      appRef.current = null;
      performSoftReset();
    };
  }, []);

  // Subscribe to store state
  const agents = useGameStore(useShallow(selectAgents));
  const boss = useGameStore(selectBoss);
  const todos = useGameStore(selectTodos);
  const debugMode = useGameStore(selectDebugMode);
  const showPaths = useGameStore(selectShowPaths);
  const showQueueSlots = useGameStore(selectShowQueueSlots);
  const showPhaseLabels = useGameStore(selectShowPhaseLabels);
  const showObstacles = useGameStore(selectShowObstacles);
  const elevatorState = useGameStore(selectElevatorState);
  const contextUtilization = useGameStore(selectContextUtilization);
  const isCompacting = useGameStore(selectIsCompacting);
  const printReport = useGameStore(selectPrintReport);

  // Floor info for elevator label
  const floorId = useNavigationStore((s) => s.floorId);
  const buildingConfig = useNavigationStore((s) => s.buildingConfig);
  const floor = useMemo(() => {
    if (floorId === LOBBY_FLOOR_ID) {
      return { name: "Lobby", icon: "\u{1F6AA}", accent: "#94a3b8" };
    }
    return buildingConfig?.floors.find((f) => f.id === floorId) ?? null;
  }, [floorId, buildingConfig]);

  // Compaction animation state
  const compactionAnimation = useCompactionAnimation();

  // Use store's elevator state (controlled by state machine)
  const isElevatorOpen = elevatorState === "open";

  // Calculate occupied desks
  const occupiedDesks = useMemo(() => {
    const desks = new Set<number>();
    for (const agent of agents.values()) {
      if (agent.desk && agent.phase === "idle") {
        desks.add(agent.desk);
      }
    }
    return desks;
  }, [agents]);

  // Calculate desk tasks for marquee display
  const deskTasks = useMemo(() => {
    const tasks = new Map<number, string>();
    for (const agent of agents.values()) {
      if (agent.desk && agent.phase === "idle") {
        const label = agent.currentTask || agent.name || "";
        if (label) tasks.set(agent.desk, label);
      }
    }
    return tasks;
  }, [agents]);

  // Desk count
  const deskCount = useMemo(() => {
    return Math.max(8, Math.ceil(agents.size / 4) * 4);
  }, [agents.size]);

  // Desk positions for Y-sorted rendering
  const deskPositions = useDeskPositions(deskCount, occupiedDesks);

  // Keyboard shortcuts for debug
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      if (e.key === "d" || e.key === "D") {
        useGameStore.getState().setDebugMode(!debugMode);
      }
      if (debugMode) {
        if (e.key === "p" || e.key === "P") {
          useGameStore.getState().toggleDebugOverlay("paths");
        }
        if (e.key === "q" || e.key === "Q") {
          useGameStore.getState().toggleDebugOverlay("queueSlots");
        }
        if (e.key === "l" || e.key === "L") {
          useGameStore.getState().toggleDebugOverlay("phaseLabels");
        }
        if (e.key === "o" || e.key === "O") {
          useGameStore.getState().toggleDebugOverlay("obstacles");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [debugMode]);

  // Reset pan/zoom only on actual window resize — NOT on container reflows.
  // ResizeObserver was causing progressive canvas drift because the event log
  // and sidebar content changes triggered micro-resizes on every update.
  useEffect(() => {
    const handleResize = () => transformRef.current?.resetTransform(0);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden relative">
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={1}
        maxScale={3}
        centerZoomedOut={false}
        limitToBounds={false}
        wheel={{ step: 0.1 }}
        pinch={{ step: 5 }}
        doubleClick={{ mode: "reset" }}
        onTransform={(ref, state) => {
          // Auto-reset pan offset when zooming back out to 1:1
          if (
            state.scale <= 1 &&
            (state.positionX !== 0 || state.positionY !== 0)
          ) {
            ref.resetTransform(0);
          }
        }}
      >
        <ZoomControls />
        <TransformComponent
          wrapperClass="w-full h-full"
          contentClass="w-full h-full"
        >
          <div className="pixi-canvas-container w-full h-full">
            <Application
              key={`pixi-app-${hmrVersion}`}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              backgroundColor={BACKGROUND_COLOR}
              autoDensity={true}
              resolution={
                typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
              }
              onInit={(app) => {
                appRef.current = app;
              }}
            >
              {/* Loading screen - shown while sprites are loading */}
              {!spritesLoaded && <LoadingScreen />}

              {/* Office content - hidden while loading */}
              {spritesLoaded && (
                <>
                  {/* Floor and walls */}
                  <OfficeBackground floorTileTexture={textures.floorTile} />

                  {/* Boss area rug - rendered right after floor */}
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
                  {/* Wall outlet below clock */}
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
                  {/* Coffee machine - to the right of water cooler */}
                  {textures.coffeeMachine && (
                    <pixiSprite
                      texture={textures.coffeeMachine}
                      anchor={0.5}
                      x={COFFEE_MACHINE_POSITION.x}
                      y={COFFEE_MACHINE_POSITION.y}
                      scale={0.1}
                    />
                  )}

                  {/* Printer station - bottom left corner */}
                  {/* Only print after boss delivers the completion message */}
                  <PrinterStation
                    x={PRINTER_STATION_POSITION.x}
                    y={PRINTER_STATION_POSITION.y}
                    isPrinting={
                      printReport && !isCompacting && !!boss.bubble.content
                    }
                    deskTexture={textures.desk}
                    printerTexture={textures.printer}
                  />

                  {/* Plant - to the right of printer */}
                  {textures.plant && (
                    <pixiSprite
                      texture={textures.plant}
                      anchor={0.5}
                      x={PLANT_POSITION.x}
                      y={PLANT_POSITION.y}
                      scale={0.1}
                    />
                  )}

                  {/* Elevator with animated doors and agents inside */}
                  <Elevator
                    isOpen={isElevatorOpen}
                    agents={agents}
                    frameTexture={textures.elevatorFrame}
                    doorTexture={textures.elevatorDoor}
                    headsetTexture={textures.headset}
                    sunglassesTexture={textures.sunglasses}
                  />

                  {/* Floor sign above elevator */}
                  {floor && (
                    <FloorSign
                      label={`${floor.icon} ${floor.name}`}
                      accent={floor.accent}
                    />
                  )}

                  {/* Y-sorted layer: chairs and agents sorted by Y position (higher Y = in front) */}
                  <pixiContainer sortableChildren={true}>
                    {/* Desk chairs - zIndex based on chair seat back */}
                    {deskPositions.map((desk, i) => {
                      const chairZIndex = desk.y + 20;
                      return (
                        <pixiContainer
                          key={`chair-${i}`}
                          x={desk.x}
                          y={desk.y}
                          zIndex={chairZIndex}
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
                      );
                    })}

                    {/* Agents outside elevator - zIndex based on feet Y position */}
                    {Array.from(agents.values())
                      .filter(
                        (agent) =>
                          !isAgentInElevator(
                            agent.currentPosition.x,
                            agent.currentPosition.y,
                          ),
                      )
                      .map((agent) => (
                        <pixiContainer
                          key={agent.id}
                          zIndex={agent.currentPosition.y}
                        >
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

                  {/* Desk surfaces and keyboards (behind agent arms) */}
                  <DeskSurfacesBase
                    deskCount={deskCount}
                    occupiedDesks={occupiedDesks}
                    deskTexture={textures.desk}
                    keyboardTexture={textures.keyboard}
                  />

                  {/* Agent arms - rendered after desk/keyboard, before headsets */}
                  {Array.from(agents.values())
                    .filter((agent) => agent.phase === "idle")
                    .map((agent) => (
                      <AgentArms
                        key={`arms-${agent.id}`}
                        position={agent.currentPosition}
                        isTyping={agent.isTyping}
                      />
                    ))}

                  {/* Agent headsets - rendered after arms so they appear on top */}
                  {textures.headset &&
                    Array.from(agents.values())
                      .filter((agent) => agent.phase === "idle")
                      .map((agent) => (
                        <AgentHeadset
                          key={`headset-${agent.id}`}
                          position={agent.currentPosition}
                          headsetTexture={textures.headset!}
                        />
                      ))}

                  {/* Monitors and decorations (in front of agent arms) */}
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
                    position={boss.position}
                    state={boss.backendState}
                    bubble={boss.bubble.content}
                    inUseBy={boss.inUseBy}
                    currentTask={boss.currentTask}
                    chairTexture={textures.chair}
                    deskTexture={textures.desk}
                    keyboardTexture={textures.keyboard}
                    monitorTexture={textures.monitor}
                    phoneTexture={textures.phone}
                    headsetTexture={textures.headset}
                    sunglassesTexture={textures.sunglasses}
                    renderBubble={false}
                    isTyping={boss.isTyping}
                    isAway={compactionAnimation.phase !== "idle"}
                  />

                  {/* Mobile Boss (when walking to/from trash can) */}
                  {compactionAnimation.bossPosition && (
                    <MobileBoss
                      position={compactionAnimation.bossPosition}
                      jumpOffset={compactionAnimation.jumpOffset}
                      scale={compactionAnimation.bossScale}
                      sunglassesTexture={textures.sunglasses}
                      headsetTexture={textures.headset}
                    />
                  )}

                  {/* Trash Can (Context Utilization Indicator) - right of boss desk */}
                  <TrashCanSprite
                    x={boss.position.x + TRASH_CAN_OFFSET.x}
                    y={boss.position.y + TRASH_CAN_OFFSET.y}
                    contextUtilization={
                      compactionAnimation.phase !== "idle"
                        ? compactionAnimation.animatedContextUtilization
                        : contextUtilization
                    }
                    isCompacting={isCompacting}
                    isStomping={compactionAnimation.isStomping}
                  />

                  {/* Debug overlays */}
                  {debugMode && (
                    <DebugOverlays
                      showPaths={showPaths}
                      showQueueSlots={showQueueSlots}
                      showPhaseLabels={showPhaseLabels}
                      showObstacles={showObstacles}
                    />
                  )}

                  {/* Debug mode indicator */}
                  {debugMode && (
                    <pixiText
                      text="DEBUG MODE (D=toggle, P=paths, Q=queue, L=labels, O=obstacles, T=time)"
                      x={10}
                      y={10}
                      style={{
                        fontSize: 12,
                        fill: 0x00ff00,
                        fontFamily: "monospace",
                      }}
                    />
                  )}

                  {/* Labels Layer - rendered on top of most things */}
                  {Array.from(agents.values())
                    .filter(
                      (agent) =>
                        agent.name && !isInElevatorZone(agent.currentPosition),
                    )
                    .map((agent) => (
                      <AgentLabel
                        key={`label-${agent.id}`}
                        name={agent.name!}
                        position={agent.currentPosition}
                      />
                    ))}

                  {/* Character Type Overlays - crown/badge/dot per agent type */}
                  {Array.from(agents.values())
                    .filter(
                      (agent) =>
                        agent.characterType &&
                        !isInElevatorZone(agent.currentPosition),
                    )
                    .map((agent) => (
                      <pixiContainer
                        key={`chartype-${agent.id}`}
                        zIndex={agent.currentPosition.y + 20}
                      >
                        {/* Lead crown overlay */}
                        {agent.characterType === "lead" && (
                          <pixiText
                            text="👑"
                            style={{ fontSize: 14 }}
                            x={agent.currentPosition.x - 8}
                            y={agent.currentPosition.y - 52}
                          />
                        )}

                        {/* Teammate badge + nameplate overlay */}
                        {agent.characterType === "teammate" && (
                          <>
                            <pixiText
                              text="🎖️"
                              style={{ fontSize: 10 }}
                              x={agent.currentPosition.x - 6}
                              y={agent.currentPosition.y - 46}
                            />
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
                              />
                            )}
                          </>
                        )}

                        {/* Subagent shoulder dot */}
                        {agent.characterType === "subagent" &&
                          (() => {
                            const parentAgent = agent.parentId
                              ? Array.from(agents.values()).find(
                                  (a) => a.id === agent.parentId,
                                )
                              : null;
                            const dotColor = parentAgent?.color ?? "#f59e0b";
                            return (
                              <SubagentDot
                                key={`dot-${agent.id}`}
                                x={agent.currentPosition.x + 10}
                                y={agent.currentPosition.y - 28}
                                color={dotColor}
                              />
                            );
                          })()}
                      </pixiContainer>
                    ))}

                  {/* Bubbles Layer - rendered on top of everything */}
                  {Array.from(agents.values())
                    .filter(
                      (agent) =>
                        agent.bubble.content &&
                        !isInElevatorZone(agent.currentPosition),
                    )
                    .map((agent) => (
                      <pixiContainer
                        key={`bubble-${agent.id}`}
                        x={agent.currentPosition.x}
                        y={agent.currentPosition.y}
                      >
                        <AgentBubble
                          content={agent.bubble.content!}
                          yOffset={-80}
                        />
                      </pixiContainer>
                    ))}
                  {boss.bubble.content && (
                    <pixiContainer x={boss.position.x} y={boss.position.y}>
                      <BossBubble content={boss.bubble.content} yOffset={-80} />
                    </pixiContainer>
                  )}
                </>
              )}
            </Application>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
