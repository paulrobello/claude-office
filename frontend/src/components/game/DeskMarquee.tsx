"use client";

/**
 * DeskMarquee Component
 *
 * Displays a scrolling task description on agent desks.
 * Shows the current task the agent is working on.
 */

import { type ReactNode } from "react";
import { MarqueeText } from "./MarqueeText";

// ============================================================================
// TYPES
// ============================================================================

export interface DeskMarqueeProps {
  /** The task text to display */
  text: string;
  /** Width of the marquee panel (default: 116) */
  width?: number;
  /** Text color (default: #00ff88 - green) */
  color?: string;
  /** X position offset (default: 0) */
  x?: number;
  /** Y position offset (default: 70) */
  y?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DeskMarquee({
  text,
  width = 116,
  color = "#00ff88",
  x = 0,
  y = 70,
}: DeskMarqueeProps): ReactNode {
  if (!text) {
    return null;
  }

  return (
    <pixiContainer x={x} y={y}>
      <MarqueeText text={text} width={width} color={color} />
    </pixiContainer>
  );
}
