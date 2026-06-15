"use client";

import { useCallback, type ReactNode } from "react";
import { Graphics } from "pixi.js";
import { useTranslation } from "@/hooks/useTranslation";
import { ZONE_BY_KEY, type ZoneKey } from "./layout";
import type { CommandSummary } from "./useCommandCenterPeers";

const W = 252;
const H = 104;

interface CommandCenterBoardProps {
  counts: Record<ZoneKey, number>;
  summary: CommandSummary;
}

/**
 * A whiteboard on the top wall (like the office whiteboard) showing the COMBINED
 * stats of every session: terminal count, per-status counts, total employees
 * (subagents), and aggregate todo progress.
 */
export function CommandCenterBoard({
  counts,
  summary,
}: CommandCenterBoardProps): ReactNode {
  const { t } = useTranslation();
  const drawBoard = useCallback((g: Graphics) => {
    g.clear();
    // Frame.
    g.roundRect(-W / 2 - 5, -H / 2 - 5, W + 10, H + 10, 6);
    g.fill({ color: 0x1f2937 });
    // Whiteboard surface.
    g.roundRect(-W / 2, -H / 2, W, H, 4);
    g.fill({ color: 0xf1f5f9 });
    g.roundRect(-W / 2, -H / 2, W, H, 4);
    g.stroke({ color: 0xcbd5e1, width: 2 });
    // Marker tray.
    g.roundRect(-W / 2 + 14, H / 2 + 2, 56, 5, 2);
    g.fill({ color: 0x475569 });
  }, []);

  const todoRatio =
    summary.todoTotal > 0
      ? Math.max(0, Math.min(1, summary.todoDone / summary.todoTotal))
      : 0;
  const drawTodoBar = useCallback(
    (g: Graphics) => {
      g.clear();
      const w = 150;
      const h = 8;
      g.roundRect(0, 0, w, h, 4);
      g.fill({ color: 0xe2e8f0 });
      g.roundRect(0, 0, w, h, 4);
      g.stroke({ color: 0xcbd5e1, width: 1 });
      if (todoRatio > 0) {
        g.roundRect(0, 0, Math.max(4, w * todoRatio), h, 4);
        g.fill({ color: 0x22c55e });
      }
    },
    [todoRatio],
  );

  const left = -W / 2 + 16;

  return (
    <pixiContainer>
      <pixiGraphics draw={drawBoard} />

      {/* Title */}
      <pixiContainer x={0} y={-H / 2 + 16} scale={0.5}>
        <pixiText
          text={`\u{1F4CB} ${t("commandCenter.board.allSessions")}`}
          anchor={{ x: 0.5, y: 0.5 }}
          resolution={2}
          style={{
            fontFamily: "monospace",
            fontSize: 26,
            fill: 0x0f172a,
            fontWeight: "bold",
          }}
        />
      </pixiContainer>

      {/* Terminals + employees */}
      <pixiContainer x={left} y={-H / 2 + 38} scale={0.5}>
        <pixiText
          text={`${t("commandCenter.board.terminals")}: ${summary.terminals}    ${t("commandCenter.board.employees")}: ${summary.subagents}`}
          anchor={{ x: 0, y: 0.5 }}
          resolution={2}
          style={{ fontFamily: "monospace", fontSize: 22, fill: 0x334155 }}
        />
      </pixiContainer>

      {/* Per-status counts in zone colors */}
      <pixiContainer x={left} y={-H / 2 + 58} scale={0.5}>
        <pixiText
          text={`⚠ ${counts.needs_you ?? 0}`}
          anchor={{ x: 0, y: 0.5 }}
          resolution={2}
          style={{
            fontFamily: "monospace",
            fontSize: 22,
            fill: ZONE_BY_KEY.needs_you.color,
            fontWeight: "bold",
          }}
        />
      </pixiContainer>
      <pixiContainer x={left + 56} y={-H / 2 + 58} scale={0.5}>
        <pixiText
          text={`\u{1F7E2} ${counts.working ?? 0}`}
          anchor={{ x: 0, y: 0.5 }}
          resolution={2}
          style={{
            fontFamily: "monospace",
            fontSize: 22,
            fill: ZONE_BY_KEY.working.color,
            fontWeight: "bold",
          }}
        />
      </pixiContainer>
      <pixiContainer x={left + 112} y={-H / 2 + 58} scale={0.5}>
        <pixiText
          text={`✅ ${counts.done ?? 0}`}
          anchor={{ x: 0, y: 0.5 }}
          resolution={2}
          style={{
            fontFamily: "monospace",
            fontSize: 22,
            fill: ZONE_BY_KEY.done.color,
            fontWeight: "bold",
          }}
        />
      </pixiContainer>

      {/* Aggregate todo progress */}
      <pixiContainer x={left} y={-H / 2 + 76} scale={0.5}>
        <pixiText
          text={`${t("commandCenter.board.todos")} ${summary.todoDone}/${summary.todoTotal}`}
          anchor={{ x: 0, y: 0.5 }}
          resolution={2}
          style={{ fontFamily: "monospace", fontSize: 20, fill: 0x334155 }}
        />
      </pixiContainer>
      <pixiContainer x={left + 44} y={-H / 2 + 80}>
        <pixiGraphics draw={drawTodoBar} />
      </pixiContainer>
    </pixiContainer>
  );
}
