"use client";

import { Graphics, Assets, Texture } from "pixi.js";
import { useCallback, useState, useEffect, type ReactNode } from "react";

/**
 * EmployeeOfTheMonth - Wall poster showing the employee of the month
 *
 * Displays a framed poster with "Employee of the Month" header
 * and a pixel art portrait.
 */
export function EmployeeOfTheMonth(): ReactNode {
  const [photoTexture, setPhotoTexture] = useState<Texture | null>(null);

  useEffect(() => {
    Assets.load("/sprites/employee-of-month.png").then((texture) => {
      setPhotoTexture(texture as Texture);
    });
  }, []);

  const drawFrame = useCallback((g: Graphics) => {
    g.clear();

    // Shadow
    g.roundRect(5, 5, 120, 155, 4);
    g.fill({ color: 0x000000, alpha: 0.3 });

    // Main poster background - cream/off-white
    g.roundRect(0, 0, 120, 155, 4);
    g.fill(0xf5f0e6);
    g.stroke({ width: 3, color: 0x8b7355 });

    // Dark header bar for contrast
    g.rect(6, 6, 108, 28);
    g.fill(0x2a2a4a);
    g.stroke({ width: 1, color: 0x1a1a2a });

    // Photo frame area - darker background
    g.rect(15, 42, 90, 90);
    g.fill(0x1a1a1a);
    g.stroke({ width: 3, color: 0xdaa520 });

    // Name plate background
    g.rect(15, 138, 90, 12);
    g.fill(0xdaa520);

    // Decorative gold corners on frame
    const cornerSize = 8;
    // Top-left
    g.moveTo(15, 42 + cornerSize);
    g.lineTo(15, 42);
    g.lineTo(15 + cornerSize, 42);
    g.stroke({ width: 2, color: 0xffd700 });
    // Top-right
    g.moveTo(105 - cornerSize, 42);
    g.lineTo(105, 42);
    g.lineTo(105, 42 + cornerSize);
    g.stroke({ width: 2, color: 0xffd700 });
    // Bottom-left
    g.moveTo(15, 132 - cornerSize);
    g.lineTo(15, 132);
    g.lineTo(15 + cornerSize, 132);
    g.stroke({ width: 2, color: 0xffd700 });
    // Bottom-right
    g.moveTo(105 - cornerSize, 132);
    g.lineTo(105, 132);
    g.lineTo(105, 132 - cornerSize);
    g.stroke({ width: 2, color: 0xffd700 });
  }, []);

  return (
    <pixiContainer>
      <pixiGraphics draw={drawFrame} />
      {/* Header text - rendered at 2x and scaled for sharpness */}
      <pixiContainer x={60} y={14} scale={0.5}>
        <pixiText
          text="EMPLOYEE"
          anchor={0.5}
          style={{
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: 24,
            fontWeight: "bold",
            fill: "#ffd700",
            dropShadow: {
              color: "#000000",
              blur: 0,
              distance: 2,
              angle: Math.PI / 4,
            },
          }}
          resolution={2}
        />
      </pixiContainer>
      <pixiContainer x={60} y={26} scale={0.5}>
        <pixiText
          text="OF THE MONTH"
          anchor={0.5}
          style={{
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: 16,
            fontWeight: "bold",
            fill: "#ffffff",
          }}
          resolution={2}
        />
      </pixiContainer>
      {/* Photo */}
      {photoTexture && (
        <pixiSprite
          texture={photoTexture}
          x={60}
          y={87}
          anchor={0.5}
          scale={0.082}
        />
      )}
      {/* Name plate text */}
      <pixiContainer x={60} y={144} scale={0.5}>
        <pixiText
          text="PAUL R."
          anchor={0.5}
          style={{
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: 20,
            fontWeight: "bold",
            fill: "#1a1a1a",
          }}
          resolution={2}
        />
      </pixiContainer>
    </pixiContainer>
  );
}
