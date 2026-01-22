"use client";

import { Graphics } from "pixi.js";
import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  useGameStore,
  selectDebugMode,
  selectSessionId,
} from "@/stores/gameStore";

interface Building {
  x: number;
  width: number;
  height: number;
  windowRows: number;
  windowCols: number;
}

interface TimeState {
  hour: number;
  progress: number; // 0-1 progress within current transition
  phase: "night" | "dawn" | "day" | "dusk";
}

const FRAME_WIDTH = 200;
const FRAME_HEIGHT = 160;
const FRAME_THICKNESS = 8;
const INNER_WIDTH = FRAME_WIDTH - FRAME_THICKNESS * 2;
const INNER_HEIGHT = FRAME_HEIGHT - FRAME_THICKNESS * 2;

// Sky color palettes for each phase
const SKY_PALETTES = {
  night: [0x0a0a1a, 0x0d0d22, 0x12122a, 0x1a1a3a, 0x1f1f45],
  dawn: [0x1a1a3a, 0x3a2a4a, 0x6a3a5a, 0xff6b4a, 0xffaa66],
  day: [0x4a90d0, 0x5aa0dd, 0x6ab0e8, 0x7bc0f0, 0x87ceeb],
  dusk: [0x3a1a3a, 0x5a2a3a, 0x8a3a3a, 0xff4444, 0xff6b4a],
};

// Building colors for each phase
const BUILDING_COLORS = {
  night: 0x0d0d1a,
  dawn: 0x1a1a2a,
  day: 0x2a2a3a,
  dusk: 0x1a1a2a,
};

// Window lit chances for each phase
const WINDOW_LIT_CHANCES = {
  night: 0.35,
  dawn: 0.2,
  day: 0.05,
  dusk: 0.3,
};

// Seasonal sunrise/sunset times (approximate for mid-latitudes)
// Format: [dawnStart, dawnEnd, duskStart, duskEnd]
// Dawn transition: dawnStart to dawnEnd (night -> day)
// Dusk transition: duskStart to duskEnd (day -> night)
const SEASONAL_TIMES: Record<string, [number, number, number, number]> = {
  // Winter (Dec-Feb): Late sunrise, early sunset
  winter: [6.5, 8, 16.5, 18.5], // 6:30am-8am dawn, 4:30pm-6:30pm dusk
  // Spring (Mar-May): Intermediate
  spring: [5.5, 7, 18, 20.5], // 5:30am-7am dawn, 6pm-8:30pm dusk
  // Summer (Jun-Aug): Early sunrise, late sunset
  summer: [4.5, 6, 19.5, 21.5], // 4:30am-6am dawn, 7:30pm-9:30pm dusk
  // Fall (Sep-Nov): Intermediate
  fall: [6, 7.5, 17.5, 19.5], // 6am-7:30am dawn, 5:30pm-7:30pm dusk
};

/**
 * Get the current season based on month
 */
function getSeason(month: number): string {
  // month is 0-11 (Jan = 0)
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter"; // Nov, Dec, Jan, Feb
}

/**
 * Get seasonal time boundaries
 */
function getSeasonalTimes(date: Date): [number, number, number, number] {
  const season = getSeason(date.getMonth());
  return SEASONAL_TIMES[season];
}

/**
 * Hash a string to a number for seeding
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Mix multiple integers into a pseudo-random value (0-99)
 * Uses bit mixing to avoid diagonal stripe patterns
 */
function mixHash(a: number, b: number, c: number, d: number): number {
  let h = a;
  h = ((h ^ b) * 2654435761) >>> 0;
  h = ((h ^ c) * 2654435761) >>> 0;
  h = ((h ^ d) * 2654435761) >>> 0;
  // Final mixing
  h = h ^ (h >>> 16);
  h = (h * 2246822507) >>> 0;
  h = h ^ (h >>> 13);
  return h % 100;
}

/**
 * Check if sessionId represents a real session
 */
function isRealSession(sessionId: string): boolean {
  return sessionId !== "None" && sessionId !== "sim_session_123";
}

/**
 * CityWindow - Window decoration showing city skyline
 *
 * Displays a view of a city skyline that smoothly transitions based on real time.
 * Features animated sky gradients, building silhouettes, and window lights.
 */
export function CityWindow(): ReactNode {
  const [time, setTime] = useState(new Date());
  const [debugHour, setDebugHour] = useState(0);
  const [fastTimeToggle, setFastTimeToggle] = useState(false);
  const debugMode = useGameStore(selectDebugMode);
  const sessionId = useGameStore(selectSessionId);

  // Create a stable seed from sessionId or date
  const citySeed = useMemo(() => {
    if (isRealSession(sessionId)) {
      return hashString(sessionId);
    }
    // Fall back to date-based seed (changes daily)
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    return hashString(dateStr);
  }, [sessionId]);

  // Track toggled window lights (key: "buildingIdx-row-col")
  const [toggledWindows, setToggledWindows] = useState<Set<string>>(
    () => new Set(),
  );

  // Fast time is only active when both debug mode is enabled AND the toggle is on
  // When debugMode is false, fastTimeEnabled is automatically false regardless of toggle state
  const fastTimeEnabled = debugMode && fastTimeToggle;

  // Keyboard toggle for fast time (press 'T' when debug mode is enabled)
  useEffect(() => {
    if (!debugMode) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "t" || e.key === "T") {
        setFastTimeToggle((prev) => {
          if (!prev) {
            // Starting fast time - initialize debugHour to current real time
            const now = new Date();
            setDebugHour(now.getHours() + now.getMinutes() / 60);
          }
          return !prev;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [debugMode]);

  // Update time - normal mode updates every minute, fast mode every 50ms (full day in ~12 seconds)
  useEffect(() => {
    if (fastTimeEnabled) {
      const interval = setInterval(() => {
        setDebugHour((h) => (h + 0.1) % 24); // 0.1 hours per 50ms = 2 hours/sec = 12 sec full cycle
      }, 50);
      return () => clearInterval(interval);
    } else {
      const interval = setInterval(() => setTime(new Date()), 60000);
      return () => clearInterval(interval);
    }
  }, [fastTimeEnabled]);

  // Randomly toggle a window light every 1-5 minutes
  useEffect(() => {
    // Building window counts for random selection
    const buildingWindows = [
      { rows: 8, cols: 3 }, // building 0
      { rows: 11, cols: 4 }, // building 1
      { rows: 6, cols: 3 }, // building 2
      { rows: 9, cols: 5 }, // building 3
      { rows: 7, cols: 3 }, // building 4
    ];

    const scheduleNextToggle = () => {
      // Random delay between 1-3 minutes (60000-180000ms)
      const delay = 60000 + Math.random() * 120000;

      return setTimeout(() => {
        // Pick a random building and window
        const buildingIdx = Math.floor(Math.random() * buildingWindows.length);
        const { rows, cols } = buildingWindows[buildingIdx];
        const row = Math.floor(Math.random() * rows);
        const col = Math.floor(Math.random() * cols);
        const key = `${buildingIdx}-${row}-${col}`;

        // Toggle the window state
        setToggledWindows((prev) => {
          const next = new Set(prev);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });

        // Schedule next toggle
        timeoutRef = scheduleNextToggle();
      }, delay);
    };

    let timeoutRef = scheduleNextToggle();

    return () => clearTimeout(timeoutRef);
  }, []);

  // Calculate time state with transition progress (seasonal)
  const timeState = useMemo((): TimeState => {
    const hour = fastTimeEnabled
      ? debugHour
      : time.getHours() + time.getMinutes() / 60;

    // Get seasonal sunrise/sunset times
    const [dawnStart, dawnEnd, duskStart, duskEnd] = getSeasonalTimes(time);

    // Determine phase and progress within transition
    // Night: after duskEnd until dawnStart
    // Dawn: dawnStart to dawnEnd (sunrise transition)
    // Day: dawnEnd to duskStart
    // Dusk: duskStart to duskEnd (sunset transition)
    if (hour >= duskEnd || hour < dawnStart) {
      // Full night
      return { hour, progress: 0, phase: "night" };
    } else if (hour >= dawnStart && hour < dawnEnd) {
      // Dawn transition (night -> day)
      const dawnDuration = dawnEnd - dawnStart;
      const progress = (hour - dawnStart) / dawnDuration;
      return { hour, progress, phase: "dawn" };
    } else if (hour >= dawnEnd && hour < duskStart) {
      // Full day
      return { hour, progress: 0, phase: "day" };
    } else {
      // Dusk transition (day -> night)
      const duskDuration = duskEnd - duskStart;
      const progress = (hour - duskStart) / duskDuration;
      return { hour, progress, phase: "dusk" };
    }
  }, [time, debugHour, fastTimeEnabled]);

  // Building definitions (relative to window interior)
  const buildings = useMemo(
    (): Building[] => [
      { x: 5, width: 28, height: 80, windowRows: 8, windowCols: 3 },
      { x: 38, width: 35, height: 110, windowRows: 11, windowCols: 4 },
      { x: 78, width: 25, height: 65, windowRows: 6, windowCols: 3 },
      { x: 108, width: 40, height: 95, windowRows: 9, windowCols: 5 },
      { x: 153, width: 30, height: 75, windowRows: 7, windowCols: 3 },
    ],
    [],
  );

  // Draw the window frame borders (rendered on top to cover content edges)
  const drawFrame = useCallback((g: Graphics) => {
    g.clear();

    // Top border
    g.rect(0, 0, FRAME_WIDTH, FRAME_THICKNESS);
    g.fill(0x1a1a1a);
    g.rect(2, 2, FRAME_WIDTH - 4, FRAME_THICKNESS - 2);
    g.fill(0x2d2d2d);
    g.rect(FRAME_THICKNESS - 2, FRAME_THICKNESS - 2, INNER_WIDTH + 4, 2);
    g.fill(0x4a4a4a);

    // Bottom border
    g.rect(0, FRAME_HEIGHT - FRAME_THICKNESS, FRAME_WIDTH, FRAME_THICKNESS);
    g.fill(0x1a1a1a);
    g.rect(
      2,
      FRAME_HEIGHT - FRAME_THICKNESS,
      FRAME_WIDTH - 4,
      FRAME_THICKNESS - 2,
    );
    g.fill(0x2d2d2d);
    g.rect(
      FRAME_THICKNESS - 2,
      FRAME_HEIGHT - FRAME_THICKNESS,
      INNER_WIDTH + 4,
      2,
    );
    g.fill(0x4a4a4a);

    // Left border
    g.rect(0, 0, FRAME_THICKNESS, FRAME_HEIGHT);
    g.fill(0x1a1a1a);
    g.rect(2, 2, FRAME_THICKNESS - 2, FRAME_HEIGHT - 4);
    g.fill(0x2d2d2d);
    g.rect(FRAME_THICKNESS - 2, FRAME_THICKNESS - 2, 2, INNER_HEIGHT + 4);
    g.fill(0x4a4a4a);

    // Right border
    g.rect(FRAME_WIDTH - FRAME_THICKNESS, 0, FRAME_THICKNESS, FRAME_HEIGHT);
    g.fill(0x1a1a1a);
    g.rect(
      FRAME_WIDTH - FRAME_THICKNESS,
      2,
      FRAME_THICKNESS - 2,
      FRAME_HEIGHT - 4,
    );
    g.fill(0x2d2d2d);
    g.rect(
      FRAME_WIDTH - FRAME_THICKNESS,
      FRAME_THICKNESS - 2,
      2,
      INNER_HEIGHT + 4,
    );
    g.fill(0x4a4a4a);
  }, []);

  // Draw the sky and city content
  const drawContent = useCallback(
    (g: Graphics) => {
      g.clear();

      const skyX = FRAME_THICKNESS;
      const skyY = FRAME_THICKNESS;
      const { phase, progress } = timeState;

      // Get interpolated sky colors
      const skyColors = getInterpolatedSkyColors(phase, progress);
      const bandHeight = Math.ceil(INNER_HEIGHT / skyColors.length);

      for (let i = 0; i < skyColors.length; i++) {
        g.rect(skyX, skyY + i * bandHeight, INNER_WIDTH, bandHeight);
        g.fill(skyColors[i]);
      }

      // Get current hour and seasonal times for celestial positioning
      const { hour } = timeState;
      const [dawnStart, _dawnEnd, duskStart, duskEnd] = getSeasonalTimes(time);

      // Draw stars - visible from dusk end to dawn start (night time)
      const isNightTime = hour >= duskEnd || hour < dawnStart;
      if (isNightTime) {
        // Calculate star visibility (fade in/out at edges)
        let starAlpha = 1;
        if (hour >= duskStart && hour < duskEnd) {
          // Fade in during dusk
          starAlpha = (hour - duskStart) / (duskEnd - duskStart);
        } else if (hour >= dawnStart - 1 && hour < dawnStart) {
          // Fade out approaching dawn
          starAlpha = dawnStart - hour;
        }

        const starPositions = [
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

      // Draw moon - arcs across sky during night (duskEnd to dawnStart)
      // Moon rises at dusk end, peaks at midnight, sets at dawn start
      if (hour >= duskEnd || hour < dawnStart) {
        // Calculate night duration (hours from dusk end to dawn start)
        const nightDuration = 24 - duskEnd + dawnStart;

        // Map hour to 0-1 for moon arc
        let moonProgress: number;
        if (hour >= duskEnd) {
          moonProgress = (hour - duskEnd) / nightDuration;
        } else {
          moonProgress = (hour + (24 - duskEnd)) / nightDuration;
        }

        // Moon Y position: parabolic arc (highest at midnight)
        const arcHeight = INNER_HEIGHT - 30;
        const horizonY = skyY + INNER_HEIGHT - 10;
        const moonY = horizonY - Math.sin(moonProgress * Math.PI) * arcHeight;

        // Moon X position: moves from left to right (same as sun - east to west)
        const moonX = skyX + 20 + moonProgress * (INNER_WIDTH - 40);

        // Moon visibility (fade in/out at horizon)
        let moonAlpha = 1;
        if (moonProgress < 0.1) moonAlpha = moonProgress / 0.1;
        else if (moonProgress > 0.9) moonAlpha = (1 - moonProgress) / 0.1;

        const moonColor = lerpColor(skyColors[0], 0xf5f5dc, moonAlpha);
        g.circle(moonX, moonY, 12);
        g.fill(moonColor);
        // Moon shadow (crescent effect)
        g.circle(moonX + 5, moonY - 3, 10);
        g.fill(skyColors[0]);
      }

      // Draw sun - arcs across sky from dawn to dusk (seasonal)
      // Sun is visible from dawnStart to duskEnd, peaking at solar noon
      if (hour >= dawnStart && hour < duskEnd) {
        // Calculate day duration and sun progress
        const dayDuration = duskEnd - dawnStart;
        const sunProgress = (hour - dawnStart) / dayDuration;

        // Sun Y position: parabolic arc (highest at solar noon)
        // At progress=0 (dawn) and progress=1 (dusk): sun at horizon
        // At progress=0.5 (solar noon): sun at peak
        const arcHeight = INNER_HEIGHT - 40; // How high sun travels
        const horizonY = skyY + INNER_HEIGHT - 15; // Sun position at horizon
        const sunY = horizonY - Math.sin(sunProgress * Math.PI) * arcHeight;

        // Sun X position: moves from left to right across window
        const sunX = skyX + 20 + sunProgress * (INNER_WIDTH - 40);

        // Sun color: orange at dawn/dusk, yellow at midday
        const midday = Math.sin(sunProgress * Math.PI); // 0 at edges, 1 at noon
        const sunColor = lerpColor(0xff6b4a, 0xffdd44, midday);

        g.circle(sunX, sunY, 15);
        g.fill(sunColor);

        // Clouds only visible when sun is high enough (midday period)
        if (midday > 0.5) {
          const cloudAlpha = (midday - 0.5) * 2;
          const cloudColor = lerpColor(skyColors[2], 0xffffff, cloudAlpha);
          drawCloud(g, skyX + 25, skyY + 20, cloudColor);
          drawCloud(g, skyX + 100, skyY + 35, cloudColor);
        }
      }

      // Get interpolated building color and window lit chance
      const buildingColor = getInterpolatedBuildingColor(phase, progress);
      const windowLitChance = getInterpolatedWindowLitChance(phase, progress);
      const buildingBaseY = skyY + INNER_HEIGHT + FRAME_THICKNESS;

      for (let buildingIdx = 0; buildingIdx < buildings.length; buildingIdx++) {
        const building = buildings[buildingIdx];
        const bx = skyX + building.x;
        const by = buildingBaseY - building.height;

        // Building silhouette
        g.rect(bx, by, building.width, building.height);
        g.fill(buildingColor);

        // Building windows
        const windowWidth = 4;
        const windowHeight = 5;
        const windowSpacingX = Math.floor(
          (building.width - 4) / building.windowCols,
        );
        const windowSpacingY = Math.floor(
          (building.height - 8) / building.windowRows,
        );

        for (let row = 0; row < building.windowRows; row++) {
          for (let col = 0; col < building.windowCols; col++) {
            const wx =
              bx +
              2 +
              col * windowSpacingX +
              (windowSpacingX - windowWidth) / 2;
            const wy = by + 4 + row * windowSpacingY;

            // Determine if window is lit (using pseudo-random based on position and session)
            const seed = mixHash(citySeed, buildingIdx, row, col);
            let isLit = seed < windowLitChance * 100;

            // Check if this window has been toggled
            const toggleKey = `${buildingIdx}-${row}-${col}`;
            if (toggledWindows.has(toggleKey)) {
              isLit = !isLit; // Flip the state
            }

            g.rect(wx, wy, windowWidth, windowHeight);
            g.fill(isLit ? 0xffdd44 : 0x1a1a2a);
          }
        }
      }

      // Window pane dividers (cross pattern)
      const dividerColor = 0x3a3a3a;
      g.rect(skyX + INNER_WIDTH / 2 - 2, skyY, 4, INNER_HEIGHT);
      g.fill(dividerColor);
      g.rect(skyX, skyY + INNER_HEIGHT / 2 - 2, INNER_WIDTH, 4);
      g.fill(dividerColor);
    },
    [timeState, buildings, time, toggledWindows, citySeed],
  );

  return (
    <pixiContainer>
      <pixiGraphics draw={drawContent} />
      <pixiGraphics draw={drawFrame} />
    </pixiContainer>
  );
}

/**
 * Linearly interpolate between two colors
 */
function lerpColor(color1: number, color2: number, t: number): number {
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

/**
 * Get interpolated sky colors based on phase and progress
 */
function getInterpolatedSkyColors(
  phase: TimeState["phase"],
  progress: number,
): number[] {
  let fromPalette: number[];
  let toPalette: number[];

  switch (phase) {
    case "night":
      return SKY_PALETTES.night;
    case "dawn":
      fromPalette = SKY_PALETTES.night;
      toPalette = SKY_PALETTES.day;
      break;
    case "day":
      return SKY_PALETTES.day;
    case "dusk":
      // Dusk goes through sunset colors then to night
      if (progress < 0.5) {
        fromPalette = SKY_PALETTES.day;
        toPalette = SKY_PALETTES.dusk;
        progress = progress * 2;
      } else {
        fromPalette = SKY_PALETTES.dusk;
        toPalette = SKY_PALETTES.night;
        progress = (progress - 0.5) * 2;
      }
      break;
  }

  // For dawn, go through dawn colors in the middle
  if (phase === "dawn") {
    if (progress < 0.5) {
      fromPalette = SKY_PALETTES.night;
      toPalette = SKY_PALETTES.dawn;
      progress = progress * 2;
    } else {
      fromPalette = SKY_PALETTES.dawn;
      toPalette = SKY_PALETTES.day;
      progress = (progress - 0.5) * 2;
    }
  }

  return fromPalette.map((color, i) =>
    lerpColor(color, toPalette[i], progress),
  );
}

/**
 * Get interpolated building color
 */
function getInterpolatedBuildingColor(
  phase: TimeState["phase"],
  progress: number,
): number {
  switch (phase) {
    case "night":
      return BUILDING_COLORS.night;
    case "dawn":
      return lerpColor(BUILDING_COLORS.night, BUILDING_COLORS.day, progress);
    case "day":
      return BUILDING_COLORS.day;
    case "dusk":
      return lerpColor(BUILDING_COLORS.day, BUILDING_COLORS.night, progress);
  }
}

/**
 * Get interpolated window lit chance
 */
function getInterpolatedWindowLitChance(
  phase: TimeState["phase"],
  progress: number,
): number {
  switch (phase) {
    case "night":
      return WINDOW_LIT_CHANCES.night;
    case "dawn":
      return (
        WINDOW_LIT_CHANCES.night +
        (WINDOW_LIT_CHANCES.day - WINDOW_LIT_CHANCES.night) * progress
      );
    case "day":
      return WINDOW_LIT_CHANCES.day;
    case "dusk":
      return (
        WINDOW_LIT_CHANCES.day +
        (WINDOW_LIT_CHANCES.night - WINDOW_LIT_CHANCES.day) * progress
      );
  }
}

/**
 * Draw a simple cloud shape
 */
function drawCloud(g: Graphics, x: number, y: number, color: number): void {
  g.circle(x, y, 8);
  g.circle(x + 10, y - 2, 10);
  g.circle(x + 20, y, 7);
  g.fill(color);
}
