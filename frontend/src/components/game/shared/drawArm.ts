/**
 * Shared Arm Drawing Utility
 *
 * Parameterized arm drawing for both BossSprite and AgentSprite.
 * Handles left/right mirroring and configurable body anchor coordinates.
 */

import { Graphics } from "pixi.js";

/** Parameters for drawing a character arm. */
export interface ArmDrawParams {
  /** Half-width of the character body at the shoulder (positive value). */
  bodyHalfWidth: number;
  /** Y coordinate of the shoulder attachment point on the body. */
  startY: number;
  /** Y coordinate of the keyboard/destination where the hand ends up at rest. */
  endY: number;
  /** Fill color for the hand (hex number, e.g. 0x1f2937). */
  handColor: number;
  /** Current animation offset (oscillates during typing). */
  animOffset?: number;
}

const ARM_WIDTH = 4;
const HAND_WIDTH = 10;
const HAND_HEIGHT = 14;

/**
 * Draws a right arm curving from the body shoulder down toward the keyboard.
 *
 * @param g - The PIXI Graphics instance to draw on
 * @param params - Arm drawing parameters
 */
export function drawRightArm(g: Graphics, params: ArmDrawParams): void {
  g.clear();

  const { bodyHalfWidth, startY, endY, handColor, animOffset = 0 } = params;

  const startX = bodyHalfWidth;

  // Control point 1: curves outward to the right
  const cp1X = startX + 20;
  const cp1Y = startY + 10 + animOffset * 0.5;

  // Control point 2: starts curving back inward (4px before endY)
  const cp2X = startX + 15;
  const cp2Y = endY - 4 + animOffset * 0.7;

  // End point near the keyboard
  const endX = 12;
  const finalEndY = endY + animOffset;

  g.moveTo(startX, startY);
  g.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, finalEndY);
  g.stroke({ width: ARM_WIDTH, color: 0xffffff, cap: "round" });

  // Hand - small oval at end of arm
  const handRadius = HAND_WIDTH / 2;
  g.roundRect(
    endX - HAND_WIDTH / 2,
    finalEndY - HAND_HEIGHT / 2,
    HAND_WIDTH,
    HAND_HEIGHT,
    handRadius,
  );
  g.fill(handColor);
  g.stroke({ width: 2, color: 0xffffff });
}

/**
 * Draws a left arm curving from the body shoulder down toward the keyboard
 * (mirror image of the right arm).
 *
 * @param g - The PIXI Graphics instance to draw on
 * @param params - Arm drawing parameters
 */
export function drawLeftArm(g: Graphics, params: ArmDrawParams): void {
  g.clear();

  const { bodyHalfWidth, startY, endY, handColor, animOffset = 0 } = params;

  const startX = -bodyHalfWidth;

  // Control points mirror the right arm horizontally
  const cp1X = startX - 20;
  const cp1Y = startY + 10 + animOffset * 0.5;

  // Control point 2: starts curving back inward (4px before endY)
  const cp2X = startX - 15;
  const cp2Y = endY - 4 + animOffset * 0.7;

  // End point near the keyboard (mirrored)
  const endX = -12;
  const finalEndY = endY + animOffset;

  g.moveTo(startX, startY);
  g.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, finalEndY);
  g.stroke({ width: ARM_WIDTH, color: 0xffffff, cap: "round" });

  // Hand - small oval at end of arm
  const handRadius = HAND_WIDTH / 2;
  g.roundRect(
    endX - HAND_WIDTH / 2,
    finalEndY - HAND_HEIGHT / 2,
    HAND_WIDTH,
    HAND_HEIGHT,
    handRadius,
  );
  g.fill(handColor);
  g.stroke({ width: 2, color: 0xffffff });
}
