"use client";

import { Graphics, Container } from "pixi.js";
import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  useGameStore,
  selectDebugMode,
  selectSessionId,
} from "@/stores/gameStore";

// City sub-modules
import {
  computeTimeState,
  getSeasonalTimes,
  hashString,
} from "./city/timeUtils";
import {
  getInterpolatedSkyColors,
  drawSkyGradient,
  drawStars,
  drawMoon,
  drawSunAndClouds,
  drawWindowDividers,
} from "./city/skyRenderer";
import {
  drawBuildings,
  DEFAULT_BUILDINGS,
  BUILDING_WINDOW_COUNTS,
} from "./city/buildingRenderer";

// ============================================================================
// CONSTANTS
// ============================================================================

const FRAME_WIDTH = 200;
const FRAME_HEIGHT = 160;
const FRAME_THICKNESS = 8;
const INNER_WIDTH = FRAME_WIDTH - FRAME_THICKNESS * 2;
const INNER_HEIGHT = FRAME_HEIGHT - FRAME_THICKNESS * 2;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if sessionId represents a real (non-simulation) session.
 */
function isRealSession(sessionId: string): boolean {
  return sessionId !== "None" && sessionId !== "sim_session_123";
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * CityWindow — Window decoration showing city skyline.
 *
 * Displays a view of a city skyline that smoothly transitions based on real
 * time.  Features animated sky gradients, building silhouettes, and window
 * lights.
 *
 * Rendering logic is delegated to:
 *   - `city/timeUtils.ts`    — Phase and seasonal time calculations
 *   - `city/skyRenderer.ts`  — Sky gradient, sun, moon, stars, clouds
 *   - `city/buildingRenderer.ts` — Building silhouettes and windows
 */
export function CityWindow(): ReactNode {
  const [time, setTime] = useState(new Date());
  const [debugHour, setDebugHour] = useState(0);
  const [fastTimeToggle, setFastTimeToggle] = useState(false);
  const debugMode = useGameStore(selectDebugMode);
  const sessionId = useGameStore(selectSessionId);

  // Stable seed derived from sessionId (or daily date for simulations)
  const citySeed = useMemo(() => {
    if (isRealSession(sessionId)) {
      return hashString(sessionId);
    }
    const now = new Date();
    return hashString(
      `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`,
    );
  }, [sessionId]);

  // Toggled window lights (key: "buildingIdx-row-col")
  const [toggledWindows, setToggledWindows] = useState<Set<string>>(
    () => new Set(),
  );

  // Animated cloud x-offsets
  const [cloudOffsets, setCloudOffsets] = useState({ top: 0, bottom: 0 });

  // Refs for PixiJS masking
  const maskRef = useRef<Graphics>(null);
  const contentContainerRef = useRef<Container>(null);

  // Fast time is active only when debug mode is on AND the toggle is enabled
  const fastTimeEnabled = debugMode && fastTimeToggle;

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Keyboard shortcut: press 'T' in debug mode to toggle fast time
  useEffect(() => {
    if (!debugMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "t" || e.key === "T") {
        setFastTimeToggle((prev) => {
          if (!prev) {
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

  // Time updates: normal = every minute; fast = every 50 ms (full day in ~12 s)
  useEffect(() => {
    if (fastTimeEnabled) {
      const interval = setInterval(() => {
        setDebugHour((h) => (h + 0.1) % 24);
      }, 50);
      return () => clearInterval(interval);
    } else {
      const interval = setInterval(() => setTime(new Date()), 60000);
      return () => clearInterval(interval);
    }
  }, [fastTimeEnabled]);

  // Apply mask to content container
  useEffect(() => {
    if (maskRef.current && contentContainerRef.current) {
      contentContainerRef.current.mask = maskRef.current;
    }
  }, []);

  // Cloud drift animation (~20 FPS)
  useEffect(() => {
    const interval = setInterval(() => {
      setCloudOffsets((prev) => ({
        top: (prev.top + 0.0375) % (INNER_WIDTH + 60),
        bottom: (prev.bottom + 0.075) % (INNER_WIDTH + 60),
      }));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Randomly toggle a window light every 1–3 minutes
  useEffect(() => {
    const scheduleNextToggle = (): ReturnType<typeof setTimeout> => {
      const delay = 60000 + Math.random() * 120000;
      return setTimeout(() => {
        const buildingIdx = Math.floor(
          Math.random() * BUILDING_WINDOW_COUNTS.length,
        );
        const { rows, cols } = BUILDING_WINDOW_COUNTS[buildingIdx];
        const row = Math.floor(Math.random() * rows);
        const col = Math.floor(Math.random() * cols);
        const key = `${buildingIdx}-${row}-${col}`;

        setToggledWindows((prev) => {
          const next = new Set(prev);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });

        timeoutRef = scheduleNextToggle();
      }, delay);
    };

    let timeoutRef = scheduleNextToggle();
    return () => clearTimeout(timeoutRef);
  }, []);

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  const timeState = useMemo(() => {
    const hour = fastTimeEnabled
      ? debugHour
      : time.getHours() + time.getMinutes() / 60;
    return computeTimeState(hour, time);
  }, [time, debugHour, fastTimeEnabled]);

  // ============================================================================
  // DRAW CALLBACKS
  // ============================================================================

  const drawMask = useCallback((g: Graphics) => {
    g.clear();
    g.rect(FRAME_THICKNESS, FRAME_THICKNESS, INNER_WIDTH, INNER_HEIGHT);
    g.fill(0xffffff);
  }, []);

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

  const drawContent = useCallback(
    (g: Graphics) => {
      g.clear();

      const skyX = FRAME_THICKNESS;
      const skyY = FRAME_THICKNESS;
      const { phase, progress } = timeState;
      const bounds = {
        skyX,
        skyY,
        innerWidth: INNER_WIDTH,
        innerHeight: INNER_HEIGHT,
      };

      // Sky gradient
      const skyColors = getInterpolatedSkyColors(phase, progress);
      drawSkyGradient(g, bounds, skyColors);

      // Celestial bodies
      drawStars(g, bounds, timeState, time, skyColors);
      drawMoon(g, bounds, timeState, time, skyColors);
      drawSunAndClouds(g, bounds, timeState, time, skyColors, cloudOffsets);

      // Buildings
      drawBuildings(
        g,
        DEFAULT_BUILDINGS,
        timeState,
        skyX,
        skyY,
        INNER_HEIGHT,
        FRAME_THICKNESS,
        citySeed,
        toggledWindows,
      );

      // Window pane dividers (cross pattern)
      drawWindowDividers(g, bounds);

      // Seasonal times are used inside drawStars/drawMoon/drawSunAndClouds;
      // we also need them for the drawContent dependency array.
      void getSeasonalTimes(time);
    },
    [timeState, time, toggledWindows, citySeed, cloudOffsets],
  );

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <pixiContainer>
      {/* Mask clips content to window interior */}
      <pixiGraphics ref={maskRef} draw={drawMask} />
      {/* Content container with mask applied */}
      <pixiContainer ref={contentContainerRef}>
        <pixiGraphics draw={drawContent} />
      </pixiContainer>
      {/* Frame drawn on top (not masked) */}
      <pixiGraphics draw={drawFrame} />
    </pixiContainer>
  );
}
