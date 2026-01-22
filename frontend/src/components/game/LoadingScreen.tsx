/**
 * LoadingScreen Component
 *
 * Displays a loading screen while office textures are being loaded.
 * Shows animated dots and a "Loading office..." message.
 */

import { type ReactNode } from "react";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";

export function LoadingScreen(): ReactNode {
  return (
    <pixiContainer>
      {/* Dark background */}
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.fill({ color: 0x1a1a2e });
          g.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }}
      />
      {/* Loading text rendered at 2x for sharpness */}
      <pixiContainer x={CANVAS_WIDTH / 2} y={CANVAS_HEIGHT / 2} scale={0.5}>
        <pixiText
          text="Loading office..."
          anchor={0.5}
          style={{
            fontFamily: "monospace",
            fontSize: 48,
            fill: 0x4ade80,
            letterSpacing: 2,
          }}
          resolution={2}
        />
      </pixiContainer>
      {/* Animated dots */}
      <pixiContainer x={CANVAS_WIDTH / 2} y={CANVAS_HEIGHT / 2 + 40}>
        {[0, 1, 2].map((i) => (
          <pixiGraphics
            key={i}
            x={(i - 1) * 20}
            draw={(g) => {
              g.clear();
              g.fill({ color: 0x4ade80, alpha: 0.6 });
              g.circle(0, 0, 4);
            }}
          />
        ))}
      </pixiContainer>
    </pixiContainer>
  );
}
