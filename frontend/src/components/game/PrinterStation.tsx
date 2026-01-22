/**
 * PrinterStation Component
 *
 * Renders the printer station with:
 * - Small desk as printer stand
 * - Printer on top
 * - Animated paper emerging when printing
 */

import { type ReactNode, useState, useEffect, useRef } from "react";
import { Graphics, Texture } from "pixi.js";

interface PrinterStationProps {
  /** X position of the printer station */
  x: number;
  /** Y position of the printer station */
  y: number;
  /** Whether a report is being printed */
  isPrinting: boolean;
  /** Desk texture for the printer stand */
  deskTexture: Texture | null;
  /** Printer texture */
  printerTexture: Texture | null;
}

// Paper rotation angle in radians
const PAPER_ANGLE_DEG = 24;
const PAPER_ANGLE_RAD = (PAPER_ANGLE_DEG * Math.PI) / 180;

/**
 * Hook to animate the print progress
 */
function usePrintAnimation(isPrinting: boolean): number {
  const [progress, setProgress] = useState(0);

  // Animate paper emerging when printing starts
  useEffect(() => {
    if (!isPrinting) {
      return;
    }

    const duration = 2000; // 2 seconds to print
    let startTime: number | null = null;
    let animationId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progressValue = Math.min(elapsed / duration, 1);
      // Ease out cubic for natural paper motion
      const eased = 1 - Math.pow(1 - progressValue, 3);
      setProgress(eased);

      if (progressValue < 1) {
        animationId = requestAnimationFrame(animate);
      }
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [isPrinting]);

  // Reset progress when printing stops
  useEffect(() => {
    if (!isPrinting) {
      const id = requestAnimationFrame(() => setProgress(0));
      return () => cancelAnimationFrame(id);
    }
  }, [isPrinting]);

  return progress;
}

/**
 * Draws the paper with text lines
 */
function drawPaper(g: Graphics): void {
  g.clear();
  const paperWidth = 23;
  const paperHeight = 41;

  // White paper with slight shadow
  g.rect(-paperWidth / 2, 0, paperWidth, paperHeight);
  g.fill(0xf5f5f5);
  g.stroke({ width: 1, color: 0xcccccc });

  // Fake text lines
  const lineColor = 0x666666;
  const startY = 12;
  const lineSpacing = 4;
  const margin = 3;

  for (let i = 0; i < 6; i++) {
    const lineWidth = i % 2 === 0 ? 16 : 12; // Vary line lengths
    g.rect(-paperWidth / 2 + margin, startY + i * lineSpacing, lineWidth, 1.5);
    g.fill(lineColor);
  }
}

/**
 * Draws the clipping mask for paper animation
 */
function drawMask(g: Graphics): void {
  g.clear();
  g.rect(-25, -100, 50, 75);
  g.fill(0xffffff);
}

export function PrinterStation({
  x,
  y,
  isPrinting,
  deskTexture,
  printerTexture,
}: PrinterStationProps): ReactNode {
  const printProgress = usePrintAnimation(isPrinting);
  const [mask, setMask] = useState<Graphics | null>(null);
  const maskRef = useRef<Graphics | null>(null);

  // Calculate paper position based on progress
  const paperY = -51 + Math.cos(PAPER_ANGLE_RAD) * 50 * (1 - printProgress);
  const paperX = 10 - Math.sin(PAPER_ANGLE_RAD) * 50 * (1 - printProgress);
  const paperAlpha = printProgress > 0.1 ? 1 : printProgress * 10;

  return (
    <pixiContainer x={x} y={y}>
      {/* Small desk as printer stand (60% width, full height) */}
      {deskTexture && (
        <pixiSprite
          texture={deskTexture}
          anchor={{ x: 0.5, y: 0 }}
          scale={{ x: 0.105 * 0.6, y: 0.105 }}
        />
      )}

      {/* Printer (on top of desk) */}
      {printerTexture && (
        <pixiSprite
          texture={printerTexture}
          anchor={{ x: 0.5, y: 0.8 }}
          y={15}
          scale={0.08}
        />
      )}

      {/* Clipping mask for paper emerging from printer slot */}
      <pixiGraphics
        draw={drawMask}
        ref={(g) => {
          if (g && g !== maskRef.current) {
            maskRef.current = g;
            setMask(g);
          }
        }}
        rotation={PAPER_ANGLE_RAD}
        x={-15}
        y={7}
      />

      {/* Printed paper - animates emerging from printer */}
      <pixiContainer
        y={paperY}
        x={paperX}
        rotation={PAPER_ANGLE_RAD}
        alpha={paperAlpha}
        mask={mask}
      >
        <pixiGraphics draw={drawPaper} />
        <pixiText
          text="REPORT"
          anchor={{ x: 0.5, y: 0 }}
          y={4}
          style={{
            fontFamily: "monospace",
            fontSize: 5,
            fill: 0xff0000,
            fontWeight: "bold",
          }}
        />
      </pixiContainer>
    </pixiContainer>
  );
}
