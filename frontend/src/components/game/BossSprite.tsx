/**
 * BossSprite Component
 *
 * Renders the boss character at their desk with state-based coloring.
 * Uses sprites for desk, chair, keyboard, monitor, and phone like agent desks.
 */

"use client";

import { memo, useMemo, useState, useCallback, type ReactNode } from "react";
import { useTick } from "@pixi/react";
import { Graphics, TextStyle, Texture } from "pixi.js";
import type { BossState, BubbleContent, Position } from "@/types";
import { MarqueeText } from "./MarqueeText";

// ============================================================================
// TYPES
// ============================================================================

export interface BossSpriteProps {
  position: Position;
  state: BossState;
  bubble: BubbleContent | null;
  inUseBy: "arrival" | "departure" | null;
  currentTask: string | null;
  chairTexture: Texture | null;
  deskTexture: Texture | null;
  keyboardTexture: Texture | null;
  monitorTexture: Texture | null;
  phoneTexture: Texture | null;
  headsetTexture: Texture | null;
  sunglassesTexture: Texture | null;
  renderBubble?: boolean; // Whether to render bubble (default true)
  isTyping?: boolean; // Whether boss is typing (animates arms)
  isAway?: boolean; // Whether boss is away from desk (hides body, shows only furniture)
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BOSS_WIDTH = 48; // 1.5 blocks × 32px
const BOSS_HEIGHT = 80; // 2.5 blocks × 32px
const STROKE_WIDTH = 4;

// Map icon names to emojis for speech bubbles
const ICON_MAP: Record<string, string> = {
  clipboard: "📋",
  check: "✅",
  "thumbs-up": "👍",
  "file-text": "📄",
};

// State colors for the boss (kept for reference, not currently used)
const _STATE_COLORS: Record<BossState, number> = {
  idle: 0x2d3748, // Gray
  phone_ringing: 0xfbbf24, // Yellow
  on_phone: 0xfbbf24, // Yellow
  receiving: 0x06b6d4, // Cyan - receiving user input
  working: 0xef4444, // Red - active
  delegating: 0x8b5cf6, // Purple - spawning agents
  waiting_permission: 0xf97316, // Orange - waiting for permission
  reviewing: 0x3b82f6, // Blue - reviewing agent work
  completing: 0x22c55e, // Green - finishing up
};

// ============================================================================
// DRAWING FUNCTIONS
// ============================================================================

function drawBossBody(g: Graphics, _state: BossState): void {
  g.clear();
  // Boss body (black capsule - state color changes were distracting)
  // Inset by half stroke width so total size matches BOSS_WIDTH × BOSS_HEIGHT
  const innerWidth = BOSS_WIDTH - STROKE_WIDTH;
  const innerHeight = BOSS_HEIGHT - STROKE_WIDTH;
  const bossRadius = innerWidth / 2;
  g.roundRect(
    -innerWidth / 2,
    -innerHeight / 2,
    innerWidth,
    innerHeight,
    bossRadius,
  );
  g.fill(0x1f2937); // Always dark gray
  g.stroke({ width: STROKE_WIDTH, color: 0xffffff });
}

function drawRightArm(g: Graphics, animOffset: number = 0): void {
  g.clear();

  // Arm dimensions
  const armWidth = 4;

  // Start point: right edge of body at mid-height
  const startX = (BOSS_WIDTH - STROKE_WIDTH) / 2; // 22
  const startY = 0;

  // Control point 1: curves outward to the right
  const cp1X = startX + 20;
  const cp1Y = startY + 10 + animOffset * 0.5;

  // Control point 2: starts curving back inward
  const cp2X = startX + 15;
  const cp2Y = 28 + animOffset * 0.7;

  // End point: near the keyboard (keyboard is at y=32 relative to body)
  const endX = 12;
  const endY = 32 + animOffset;

  // Draw the arm as a thick curved line
  g.moveTo(startX, startY);
  g.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
  g.stroke({ width: armWidth, color: 0xffffff, cap: "round" });

  // Hand - small oval (agent-style) at end of arm
  const handWidth = 10;
  const handHeight = 14;
  const handRadius = handWidth / 2;
  g.roundRect(
    endX - handWidth / 2,
    endY - handHeight / 2,
    handWidth,
    handHeight,
    handRadius,
  );
  g.fill(0x1f2937); // Same dark gray as boss body
  g.stroke({ width: 2, color: 0xffffff });
}

function drawLeftArm(g: Graphics, animOffset: number = 0): void {
  g.clear();

  // Arm dimensions
  const armWidth = 4;

  // Start point: left edge of body at mid-height (mirrored)
  const startX = -(BOSS_WIDTH - STROKE_WIDTH) / 2; // -22
  const startY = 0;

  // Control point 1: curves outward to the left (mirrored)
  const cp1X = startX - 20;
  const cp1Y = startY + 10 + animOffset * 0.5;

  // Control point 2: starts curving back inward (mirrored)
  const cp2X = startX - 15;
  const cp2Y = 28 + animOffset * 0.7;

  // End point: near the keyboard (mirrored)
  const endX = -12;
  const endY = 32 + animOffset;

  // Draw the arm as a thick curved line
  g.moveTo(startX, startY);
  g.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
  g.stroke({ width: armWidth, color: 0xffffff, cap: "round" });

  // Hand - small oval (agent-style) at end of arm
  const handWidth = 10;
  const handHeight = 14;
  const handRadius = handWidth / 2;
  g.roundRect(
    endX - handWidth / 2,
    endY - handHeight / 2,
    handWidth,
    handHeight,
    handRadius,
  );
  g.fill(0x1f2937); // Same dark gray as boss body
  g.stroke({ width: 2, color: 0xffffff });
}

function drawFallbackChair(g: Graphics): void {
  g.clear();
  g.circle(0, 15, 25);
  g.fill(0x4a5568);
  g.stroke({ width: 2, color: 0x2d3748 });
}

function drawFallbackDesk(g: Graphics): void {
  g.clear();
  g.rect(-70, 15, 140, 80);
  g.fill(0x5d3a1e);
  g.stroke({ width: 4, color: 0x3d2a1e });
}

function drawBubble(
  g: Graphics,
  width: number,
  height: number,
  type: "thought" | "speech" = "thought",
): void {
  g.clear();

  const halfW = width / 2;
  const radius = type === "thought" ? 20 : 12;
  const shadowOff = 2;
  const shadowAlpha = 0.2;

  // Shadow pass
  if (type === "thought") {
    g.circle(-10 + shadowOff, 6 + shadowOff, 4);
    g.fill({ color: 0x000000, alpha: shadowAlpha });
    g.circle(-20 + shadowOff, 14 + shadowOff, 2);
    g.fill({ color: 0x000000, alpha: shadowAlpha });
  } else {
    g.moveTo(-15 + shadowOff, 0 + shadowOff);
    g.lineTo(-20 + shadowOff, 12 + shadowOff);
    g.lineTo(-5 + shadowOff, 0 + shadowOff);
    g.closePath();
    g.fill({ color: 0x000000, alpha: shadowAlpha });
  }
  g.roundRect(-halfW + shadowOff, -height + shadowOff, width, height, radius);
  g.fill({ color: 0x000000, alpha: shadowAlpha });

  // Main bubble
  g.roundRect(-halfW, -height, width, height, radius);
  g.fill(0xffffff);
  g.stroke({ width: 1.5, color: 0x000000 });

  // Tail (drawn after bubble)
  if (type === "thought") {
    g.circle(-10, 6, 4);
    g.fill(0xffffff);
    g.stroke({ width: 1.5, color: 0x000000 });
    g.circle(-20, 14, 2);
    g.fill(0xffffff);
    g.stroke({ width: 1, color: 0x000000 });
  } else {
    // Speech tail - fill extends into bubble to cover the stroke
    g.moveTo(-15, -2);
    g.lineTo(-20, 12);
    g.lineTo(-5, -2);
    g.closePath();
    g.fill(0xffffff);
    // Stroke only the outer V edges
    g.moveTo(-15, 0);
    g.lineTo(-20, 12);
    g.lineTo(-5, 0);
    g.stroke({ width: 1.5, color: 0x000000 });
  }
}

// ============================================================================
// BUBBLE COMPONENT
// ============================================================================

interface BubbleProps {
  content: BubbleContent;
  yOffset: number;
}

// Draw circular badge background for icon
function drawIconBadge(g: Graphics, radius: number): void {
  g.clear();
  // Shadow
  g.circle(1, 1, radius);
  g.fill({ color: 0x000000, alpha: 0.2 });
  // White background
  g.circle(0, 0, radius);
  g.fill(0xffffff);
  g.stroke({ width: 1.5, color: 0x000000 });
}

function Bubble({ content, yOffset }: BubbleProps): ReactNode {
  const { text, type = "thought", icon } = content;

  // Convert icon name to emoji if needed
  const iconEmoji = icon ? (ICON_MAP[icon] ?? icon) : undefined;

  // Icon badge constants
  const badgeRadius = 16; // Radius of the circular badge

  // Calculate bubble dimensions (at display scale) - icon is outside bubble now
  const charWidth = 7.5;
  const paddingH = 30;
  const maxW = 220;
  const rawWidth = text.length * charWidth + paddingH;
  const bWidth = Math.min(maxW, Math.max(80, rawWidth));
  const capacity = (bWidth - paddingH) / charWidth;
  const lines = Math.max(1, Math.ceil(text.length / capacity));
  const bHeight = 35 + lines * 14;

  // Text style at 2x for sharp rendering
  const textStyle = useMemo<Partial<TextStyle>>(
    () => ({
      fontFamily:
        '"Courier New", Courier, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", monospace',
      fontSize: 20,
      fill: "#000000",
      fontWeight: "bold",
      wordWrap: true,
      wordWrapWidth: (bWidth - 30) * 2,
      breakWords: true,
      align: "left",
      lineHeight: 28,
      stroke: { width: 0, color: 0x000000 },
    }),
    [bWidth],
  );

  // Icon style - larger emoji
  const iconStyle = useMemo<Partial<TextStyle>>(
    () => ({
      fontFamily:
        '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
      fontSize: 40, // Large emoji for badge
      fill: "#000000",
    }),
    [],
  );

  return (
    <pixiContainer y={yOffset} x={45}>
      <pixiGraphics draw={(g) => drawBubble(g, bWidth, bHeight, type)} />
      {/* Icon badge on top-left corner of bubble */}
      {iconEmoji && (
        <pixiContainer x={-bWidth / 2 - 6} y={-bHeight + 6}>
          <pixiGraphics draw={(g) => drawIconBadge(g, badgeRadius)} />
          <pixiContainer scale={0.5} x={0} y={1}>
            <pixiText
              text={iconEmoji}
              anchor={0.5}
              style={iconStyle}
              resolution={2}
            />
          </pixiContainer>
        </pixiContainer>
      )}
      {/* Text rendered at 2x and scaled down for sharpness */}
      <pixiContainer x={-bWidth / 2 + 15} y={-bHeight / 2} scale={0.5}>
        <pixiText
          text={text}
          anchor={{ x: 0, y: 0.5 }}
          style={textStyle}
          resolution={2}
        />
      </pixiContainer>
    </pixiContainer>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function BossSpriteComponent({
  position,
  state,
  bubble,
  inUseBy: _inUseBy,
  currentTask,
  chairTexture,
  deskTexture,
  keyboardTexture,
  monitorTexture,
  phoneTexture: _phoneTexture,
  headsetTexture,
  sunglassesTexture,
  renderBubble = true,
  isTyping = false,
  isAway = false,
}: BossSpriteProps): ReactNode {
  // Animation state for typing
  const [typingTime, setTypingTime] = useState(0);

  // Animate typing - oscillate hands up/down
  useTick((ticker) => {
    if (isTyping) {
      setTypingTime((t) => t + ticker.deltaTime * 0.15);
    } else {
      // Reset to 0 when not typing
      setTypingTime(0);
    }
  });

  // Calculate arm animation offsets (subtle, out of phase for natural look)
  const rightArmOffset = isTyping ? Math.sin(typingTime * 8) * 2 : 0;
  const leftArmOffset = isTyping
    ? Math.sin(typingTime * 8 + Math.PI * 0.7) * 2
    : 0;

  // Memoize draw callbacks
  const drawBossCallback = useMemo(
    () => (g: Graphics) => drawBossBody(g, state),
    [state],
  );

  // Arm draw callbacks need to be recreated when animation changes
  const drawRightArmCallback = useCallback(
    (g: Graphics) => drawRightArm(g, rightArmOffset),
    [rightArmOffset],
  );

  const drawLeftArmCallback = useCallback(
    (g: Graphics) => drawLeftArm(g, leftArmOffset),
    [leftArmOffset],
  );

  const bubbleOffset = -80;

  return (
    <pixiContainer x={position.x} y={position.y}>
      {/* Chair - behind everything */}
      {chairTexture ? (
        <pixiSprite
          texture={chairTexture}
          anchor={0.5}
          x={5}
          y={30}
          scale={0.1386}
        />
      ) : (
        <pixiGraphics draw={drawFallbackChair} />
      )}

      {/* Boss character (body + accessories) - hidden when away from desk */}
      {!isAway && (
        <pixiContainer y={6}>
          {/* Boss body - in front of chair, behind desk */}
          <pixiGraphics draw={drawBossCallback} />

          {/* Sunglasses - boss always looks cool (drawn before arms) */}
          {sunglassesTexture && (
            <pixiSprite
              texture={sunglassesTexture}
              anchor={0.5}
              x={0}
              y={-19}
              scale={{ x: 0.036, y: 0.04 }}
              tint={0x000000}
            />
          )}
        </pixiContainer>
      )}

      {/* Desk surface - in front of boss */}
      {deskTexture ? (
        <pixiSprite
          texture={deskTexture}
          anchor={{ x: 0.5, y: 0 }}
          y={30}
          scale={0.105}
        />
      ) : (
        <pixiGraphics draw={drawFallbackDesk} />
      )}

      {/* Keyboard - on desk surface */}
      {keyboardTexture && (
        <pixiSprite
          texture={keyboardTexture}
          anchor={0.5}
          x={0}
          y={42}
          scale={0.04}
        />
      )}

      {/* Arms - hidden when away from desk */}
      {!isAway && (
        <pixiContainer y={6}>
          <pixiGraphics draw={drawRightArmCallback} />
          <pixiGraphics draw={drawLeftArmCallback} />
        </pixiContainer>
      )}

      {/* Headset - hidden when away from desk */}
      {!isAway && headsetTexture && (
        <pixiSprite
          texture={headsetTexture}
          anchor={0.5}
          x={0}
          y={6 - 20}
          scale={{ x: 0.66825, y: 0.675 }}
        />
      )}

      {/* Monitor - left side of desk */}
      {monitorTexture && (
        <pixiSprite
          texture={monitorTexture}
          anchor={0.5}
          x={-45}
          y={27}
          scale={0.08}
        />
      )}

      {/* Boss label - hidden when away from desk */}
      {!isAway && (
        <pixiContainer y={-63} scale={0.5}>
          <pixiText
            text="Claude"
            anchor={0.5}
            style={{
              fontFamily: "monospace",
              fontSize: 24,
              fill: 0xffffff,
              fontWeight: "bold",
              stroke: { width: 4, color: 0x000000 },
            }}
            resolution={2}
          />
        </pixiContainer>
      )}

      {/* Task marquee on desk - scrolling user prompt */}
      {currentTask && (
        <pixiContainer x={0} y={70}>
          <MarqueeText text={currentTask} width={115} color="#00ff88" />
        </pixiContainer>
      )}

      {/* Bubble - only render if renderBubble is true and boss is at desk */}
      {renderBubble && bubble && !isAway && (
        <Bubble content={bubble} yOffset={bubbleOffset} />
      )}
    </pixiContainer>
  );
}

export const BossSprite = memo(BossSpriteComponent);

// Export Bubble component for use in top-level bubbles layer
export { Bubble as BossBubble };

// ============================================================================
// MOBILE BOSS COMPONENT (for walking around the office)
// ============================================================================

export interface MobileBossProps {
  position: Position;
  jumpOffset?: number; // Vertical offset for jump animation
  scale?: number; // Scale factor for boss body
  sunglassesTexture: Texture | null;
  headsetTexture: Texture | null;
}

function MobileBossComponent({
  position,
  jumpOffset = 0,
  scale = 1.0,
  sunglassesTexture,
  headsetTexture,
}: MobileBossProps): ReactNode {
  const drawBossCallback = useMemo(
    () => (g: Graphics) => drawBossBody(g, "working"),
    [],
  );

  return (
    <pixiContainer x={position.x} y={position.y + jumpOffset} scale={scale}>
      {/* Boss body */}
      <pixiGraphics draw={drawBossCallback} />

      {/* Sunglasses */}
      {sunglassesTexture && (
        <pixiSprite
          texture={sunglassesTexture}
          anchor={0.5}
          x={0}
          y={-19}
          scale={{ x: 0.036, y: 0.04 }}
          tint={0x000000}
        />
      )}

      {/* Headset */}
      {headsetTexture && (
        <pixiSprite
          texture={headsetTexture}
          anchor={0.5}
          x={0}
          y={-20}
          scale={{ x: 0.66825, y: 0.675 }}
        />
      )}

      {/* Boss label */}
      <pixiContainer y={-63} scale={0.5}>
        <pixiText
          text="Claude"
          anchor={0.5}
          style={{
            fontFamily: "monospace",
            fontSize: 24,
            fill: 0xffffff,
            fontWeight: "bold",
            stroke: { width: 4, color: 0x000000 },
          }}
          resolution={2}
        />
      </pixiContainer>
    </pixiContainer>
  );
}

export const MobileBoss = memo(MobileBossComponent);
