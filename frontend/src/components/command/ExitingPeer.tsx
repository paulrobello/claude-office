"use client";

import { type ReactNode } from "react";
import type { Texture } from "pixi.js";
import { useExitStore, exitProgress } from "@/systems/exitAnimation";
import { CommandCenterPeer } from "./CommandCenterPeer";
import { ZONE_BY_KEY } from "./layout";
import type { CommandPeer } from "./useCommandCenterPeers";

// The elevator doorway sits at the top-centre of the Ended column (see
// CommandCenterFurniture ExitDoor: baseY = zone.y + 150).
const ended = ZONE_BY_KEY.ended;
const DOOR_X = ended.x + ended.w / 2;
const DOOR_BASE_Y = ended.y + 150;
const START_Y = DOOR_BASE_Y + 90; // queue spot below the door
const THRESHOLD_Y = DOOR_BASE_Y - 34; // doorway entrance
const INSIDE_Y = DOOR_BASE_Y - 78; // stepped inside

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

interface ExitingPeerProps {
  peer: CommandPeer;
  headsetTexture: Texture | null;
  sunglassesTexture: Texture | null;
  onActivate: (peer: CommandPeer, screen: { x: number; y: number }) => void;
}

/**
 * Renders an Ended agent walking to the elevator and stepping out. Subscribes
 * to the per-frame exit clock; once the walk-out completes the agent is gone.
 */
export function ExitingPeer({
  peer,
  headsetTexture,
  sunglassesTexture,
  onActivate,
}: ExitingPeerProps): ReactNode {
  const now = useExitStore((s) => s.now);
  const startTimes = useExitStore((s) => s.startTimes);

  // Only sessions that ended *while watching* are registered; others (ended
  // before the view opened) are treated as already gone.
  if (!startTimes.has(peer.sessionId)) return null;

  const p = exitProgress(peer.sessionId, now, startTimes);
  if (p >= 1) return null; // walked out — gone.

  let y: number;
  let alpha: number;
  if (p < 0.55) {
    // Walk up to the doorway.
    y = lerp(START_Y, THRESHOLD_Y, p / 0.55);
    alpha = 1;
  } else {
    // Step inside and fade.
    const t = (p - 0.55) / 0.45;
    y = lerp(THRESHOLD_Y, INSIDE_Y, t);
    alpha = 1 - t;
  }

  return (
    <CommandCenterPeer
      peer={peer}
      headsetTexture={headsetTexture}
      sunglassesTexture={sunglassesTexture}
      onActivate={onActivate}
      positionOverride={{ x: DOOR_X, y }}
      alphaOverride={alpha}
    />
  );
}
