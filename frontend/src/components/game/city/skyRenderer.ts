/**
 * Sky Renderer
 *
 * Draws the sky gradient, sun, moon, stars, and clouds into a PixiJS
 * Graphics object.  All functions are pure — they only call PixiJS draw
 * commands and carry no React state.
 */

import type { Graphics } from "pixi.js";
import type { TimeState } from "./timeUtils";
import { getSeasonalTimes } from "./timeUtils";

// ============================================================================
// COLOR PALETTES
// ============================================================================

/** Sky color bands (top → bottom) for each time phase. */
export const SKY_PALETTES = {
  night: [0x0a0a1a, 0x0d0d22, 0x12122a, 0x1a1a3a, 0x1f1f45],
  dawn: [0x1a1a3a, 0x3a2a4a, 0x6a3a5a, 0xff6b4a, 0xffaa66],
  day: [0x4a90d0, 0x5aa0dd, 0x6ab0e8, 0x7bc0f0, 0x87ceeb],
  dusk: [0x3a1a3a, 0x5a2a3a, 0x8a3a3a, 0xff4444, 0xff6b4a],
};

// ============================================================================
// COLOR MATH
// ============================================================================

/**
 * Linearly interpolate between two packed RGB colors.
 */
export function lerpColor(color1: number, color2: number, t: number): number {
  const r1 = (color1 >> 16) & 0xff;
  const g1 = (color1 >> 8) & 0xff;
  const b1 = color1 & 0xff;

  const r2 = (color2 >> 16) & 0xff;
  const g2 = (color2 >> 8) & 0xff;
  const b2 = color2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return (r << 16) | (g << 8) | b;
}

// ============================================================================
// SKY GRADIENT
// ============================================================================

/**
 * Return the array of band colors to use for the sky gradient given the
 * current time phase and progress within that phase.
 */
export function getInterpolatedSkyColors(
  phase: TimeState["phase"],
  progress: number,
): number[] {
  let fromPalette: number[];
  let toPalette: number[];
  let p = progress;

  switch (phase) {
    case "night":
      return SKY_PALETTES.night;
    case "day":
      return SKY_PALETTES.day;

    case "dawn":
      if (p < 0.5) {
        fromPalette = SKY_PALETTES.night;
        toPalette = SKY_PALETTES.dawn;
        p = p * 2;
      } else {
        fromPalette = SKY_PALETTES.dawn;
        toPalette = SKY_PALETTES.day;
        p = (p - 0.5) * 2;
      }
      break;

    case "dusk":
      if (p < 0.5) {
        fromPalette = SKY_PALETTES.day;
        toPalette = SKY_PALETTES.dusk;
        p = p * 2;
      } else {
        fromPalette = SKY_PALETTES.dusk;
        toPalette = SKY_PALETTES.night;
        p = (p - 0.5) * 2;
      }
      break;
  }

  return fromPalette.map((color, i) => lerpColor(color, toPalette[i], p));
}

// ============================================================================
// DRAW FUNCTIONS
// ============================================================================

interface SkyBounds {
  skyX: number;
  skyY: number;
  innerWidth: number;
  innerHeight: number;
}

/**
 * Paint the sky gradient bands.
 */
export function drawSkyGradient(
  g: Graphics,
  bounds: SkyBounds,
  skyColors: number[],
): void {
  const { skyX, skyY, innerWidth, innerHeight } = bounds;
  const bandHeight = Math.ceil(innerHeight / skyColors.length);
  for (let i = 0; i < skyColors.length; i++) {
    g.rect(skyX, skyY + i * bandHeight, innerWidth, bandHeight);
    g.fill(skyColors[i]);
  }
}

/**
 * Draw stars during night time (with optional alpha fade at transitions).
 */
export function drawStars(
  g: Graphics,
  bounds: SkyBounds,
  timeState: TimeState,
  date: Date,
  skyColors: number[],
): void {
  const { skyX, skyY } = bounds;
  const { hour } = timeState;
  const [dawnStart, , duskStart, duskEnd] = getSeasonalTimes(date);
  const isNightTime = hour >= duskEnd || hour < dawnStart;

  if (!isNightTime) return;

  let starAlpha = 1;
  if (hour >= duskStart && hour < duskEnd) {
    starAlpha = (hour - duskStart) / (duskEnd - duskStart);
  } else if (hour >= dawnStart - 1 && hour < dawnStart) {
    starAlpha = dawnStart - hour;
  }

  const starPositions: [number, number][] = [
    [20, 15],
    [45, 25],
    [70, 10],
    [100, 20],
    [130, 12],
    [155, 28],
    [35, 35],
    [85, 32],
    [120, 38],
    [165, 18],
  ];
  const starColor = lerpColor(skyColors[0], 0xffffff, starAlpha);
  for (const [sx, sy] of starPositions) {
    g.rect(skyX + sx, skyY + sy, 2, 2);
    g.fill(starColor);
  }
}

/**
 * Draw the moon when it is up (night time — duskEnd through dawnStart).
 */
export function drawMoon(
  g: Graphics,
  bounds: SkyBounds,
  timeState: TimeState,
  date: Date,
  skyColors: number[],
): void {
  const { skyX, skyY, innerWidth, innerHeight } = bounds;
  const { hour } = timeState;
  const [dawnStart, , , duskEnd] = getSeasonalTimes(date);

  const moonVisible = hour >= duskEnd || hour < dawnStart;
  if (!moonVisible) return;

  const nightDuration = 24 - duskEnd + dawnStart;
  const moonProgress =
    hour >= duskEnd
      ? (hour - duskEnd) / nightDuration
      : (hour + (24 - duskEnd)) / nightDuration;

  const arcHeight = innerHeight - 30;
  const horizonY = skyY + innerHeight - 10;
  const moonY = horizonY - Math.sin(moonProgress * Math.PI) * arcHeight;
  const moonX = skyX + 20 + moonProgress * (innerWidth - 40);

  let moonAlpha = 1;
  if (moonProgress < 0.1) moonAlpha = moonProgress / 0.1;
  else if (moonProgress > 0.9) moonAlpha = (1 - moonProgress) / 0.1;

  const moonColor = lerpColor(skyColors[0], 0xf5f5dc, moonAlpha);
  g.circle(moonX, moonY, 12);
  g.fill(moonColor);
  // Crescent shadow
  g.circle(moonX + 5, moonY - 3, 10);
  g.fill(skyColors[0]);
}

/**
 * Draw a single fluffy cloud shape.
 */
export function drawCloud(
  g: Graphics,
  x: number,
  y: number,
  color: number,
): void {
  g.circle(x, y, 8);
  g.circle(x + 10, y - 2, 10);
  g.circle(x + 20, y, 7);
  g.fill(color);
}

/**
 * Draw the sun and clouds during daytime.
 *
 * @param cloudOffsets - Animated cloud x-offsets `{ top, bottom }`
 */
export function drawSunAndClouds(
  g: Graphics,
  bounds: SkyBounds,
  timeState: TimeState,
  date: Date,
  skyColors: number[],
  cloudOffsets: { top: number; bottom: number },
): void {
  const { skyX, skyY, innerWidth, innerHeight } = bounds;
  const { hour } = timeState;
  const [dawnStart, , , duskEnd] = getSeasonalTimes(date);

  if (hour < dawnStart || hour >= duskEnd) return;

  const dayDuration = duskEnd - dawnStart;
  const sunProgress = (hour - dawnStart) / dayDuration;

  const arcHeight = innerHeight - 40;
  const horizonY = skyY + innerHeight - 15;
  const sunY = horizonY - Math.sin(sunProgress * Math.PI) * arcHeight;
  const sunX = skyX + 20 + sunProgress * (innerWidth - 40);

  const midday = Math.sin(sunProgress * Math.PI);
  const sunColor = lerpColor(0xff6b4a, 0xffdd44, midday);

  g.circle(sunX, sunY, 15);
  g.fill(sunColor);

  if (midday > 0.5) {
    const cloudAlpha = (midday - 0.5) * 2;
    const cloudColor = lerpColor(skyColors[2], 0xffffff, cloudAlpha);

    // Top cloud (slower)
    const topCloudX = skyX - 30 + (cloudOffsets.top % (innerWidth + 60));
    drawCloud(g, topCloudX, skyY + 18, cloudColor);

    // Bottom cloud (faster)
    const bottomCloudX = skyX - 30 + (cloudOffsets.bottom % (innerWidth + 60));
    drawCloud(g, bottomCloudX, skyY + 38, cloudColor);
  }
}

/**
 * Draw the window pane divider cross.
 */
export function drawWindowDividers(g: Graphics, bounds: SkyBounds): void {
  const { skyX, skyY, innerWidth, innerHeight } = bounds;
  const dividerColor = 0x3a3a3a;
  g.rect(skyX + innerWidth / 2 - 2, skyY, 4, innerHeight);
  g.fill(dividerColor);
  g.rect(skyX, skyY + innerHeight / 2 - 2, innerWidth, 4);
  g.fill(dividerColor);
}
