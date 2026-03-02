/**
 * Shared Bubble Drawing Utility
 *
 * Common bubble drawing function used by both BossSprite and AgentSprite.
 * Draws a thought or speech bubble with shadow, main body, and tail.
 */

import { Graphics } from "pixi.js";

/**
 * Draws a thought or speech bubble on a PIXI Graphics object.
 *
 * @param g - The PIXI Graphics instance to draw on
 * @param width - Width of the bubble in pixels
 * @param height - Height of the bubble in pixels
 * @param type - Bubble type: "thought" renders rounded dots, "speech" renders a triangular tail
 */
export function drawBubble(
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

/**
 * Draws a circular badge background for an icon overlay.
 *
 * @param g - The PIXI Graphics instance to draw on
 * @param radius - Radius of the circular badge in pixels
 */
export function drawIconBadge(g: Graphics, radius: number): void {
  g.clear();
  // Shadow
  g.circle(1, 1, radius);
  g.fill({ color: 0x000000, alpha: 0.2 });
  // White background
  g.circle(0, 0, radius);
  g.fill(0xffffff);
  g.stroke({ width: 1.5, color: 0x000000 });
}
