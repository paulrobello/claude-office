/**
 * DeskGrid Components
 *
 * Renders the desk grid with:
 * - Desk surfaces and keyboards (DeskSurfacesBase - behind agent arms)
 * - Monitors and desk accessories (DeskSurfacesTop - in front of agent arms)
 * - Task marquees on occupied desks
 */

import { type ReactNode, useMemo } from "react";
import { Texture } from "pixi.js";
import { DeskMarquee } from "./DeskMarquee";

// ============================================================================
// TYPES
// ============================================================================

export interface DeskPosition {
  x: number;
  y: number;
  isEmpty: boolean;
}

type DeskItem =
  | "mug"
  | "stapler"
  | "lamp"
  | "penholder"
  | "8ball"
  | "rubiks"
  | "duck"
  | "thermos"
  | "none";

// ============================================================================
// CONSTANTS
// ============================================================================

// Desk grid layout
const ROW_SIZE = 4;
const DESK_START_X = 256;
const DESK_START_Y = 408;
const DESK_SPACING_X = 256;
const DESK_SPACING_Y = 192;

// Different colors for desk accessories (tinted onto grayscale sprites)
const ACCESSORY_TINTS = [
  0xffffff, // White (no tint) - desk 0
  0x87ceeb, // Sky blue - desk 1
  0x98fb98, // Pale green - desk 2
  0xffb6c1, // Light pink - desk 3
  0xffd700, // Gold - desk 4
  0xdda0dd, // Plum - desk 5
  0xf0e68c, // Khaki - desk 6
  0xadd8e6, // Light blue - desk 7
];

// Deterministic "random" desk items - precomputed shuffled sequence
// Avoids row patterns while ensuring good variety
const DESK_ITEM_SEQUENCE: DeskItem[] = [
  "lamp",
  "mug",
  "8ball",
  "stapler",
  "penholder",
  "thermos",
  "rubiks",
  "duck",
  "lamp",
  "none",
  "none",
  "lamp",
  "stapler",
  "penholder",
  "mug",
  "mug",
  "8ball",
  "thermos",
  "rubiks",
  "duck",
];

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to compute desk positions based on desk count and occupancy.
 */
export function useDeskPositions(
  deskCount: number,
  occupiedDesks: Set<number>,
): DeskPosition[] {
  return useMemo(() => {
    const result: DeskPosition[] = [];

    for (let i = 0; i < deskCount; i++) {
      const row = Math.floor(i / ROW_SIZE);
      const col = i % ROW_SIZE;
      // Grid-aligned positions: X at multiples of 32 (256, 512, 768, 1024)
      // Y spacing of 192 (6×32) ensures desk centers align to grid
      const x = DESK_START_X + col * DESK_SPACING_X;
      const y = DESK_START_Y + row * DESK_SPACING_Y;
      const deskNum = i + 1;
      const isEmpty = !occupiedDesks.has(deskNum);

      result.push({ x, y, isEmpty });
    }

    return result;
  }, [deskCount, occupiedDesks]);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDeskItem(index: number): DeskItem {
  return DESK_ITEM_SEQUENCE[index % DESK_ITEM_SEQUENCE.length];
}

// ============================================================================
// COMPONENTS
// ============================================================================

interface DeskSurfacesBaseProps {
  deskCount: number;
  occupiedDesks: Set<number>;
  deskTexture: Texture | null;
  keyboardTexture: Texture | null;
}

/**
 * Renders desk surfaces and keyboards (behind agent arms).
 */
export function DeskSurfacesBase({
  deskCount,
  occupiedDesks,
  deskTexture,
  keyboardTexture,
}: DeskSurfacesBaseProps): ReactNode {
  const desks = useDeskPositions(deskCount, occupiedDesks);

  return (
    <>
      {desks.map((desk, i) => (
        <pixiContainer key={i} x={desk.x} y={desk.y}>
          {/* Desk surface */}
          {deskTexture && (
            <pixiSprite
              texture={deskTexture}
              anchor={{ x: 0.5, y: 0 }}
              y={30}
              scale={0.105}
            />
          )}
          {/* Keyboard - front of desk surface (near chair, agent types here) */}
          {keyboardTexture && (
            <pixiSprite
              texture={keyboardTexture}
              anchor={0.5}
              x={0}
              y={42}
              scale={0.04}
            />
          )}
        </pixiContainer>
      ))}
    </>
  );
}

interface DeskSurfacesTopProps {
  deskCount: number;
  occupiedDesks: Set<number>;
  deskTasks: Map<number, string>;
  monitorTexture: Texture | null;
  coffeeMugTexture: Texture | null;
  staplerTexture: Texture | null;
  deskLampTexture: Texture | null;
  penHolderTexture: Texture | null;
  magic8BallTexture: Texture | null;
  rubiksCubeTexture: Texture | null;
  rubberDuckTexture: Texture | null;
  thermosTexture: Texture | null;
}

/**
 * Renders monitors and desk decorations (in front of agent arms).
 */
export function DeskSurfacesTop({
  deskCount,
  occupiedDesks,
  deskTasks,
  monitorTexture,
  coffeeMugTexture,
  staplerTexture,
  deskLampTexture,
  penHolderTexture,
  magic8BallTexture,
  rubiksCubeTexture,
  rubberDuckTexture,
  thermosTexture,
}: DeskSurfacesTopProps): ReactNode {
  const desks = useDeskPositions(deskCount, occupiedDesks);

  return (
    <>
      {desks.map((desk, i) => (
        <pixiContainer key={i} x={desk.x} y={desk.y}>
          {/* Monitor - back of desk surface (far from chair) */}
          {monitorTexture && (
            <pixiSprite
              texture={monitorTexture}
              anchor={0.5}
              x={-45}
              y={27}
              scale={0.08}
            />
          )}
          {/* Desk accessory - right corner, cycles through items */}
          {getDeskItem(i) === "mug" && coffeeMugTexture && (
            <pixiSprite
              texture={coffeeMugTexture}
              anchor={0.5}
              x={50}
              y={40}
              scale={0.025}
              tint={ACCESSORY_TINTS[i % ACCESSORY_TINTS.length]}
            />
          )}
          {getDeskItem(i) === "stapler" && staplerTexture && (
            <pixiSprite
              texture={staplerTexture}
              anchor={0.5}
              x={50}
              y={43}
              scale={0.19}
            />
          )}
          {getDeskItem(i) === "lamp" && deskLampTexture && (
            <pixiSprite
              texture={deskLampTexture}
              anchor={0.5}
              x={50}
              y={29}
              scale={0.35}
            />
          )}
          {getDeskItem(i) === "penholder" && penHolderTexture && (
            <pixiSprite
              texture={penHolderTexture}
              anchor={0.5}
              x={54}
              y={38}
              scale={0.22}
            />
          )}
          {getDeskItem(i) === "8ball" && magic8BallTexture && (
            <pixiSprite
              texture={magic8BallTexture}
              anchor={0.5}
              x={54}
              y={42}
              scale={0.162}
            />
          )}
          {getDeskItem(i) === "rubiks" && rubiksCubeTexture && (
            <pixiSprite
              texture={rubiksCubeTexture}
              anchor={0.5}
              x={52}
              y={42}
              scale={0.16}
            />
          )}
          {getDeskItem(i) === "duck" && rubberDuckTexture && (
            <pixiSprite
              texture={rubberDuckTexture}
              anchor={0.5}
              x={52}
              y={42}
              scale={0.16}
            />
          )}
          {getDeskItem(i) === "thermos" && thermosTexture && (
            <pixiSprite
              texture={thermosTexture}
              anchor={0.5}
              x={52}
              y={40}
              scale={0.36}
            />
          )}
          {/* Task marquee on desk surface - only for occupied desks */}
          <DeskMarquee text={deskTasks.get(i + 1) ?? ""} />
        </pixiContainer>
      ))}
    </>
  );
}
