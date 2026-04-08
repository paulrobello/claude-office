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
import { performFullCleanup, getHmrVersion } from "@/systems/hmrCleanup";

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
import { useProjectStore, selectViewMode, selectActiveRoomKey, selectProjects, selectSessions } from "@/stores/projectStore";
import { getMultiRoomCanvasSize } from "@/constants/rooms";
import { MultiRoomCanvas } from "./MultiRoomCanvas";
import { OfficeRoom } from "./OfficeRoom";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BACKGROUND_COLOR,
  getCanvasHeight,
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
import { isInElevatorZone } from "@/systems/queuePositions";
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
// MAIN COMPONENT
// ============================================================================

export function OfficeGame(): ReactNode {
  // Track PixiJS app for cleanup
  const appRef = useRef<PixiApplication | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  // HMR version for forcing remount
  const hmrVersion = getHmrVersion();

  // Multi-project view state
  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const projects = useProjectStore(selectProjects);
  const storeSessions = useProjectStore(selectSessions);

  // Derive one room per session. Use the sessions list as the source of truth
  // (not agents) so sessions with zero agents still get a room.
  const sessionRooms = useMemo(() => {
    // Build a lookup: projectName → ProjectGroup (for color, boss, todos)
    const projectByName = new Map(projects.map((p) => [p.name, p]));

    // Build agent lookup: sessionId → agents[]
    const agentsBySession = new Map<string, typeof projects[0]["agents"]>();
    for (const project of projects) {
      for (const agent of project.agents) {
        const sid = String((agent as Record<string, unknown>).sessionId ?? "");
        if (!sid) continue;
        if (!agentsBySession.has(sid)) agentsBySession.set(sid, []);
        agentsBySession.get(sid)!.push(agent);
      }
    }

    return storeSessions.map((session) => {
      const project = projectByName.get(session.projectName ?? "") ?? projects[0];
      const agents = agentsBySession.get(session.id) ?? [];
      return {
        key: session.id,
        name: `${session.projectName ?? "Unknown"} · ${session.id.slice(0, 8)}`,
        color: project?.color ?? "#888888",
        root: project?.root ?? null,
        agents,
        boss: project?.boss ?? { state: "idle" as const, currentTask: null, bubble: null, position: { x: 640, y: 830 } },
        sessionCount: 1,
        todos: project?.todos ?? [],
      };
    });
  }, [projects, storeSessions]);

  // Multi-room vs single-office rendering
  // Singular modes ("project"/"session") render as single office using gameStore data
  const isMultiRoom = viewMode === "projects" || viewMode === "sessions";

  // Load all office textures
  const { textures, loaded: spritesLoaded } = useOfficeTextures();

  // Start animation system (disabled in multi-room mode — agents use static poses)
  useAnimationSystem({ enabled: !isMultiRoom });

  // Cleanup on unmount (HMR or navigation)
  useEffect(() => {
    return () => {
      if (appRef.current) {
        try {
          appRef.current.destroy(true, {
            children: true,
            texture: true,
            textureSource: true,
          });
        } catch {
          // Ignore cleanup errors
        }
        appRef.current = null;
      }
      performFullCleanup();
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
        const label = agent.currentTask ?? agent.name ?? "";
        if (label) tasks.set(agent.desk, label);
      }
    }
    return tasks;
  }, [agents]);

  // Desk count
  const deskCount = useMemo(() => {
    return Math.max(8, Math.ceil(agents.size / 4) * 4);
  }, [agents.size]);

  // Dynamic canvas height based on desk count
  const canvasHeight = useMemo(() => getCanvasHeight(deskCount), [deskCount]);

  // Canvas dimensions for multi-room view
  const multiRoomRooms = useMemo(() => {
    if (viewMode === "sessions") return sessionRooms;
    return projects; // "projects" mode
  }, [viewMode, sessionRooms, projects]);
  const multiRoomSize = useMemo(
    () => getMultiRoomCanvasSize(Math.max(1, multiRoomRooms.length)),
    [multiRoomRooms.length]
  );
  const appWidth = isMultiRoom ? multiRoomSize.width : CANVAS_WIDTH;
  const appHeight = isMultiRoom ? multiRoomSize.height : canvasHeight;

  // Desk positions for Y-sorted rendering
  const deskPositions = useDeskPositions(deskCount, occupiedDesks);

  // Keyboard shortcuts for debug
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  // ---- Fit-to-view scaling ----
  // Automatically fit the canvas inside the container on mount, view switch,
  // and resize — but stop auto-fitting once the user manually zooms.
  const userHasZoomed = useRef(false);
  const lastAppliedScale = useRef(0);

  // Reset userHasZoomed when viewMode changes
  useEffect(() => {
    userHasZoomed.current = false;
    lastAppliedScale.current = 0;
  }, [viewMode]);

  // Compute fitScale and apply via centerView
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const applyFitScale = () => {
      if (userHasZoomed.current) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;

      // Use actual canvas CSS size (autoDensity makes it larger than appWidth/appHeight)
      const canvasEl = container.querySelector('canvas');
      const canvasW = canvasEl?.clientWidth || appWidth;
      const canvasH = canvasEl?.clientHeight || appHeight;
      const scale = Math.min(cw / canvasW, ch / canvasH, 1);
      if (Math.abs(scale - lastAppliedScale.current) < 0.01) return;
      lastAppliedScale.current = scale;
      transformRef.current?.centerView(scale, 0);
      setTimeout(() => {
        transformRef.current?.centerView(scale, 0);
      }, 200);
    };

    // Wait for PixiJS canvas to be ready (check periodically)
    let attempts = 0;
    const waitForCanvas = setInterval(() => {
      attempts++;
      const canvas = container.querySelector('canvas');
      if ((canvas && canvas.width > 150) || attempts > 20) {
        clearInterval(waitForCanvas);
        applyFitScale();
      }
    }, 100);

    const observer = new ResizeObserver(() => applyFitScale());
    observer.observe(container);

    return () => {
      clearInterval(waitForCanvas);
      observer.disconnect();
    };
  }, [appWidth, appHeight, viewMode]);

  const handleSessionRoomClick = useCallback((sessionId: string) => {
    window.dispatchEvent(new CustomEvent("office:select-session", { detail: { sessionId } }));
    useProjectStore.getState().setViewMode("office");
  }, []);

  const handleProjectRoomClick = useCallback((projectKey: string) => {
    // Find the first session of this project and switch to it
    const project = projects.find((p) => p.key === projectKey);
    if (project && project.agents.length > 0) {
      // Use the session_id from the first agent if available
      const firstAgent = project.agents[0];
      const sessionId = (firstAgent as Record<string, unknown>).sessionId as string | undefined;
      if (sessionId) {
        window.dispatchEvent(new CustomEvent("office:select-session", { detail: { sessionId } }));
      }
    }
    useProjectStore.getState().setViewMode("office");
  }, [projects]);

  // Double-click resets to fit scale
  const handleDoubleClick = useCallback(() => {
    userHasZoomed.current = false;
    lastAppliedScale.current = 0;
    const container = containerRef.current;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;
    const canvasEl = container.querySelector('canvas');
    const canvasW = canvasEl?.clientWidth || appWidth;
    const canvasH = canvasEl?.clientHeight || appHeight;
    const scale = Math.min(cw / canvasW, ch / canvasH, 1);
    lastAppliedScale.current = scale;
    transformRef.current?.centerView(scale, 200);
  }, [appWidth, appHeight]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden relative"
      onDoubleClick={handleDoubleClick}
    >
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={0.1}
        maxScale={3}
        wheel={{ step: 0.1 }}
        pinch={{ step: 5 }}
        doubleClick={{ disabled: true }}
        centerZoomedOut={false}
        limitToBounds={false}
        onWheel={() => { userHasZoomed.current = true; }}
        onPinching={() => { userHasZoomed.current = true; }}
      >
        <ZoomControls />
        <TransformComponent
          wrapperClass="w-full h-full"
          contentClass=""
        >
          <div className="pixi-canvas-container">
            <Application
              key={`pixi-app-${hmrVersion}-${viewMode}`}
              width={appWidth}
              height={appHeight}
              backgroundColor={isMultiRoom ? 0x0e1726 : BACKGROUND_COLOR}
              backgroundAlpha={isMultiRoom ? 0 : 1}
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
              {spritesLoaded && isMultiRoom && (
                <MultiRoomCanvas
                  textures={textures}
                  rooms={multiRoomRooms}
                  onRoomClick={viewMode === "sessions" || viewMode === "session" ? handleSessionRoomClick : handleProjectRoomClick}
                />
              )}

              {spritesLoaded && !isMultiRoom && (
                <>
                  {/* Floor and walls */}
                  <OfficeBackground floorTileTexture={textures.floorTile} canvasHeight={canvasHeight} />

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
