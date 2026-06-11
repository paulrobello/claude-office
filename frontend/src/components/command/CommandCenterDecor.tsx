"use client";

import { type ReactNode } from "react";
import type { OfficeTextures } from "@/hooks/useOfficeTextures";
import { CANVAS_WIDTH } from "@/constants/canvas";
import { TOP_WALL_H, FLOOR_DECOR_Y } from "./layout";

interface CommandCenterDecorProps {
  textures: OfficeTextures;
}

/**
 * Open-plan decor using the existing office sprites: framed posters on the top
 * wall, and a row of furniture (plants, printer, water cooler, coffee machine)
 * along the bottom of the floor — placed in the empty band below the desks.
 */
export function CommandCenterDecor({
  textures: t,
}: CommandCenterDecorProps): ReactNode {
  const wallY = TOP_WALL_H / 2 - 6;
  const floorY = FLOOR_DECOR_Y + 40;

  return (
    <pixiContainer>
      {/* ---- Top wall: posters at the edges (board + clock fill the centre) ---- */}
      {t.employeeOfMonth && (
        <>
          <pixiSprite
            texture={t.employeeOfMonth}
            anchor={0.5}
            x={96}
            y={wallY}
            scale={0.1}
          />
          <pixiSprite
            texture={t.employeeOfMonth}
            anchor={0.5}
            x={CANVAS_WIDTH - 96}
            y={wallY}
            scale={0.1}
          />
        </>
      )}
      {t.wallOutlet && (
        <pixiSprite
          texture={t.wallOutlet}
          anchor={0.5}
          x={CANVAS_WIDTH - 220}
          y={wallY + 4}
          scale={0.045}
        />
      )}

      {/* ---- Bottom floor furniture (base on the floor) ---- */}
      {t.plant && (
        <pixiSprite
          texture={t.plant}
          anchor={{ x: 0.5, y: 1 }}
          x={70}
          y={floorY}
          scale={0.11}
        />
      )}
      {t.printer && (
        <pixiSprite
          texture={t.printer}
          anchor={{ x: 0.5, y: 1 }}
          x={380}
          y={floorY + 4}
          scale={0.12}
        />
      )}
      {t.waterCooler && (
        <pixiSprite
          texture={t.waterCooler}
          anchor={{ x: 0.5, y: 1 }}
          x={720}
          y={floorY}
          scale={0.19}
        />
      )}
      {t.coffeeMachine && (
        <pixiSprite
          texture={t.coffeeMachine}
          anchor={{ x: 0.5, y: 1 }}
          x={1000}
          y={floorY + 2}
          scale={0.1}
        />
      )}
      {t.plant && (
        <pixiSprite
          texture={t.plant}
          anchor={{ x: 0.5, y: 1 }}
          x={CANVAS_WIDTH - 60}
          y={floorY}
          scale={0.11}
        />
      )}
    </pixiContainer>
  );
}
