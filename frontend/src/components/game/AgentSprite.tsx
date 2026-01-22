/**
 * AgentSprite Component
 *
 * Renders a single agent character as a colored capsule with optional bubble.
 * Supports headset and sunglasses accessories.
 */

"use client";

import { memo, useMemo, useState, useCallback, type ReactNode } from "react";
import { useTick } from "@pixi/react";
import { Graphics, TextStyle, Texture } from "pixi.js";
import type { Position, BubbleContent } from "@/types";
import type { AgentPhase } from "@/stores/gameStore";
import { isInElevatorZone } from "@/systems/queuePositions";

// ============================================================================
// TYPES
// ============================================================================

export interface AgentSpriteProps {
  id: string;
  name: string | null;
  color: string;
  number: number;
  position: Position;
  phase: AgentPhase;
  bubble: BubbleContent | null;
  headsetTexture?: Texture | null;
  sunglassesTexture?: Texture | null;
  renderBubble?: boolean; // Whether to render bubble (default true)
  renderLabel?: boolean; // Whether to render name label (default true)
  isTyping?: boolean; // Whether agent is typing (animates arms)
}

// ============================================================================
// CONSTANTS
// ============================================================================

const AGENT_WIDTH = 48; // 1.5 blocks × 32px (matches boss)
const AGENT_HEIGHT = 80; // 2.5 blocks × 32px (matches boss)
const STROKE_WIDTH = 4;

// Map icon names to emojis for speech bubbles
const ICON_MAP: Record<string, string> = {
  clipboard: "📋",
  check: "✅",
  "thumbs-up": "👍",
  "file-text": "📄",
};

// ============================================================================
// DRAWING FUNCTIONS
// ============================================================================

function drawAgent(g: Graphics, color: string): void {
  g.clear();

  // Convert hex color string to number
  const colorNum = parseInt(color.replace("#", ""), 16) || 0xff6b6b;

  // Agent body (colored capsule with white border)
  // Position is at CENTER OF BOTTOM CIRCLE, so capsule extends from -54 to +22
  // Inset by half stroke width so total size matches AGENT_WIDTH × AGENT_HEIGHT
  const innerWidth = AGENT_WIDTH - STROKE_WIDTH;
  const innerHeight = AGENT_HEIGHT - STROKE_WIDTH;
  const agentRadius = innerWidth / 2; // 22px - radius of top/bottom circles
  g.roundRect(
    -innerWidth / 2,
    -innerHeight + agentRadius, // Bottom circle center at y=0
    innerWidth,
    innerHeight,
    agentRadius,
  );
  g.fill(colorNum);
  g.stroke({ width: STROKE_WIDTH, color: 0xffffff });
}

function drawRightArm(g: Graphics, animOffset: number = 0): void {
  g.clear();

  const armWidth = 4;

  // Agent body goes from y=-54 to y=+22, mid-height at y=-16
  const startX = (AGENT_WIDTH - STROKE_WIDTH) / 2; // 22
  const startY = -16;

  // Control points curve outward then back
  const cp1X = startX + 20;
  const cp1Y = startY + 10 + animOffset * 0.5;

  const cp2X = startX + 15;
  const cp2Y = 12 + animOffset * 0.7;

  // End point near keyboard area
  const endX = 12;
  const endY = 16 + animOffset;

  g.moveTo(startX, startY);
  g.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
  g.stroke({ width: armWidth, color: 0xffffff, cap: "round" });

  // Hand - small oval at end of arm
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
  g.fill(0x1f2937);
  g.stroke({ width: 2, color: 0xffffff });
}

function drawLeftArm(g: Graphics, animOffset: number = 0): void {
  g.clear();

  const armWidth = 4;

  // Mirrored start point
  const startX = -(AGENT_WIDTH - STROKE_WIDTH) / 2; // -22
  const startY = -16;

  // Mirrored control points
  const cp1X = startX - 20;
  const cp1Y = startY + 10 + animOffset * 0.5;

  const cp2X = startX - 15;
  const cp2Y = 12 + animOffset * 0.7;

  // Mirrored end point
  const endX = -12;
  const endY = 16 + animOffset;

  g.moveTo(startX, startY);
  g.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
  g.stroke({ width: armWidth, color: 0xffffff, cap: "round" });

  // Hand
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
  g.fill(0x1f2937);
  g.stroke({ width: 2, color: 0xffffff });
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

function AgentSpriteComponent({
  id: _id,
  name,
  color,
  number: _number,
  position,
  phase: _phase,
  bubble,
  headsetTexture: _headsetTexture,
  sunglassesTexture,
  renderBubble = true,
  renderLabel = true,
  isTyping: _isTyping = false,
}: AgentSpriteProps): ReactNode {
  // Memoize draw callback
  const drawCallback = useMemo(
    () => (g: Graphics) => drawAgent(g, color),
    [color],
  );

  // Bubble offset for capsule rendering
  const bubbleOffset = -93;

  return (
    <pixiContainer x={position.x} y={position.y}>
      {/* Agent capsule body */}
      <pixiGraphics draw={drawCallback} />

      {/* Sunglasses */}
      {sunglassesTexture && (
        <pixiSprite
          texture={sunglassesTexture}
          anchor={0.5}
          x={0}
          y={-37}
          scale={{ x: 0.036, y: 0.04 }}
        />
      )}

      {/* Agent name if present - hide when in elevator or when renderLabel is false */}
      {renderLabel && name && !isInElevatorZone(position) && (
        <pixiContainer y={-70} scale={0.5}>
          <pixiText
            text={name}
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

      {/* Bubble - hide when in elevator or when renderBubble is false */}
      {renderBubble && bubble && !isInElevatorZone(position) && (
        <Bubble content={bubble} yOffset={bubbleOffset} />
      )}
    </pixiContainer>
  );
}

// ============================================================================
// AGENT ARMS COMPONENT (rendered separately after desk surfaces)
// ============================================================================

export interface AgentArmsProps {
  position: Position;
  isTyping: boolean;
}

function AgentArmsComponent({ position, isTyping }: AgentArmsProps): ReactNode {
  // Animation state for typing
  const [typingTime, setTypingTime] = useState(0);

  // Animate typing - oscillate hands up/down
  useTick((ticker) => {
    if (isTyping) {
      setTypingTime((t) => t + ticker.deltaTime * 0.15);
    } else {
      setTypingTime(0);
    }
  });

  // Calculate arm animation offsets (subtle, out of phase for natural look)
  const rightArmOffset = isTyping ? Math.sin(typingTime * 8) * 2 : 0;
  const leftArmOffset = isTyping
    ? Math.sin(typingTime * 8 + Math.PI * 0.7) * 2
    : 0;

  // Arm draw callbacks
  const drawRightArmCallback = useCallback(
    (g: Graphics) => drawRightArm(g, rightArmOffset),
    [rightArmOffset],
  );

  const drawLeftArmCallback = useCallback(
    (g: Graphics) => drawLeftArm(g, leftArmOffset),
    [leftArmOffset],
  );

  return (
    <pixiContainer x={position.x} y={position.y}>
      <pixiGraphics draw={drawRightArmCallback} />
      <pixiGraphics draw={drawLeftArmCallback} />
    </pixiContainer>
  );
}

export const AgentArms = memo(AgentArmsComponent);

// ============================================================================
// AGENT HEADSET COMPONENT (rendered after arms for correct z-order)
// ============================================================================

export interface AgentHeadsetProps {
  position: Position;
  headsetTexture: Texture;
}

function AgentHeadsetComponent({
  position,
  headsetTexture,
}: AgentHeadsetProps): ReactNode {
  return (
    <pixiSprite
      texture={headsetTexture}
      anchor={0.5}
      x={position.x}
      y={position.y - 38}
      scale={{ x: 0.66825, y: 0.675 }}
    />
  );
}

export const AgentHeadset = memo(AgentHeadsetComponent);

// ============================================================================
// AGENT LABEL COMPONENT (rendered separately for z-ordering)
// ============================================================================

export interface AgentLabelProps {
  name: string;
  position: Position;
}

function AgentLabelComponent({ name, position }: AgentLabelProps): ReactNode {
  return (
    <pixiContainer x={position.x} y={position.y - 70} scale={0.5}>
      <pixiText
        text={name}
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
  );
}

export const AgentLabel = memo(AgentLabelComponent);

export const AgentSprite = memo(AgentSpriteComponent);

// Export Bubble component for use in top-level bubbles layer
export { Bubble };
