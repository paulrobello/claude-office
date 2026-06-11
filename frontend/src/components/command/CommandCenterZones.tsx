"use client";

import { useCallback, type ReactNode } from "react";
import { Graphics } from "pixi.js";
import { useTranslation } from "@/hooks/useTranslation";
import { ZONES, MAX_SLOTS, type ZoneDef, type ZoneKey } from "./layout";

const BAND_INSET = 8;
const HEADER_H = 36;

interface ZoneColumnProps {
  zone: ZoneDef;
  count: number;
  overflow: number;
}

function ZoneColumn({ zone, count, overflow }: ZoneColumnProps): ReactNode {
  const { t } = useTranslation();
  const x = zone.x + BAND_INSET;
  const y = zone.y + 6;
  const w = zone.w - BAND_INSET * 2;
  const h = zone.h - 16;

  const drawBand = useCallback(
    (g: Graphics) => {
      g.clear();
      // Status-tinted floor band down the column.
      g.roundRect(x, y, w, h, 10);
      g.fill({ color: zone.color, alpha: 0.06 });
      g.roundRect(x, y, w, h, 10);
      g.stroke({ color: zone.color, width: 1.5, alpha: 0.3 });
      // Header plate.
      g.roundRect(x, y, w, HEADER_H, 10);
      g.fill({ color: zone.color, alpha: 0.18 });
      g.roundRect(x + 6, y + 6, w - 12, HEADER_H - 12, 5);
      g.fill({ color: 0x1e1e1e, alpha: 0.5 });
    },
    [x, y, w, h, zone.color],
  );

  return (
    <pixiContainer>
      <pixiGraphics draw={drawBand} />
      {/* Header label (exit column omits the count — agents just leave) */}
      <pixiContainer x={x + w / 2} y={y + HEADER_H / 2} scale={0.5}>
        <pixiText
          text={
            zone.kind === "exit"
              ? `${zone.emoji}  ${t(zone.labelKey).toUpperCase()}`
              : `${zone.emoji}  ${t(zone.labelKey).toUpperCase()}  (${count})`
          }
          anchor={0.5}
          resolution={2}
          style={{
            fontFamily: "monospace",
            fontSize: 24,
            fill: zone.color,
            fontWeight: "bold",
          }}
        />
      </pixiContainer>
      {/* Overflow tag */}
      {overflow > 0 && (
        <pixiContainer x={x + w / 2} y={y + h - 16} scale={0.5}>
          <pixiText
            text={t("commandCenter.moreCount", { count: overflow })}
            anchor={{ x: 0.5, y: 1 }}
            resolution={2}
            style={{
              fontFamily: "monospace",
              fontSize: 22,
              fill: 0xcbd5e1,
              fontWeight: "bold",
            }}
          />
        </pixiContainer>
      )}
    </pixiContainer>
  );
}

interface CommandCenterZonesProps {
  counts: Record<ZoneKey, number>;
  overflow: Record<ZoneKey, number>;
}

export function CommandCenterZones({
  counts,
  overflow,
}: CommandCenterZonesProps): ReactNode {
  return (
    <pixiContainer>
      {ZONES.map((zone) => (
        <ZoneColumn
          key={zone.key}
          zone={zone}
          count={counts[zone.key] ?? 0}
          overflow={overflow[zone.key] ?? 0}
        />
      ))}
    </pixiContainer>
  );
}

export { MAX_SLOTS };
