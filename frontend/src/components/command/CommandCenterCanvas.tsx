"use client";

import { Application, extend } from "@pixi/react";
import { Container, Text, Graphics, Sprite } from "pixi.js";
import { useEffect, useRef, type ReactNode } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { useOfficeTextures } from "@/hooks/useOfficeTextures";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BACKGROUND_COLOR,
} from "@/constants/canvas";
import { useExitStore, useExitDriver } from "@/systems/exitAnimation";
import {
  setMotionTargets,
  useMotionCleanup,
} from "@/systems/commandCenterMotion";
import { LoadingScreen } from "../game/LoadingScreen";
import { WallClock } from "../game/WallClock";
import { CommandCenterBackground } from "./CommandCenterBackground";
import { CommandCenterZones } from "./CommandCenterZones";
import { CommandCenterDecor } from "./CommandCenterDecor";
import { CommandCenterFurniture } from "./CommandCenterFurniture";
import { CommandCenterBoard } from "./CommandCenterBoard";
import { CommandCenterPeer } from "./CommandCenterPeer";
import { ExitingPeer } from "./ExitingPeer";
import type { CommandPeer, CommandSummary } from "./useCommandCenterPeers";
import type { ZoneKey } from "./layout";

// Register the PixiJS components used by this canvas.
extend({ Container, Text, Graphics, Sprite });

interface CommandCenterCanvasProps {
  peers: CommandPeer[];
  counts: Record<ZoneKey, number>;
  overflow: Record<ZoneKey, number>;
  summary: CommandSummary;
  onPeerActivate: (peer: CommandPeer, screen: { x: number; y: number }) => void;
}

export function CommandCenterCanvas({
  peers,
  counts,
  overflow,
  summary,
  onPeerActivate,
}: CommandCenterCanvasProps): ReactNode {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const { textures, loaded } = useOfficeTextures();

  // Walk non-ended agents to their fixed slots (furniture stays put).
  useMotionCleanup();
  useEffect(() => {
    setMotionTargets(
      peers
        .filter((p) => p.bucket !== "ended")
        .map((p) => ({ id: p.sessionId, target: p.position })),
    );
  }, [peers]);

  // Exit animation: only sessions seen active and then ended *while watching*
  // walk out. Sessions already ended when the view opened are skipped.
  useExitDriver();
  const seenActiveRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const seen = seenActiveRef.current;
    for (const p of peers) if (p.bucket !== "ended") seen.add(p.sessionId);
    const exiting = peers
      .filter((p) => p.bucket === "ended" && seen.has(p.sessionId))
      .map((p) => p.sessionId);
    useExitStore.getState().registerEnded(exiting, performance.now());
  }, [peers]);

  return (
    <div className="w-full h-full overflow-hidden relative">
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={0.5}
        maxScale={3}
        centerOnInit
        limitToBounds={false}
        wheel={{ step: 0.1 }}
        doubleClick={{ mode: "reset" }}
      >
        <TransformComponent
          wrapperClass="w-full h-full"
          contentClass="w-full h-full"
        >
          <div className="pixi-canvas-container w-full h-full">
            <Application
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              backgroundColor={BACKGROUND_COLOR}
              autoDensity={true}
              resolution={
                typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
              }
            >
              {!loaded && <LoadingScreen />}
              {loaded && (
                <>
                  <CommandCenterBackground
                    floorTileTexture={textures.floorTile}
                  />
                  <CommandCenterZones counts={counts} overflow={overflow} />
                  <CommandCenterDecor textures={textures} />
                  {/* Top-wall combined board + clock */}
                  <pixiContainer x={430} y={66}>
                    <CommandCenterBoard counts={counts} summary={summary} />
                  </pixiContainer>
                  <pixiContainer x={690} y={64}>
                    <WallClock />
                  </pixiContainer>
                  <CommandCenterFurniture textures={textures} />
                  <pixiContainer sortableChildren={true}>
                    {peers.map((peer) =>
                      peer.bucket === "ended" ? (
                        <ExitingPeer
                          key={peer.sessionId}
                          peer={peer}
                          headsetTexture={textures.headset}
                          sunglassesTexture={textures.sunglasses}
                          onActivate={onPeerActivate}
                        />
                      ) : (
                        <CommandCenterPeer
                          key={peer.sessionId}
                          peer={peer}
                          headsetTexture={textures.headset}
                          sunglassesTexture={textures.sunglasses}
                          onActivate={onPeerActivate}
                        />
                      ),
                    )}
                  </pixiContainer>
                </>
              )}
            </Application>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
