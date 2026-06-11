"use client";

import { memo, useCallback, type ReactNode } from "react";
import { Graphics, Texture } from "pixi.js";
import type { Position } from "@/types";
import { useMotionStore, selectMotionPos } from "@/systems/commandCenterMotion";
import { ZONE_BY_KEY } from "./layout";
import type { CommandPeer } from "./useCommandCenterPeers";

// Body geometry (compact relative to the office BossSprite).
const BODY_W = 40;
const BODY_H = 58;
const HEAD_R = 13;
const HEAD_CY = -BODY_H + HEAD_R + 2;

interface CommandCenterPeerProps {
  peer: CommandPeer;
  headsetTexture: Texture | null;
  sunglassesTexture: Texture | null;
  onActivate: (peer: CommandPeer, screen: { x: number; y: number }) => void;
  /** Animated position (used by the exit walk); defaults to the fixed slot. */
  positionOverride?: Position;
  /** Container alpha (used to fade exiting agents). */
  alphaOverride?: number;
}

function CommandCenterPeerComponent({
  peer,
  headsetTexture,
  sunglassesTexture,
  onActivate,
  positionOverride,
  alphaOverride,
}: CommandCenterPeerProps): ReactNode {
  const zone = ZONE_BY_KEY[peer.bucket];
  const accent = zone.color;
  const isNeedsYou = peer.bucket === "needs_you";
  // Walked position from the motion mover; exit animation overrides it.
  const motionPos = useMotionStore(selectMotionPos(peer.sessionId));
  const pos = positionOverride ?? motionPos ?? peer.position;
  const alpha = alphaOverride ?? 1;

  const drawShadow = useCallback(
    (g: Graphics) => {
      g.clear();
      // Status disc under the feet (stays grounded while the body bobs).
      g.ellipse(0, 4, BODY_W / 2 + 4, 7);
      g.fill({ color: accent, alpha: isNeedsYou ? 0.55 : 0.32 });
    },
    [accent, isNeedsYou],
  );

  const drawBody = useCallback(
    (g: Graphics) => {
      g.clear();
      // Body capsule.
      g.roundRect(-BODY_W / 2, -BODY_H, BODY_W, BODY_H, 14);
      g.fill({ color: 0x2d3748 });
      g.roundRect(-BODY_W / 2, -BODY_H, BODY_W, BODY_H, 14);
      g.stroke({ color: accent, width: isNeedsYou ? 4 : 2.5, alpha: 0.95 });
      // Head.
      g.circle(0, HEAD_CY, HEAD_R);
      g.fill({ color: 0x1f2937 });
    },
    [accent, isNeedsYou],
  );

  const drawTodoBar = useCallback(
    (g: Graphics) => {
      g.clear();
      const w = 46;
      const h = 6;
      const ratio = peer.todoTotal > 0 ? peer.todoDone / peer.todoTotal : 0;
      g.roundRect(-w / 2, 0, w, h, 3);
      g.fill({ color: 0x0f172a });
      g.roundRect(-w / 2, 0, w, h, 3);
      g.stroke({ color: 0x334155, width: 1 });
      if (ratio > 0) {
        g.roundRect(-w / 2, 0, Math.max(3, w * ratio), h, 3);
        g.fill({ color: accent });
      }
    },
    [peer.todoDone, peer.todoTotal, accent],
  );

  const drawBadge = useCallback((g: Graphics) => {
    g.clear();
    g.roundRect(0, 0, 26, 16, 8);
    g.fill({ color: 0x111827 });
    g.roundRect(0, 0, 26, 16, 8);
    g.stroke({ color: 0xf59e0b, width: 1.5, alpha: 0.9 });
  }, []);

  // Office-style nameplate behind the project label.
  const shortLabel =
    peer.label.length > 16 ? `${peer.label.slice(0, 15)}…` : peer.label;
  const plateW = shortLabel.length * 12 + 22; // 2x units (container scaled 0.5)
  const drawPlate = useCallback(
    (g: Graphics) => {
      g.clear();
      g.roundRect(-plateW / 2, -15, plateW, 28, 7);
      g.fill({ color: 0x1e1e1e, alpha: 0.88 });
      g.roundRect(-plateW / 2, -15, plateW, 28, 7);
      g.stroke({ color: accent, width: 1.5, alpha: 0.65 });
    },
    [plateW, accent],
  );

  const handleTap = useCallback(
    (e: {
      client?: { x: number; y: number };
      global?: { x: number; y: number };
    }) => {
      // DOM client coords so the popover lands under the cursor.
      const p = e.client ?? e.global ?? { x: 0, y: 0 };
      onActivate(peer, { x: p.x, y: p.y });
    },
    [onActivate, peer],
  );

  return (
    <pixiContainer
      x={pos.x}
      y={pos.y}
      zIndex={pos.y}
      alpha={alpha}
      eventMode="static"
      cursor="pointer"
      onPointerTap={handleTap}
    >
      <pixiGraphics draw={drawShadow} />

      <pixiContainer>
        <pixiGraphics draw={drawBody} />

        {/* Sunglasses */}
        {sunglassesTexture && (
          <pixiSprite
            texture={sunglassesTexture}
            anchor={0.5}
            x={0}
            y={HEAD_CY + 1}
            scale={{ x: 0.03, y: 0.034 }}
            tint={0x000000}
          />
        )}

        {/* Headset */}
        {headsetTexture && (
          <pixiSprite
            texture={headsetTexture}
            anchor={0.5}
            x={0}
            y={HEAD_CY}
            scale={{ x: 0.56, y: 0.57 }}
          />
        )}
      </pixiContainer>

      {/* Project nameplate */}
      <pixiContainer y={-BODY_H - 16} scale={0.5}>
        <pixiGraphics draw={drawPlate} />
        <pixiText
          text={shortLabel}
          anchor={0.5}
          resolution={2}
          style={{
            fontFamily: "monospace",
            fontSize: 20,
            fill: 0xffffff,
            fontWeight: "bold",
          }}
        />
      </pixiContainer>

      {/* Subagent count badge */}
      {peer.subagentCount > 0 && (
        <pixiContainer x={BODY_W / 2 - 2} y={-BODY_H + 4}>
          <pixiGraphics draw={drawBadge} />
          <pixiContainer x={13} y={8} scale={0.5}>
            <pixiText
              text={`+${peer.subagentCount}`}
              anchor={0.5}
              resolution={2}
              style={{
                fontFamily: "monospace",
                fontSize: 18,
                fill: 0xf59e0b,
                fontWeight: "bold",
              }}
            />
          </pixiContainer>
        </pixiContainer>
      )}

      {/* Todo progress bar */}
      {peer.todoTotal > 0 && (
        <pixiContainer y={12}>
          <pixiGraphics draw={drawTodoBar} />
          <pixiContainer x={0} y={8} scale={0.5}>
            <pixiText
              text={`${peer.todoDone}/${peer.todoTotal}`}
              anchor={{ x: 0.5, y: 0 }}
              resolution={2}
              style={{
                fontFamily: "monospace",
                fontSize: 14,
                fill: 0x94a3b8,
              }}
            />
          </pixiContainer>
        </pixiContainer>
      )}
    </pixiContainer>
  );
}

export const CommandCenterPeer = memo(CommandCenterPeerComponent);
