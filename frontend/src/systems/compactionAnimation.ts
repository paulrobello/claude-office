/**
 * Compaction Animation System
 *
 * Handles the animation sequence when context compaction occurs:
 * 1. Boss gets up from desk
 * 2. Boss walks to trash can
 * 3. Boss jumps on trash can 36 times (~40 seconds total)
 * 4. Each jump reduces context percentage until it reaches 0
 * 5. Boss walks back to desk
 */

import { useEffect, useState, useRef, useMemo } from "react";
import {
  useGameStore,
  selectCompactionPhase,
  selectBoss,
  selectContextUtilization,
  type CompactionAnimationPhase,
} from "@/stores/gameStore";
import type { Position } from "@/types";
import { agentMachineService } from "@/machines/agentMachineService";
import { TRASH_CAN_OFFSET } from "@/constants/positions";

// ============================================================================
// CONSTANTS
// ============================================================================

// Animation timing (in milliseconds)
const WALK_DURATION = 800; // Time to walk to/from trash can
const JUMP_COUNT = 36; // Number of jumps (~40 seconds total)
const JUMP_CYCLE_DURATION = 1000; // 1 second per jump cycle
const TOTAL_JUMP_DURATION = JUMP_COUNT * JUMP_CYCLE_DURATION; // 36 seconds total

// Single jump timing within each 1 second cycle
const JUMP_UP_DURATION = 300; // Time to jump up
const JUMP_PEAK_DURATION = 100; // Time at peak (stomp moment)
const JUMP_DOWN_DURATION = 300; // Time to land
// Remaining 300ms is pause before next jump

// Jump heights
const JUMP_HEIGHT = 60; // How high boss jumps
const STOMP_HEIGHT = 40; // Height at stomp point

// Position offsets during jump (0 = centered on trash can)
const JUMP_X_OFFSET = 0;

// ============================================================================
// TYPES
// ============================================================================

export interface CompactionAnimationState {
  /** Animated boss position (null if not animating) */
  bossPosition: Position | null;
  /** Current vertical offset for jump animation */
  jumpOffset: number;
  /** Current animation phase */
  phase: CompactionAnimationPhase;
  /** True when boss is at peak of jump (triggers trash squish) */
  isStomping: boolean;
  /** Scale factor for boss during jump (1.0 = normal, smaller when jumping up) */
  bossScale: number;
  /** Current jump number (1-26) during jumping phase */
  currentJump: number;
  /** Animated context utilization (decreases with each stomp) */
  animatedContextUtilization: number;
}

// ============================================================================
// ANIMATION CALCULATIONS
// ============================================================================

/**
 * Easing function for smooth animation (ease-in-out quad)
 */
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Easing function for jump (ease-out for going up)
 */
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/**
 * Easing function for landing (ease-in)
 */
function easeInQuad(t: number): number {
  return t * t;
}

/**
 * Calculate position along a path between two points
 */
function lerpPosition(
  start: Position,
  end: Position,
  progress: number,
): Position {
  const t = easeInOutQuad(progress);
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to manage compaction animation state.
 * Returns animated position and state for the boss during compaction.
 */
export function useCompactionAnimation(): CompactionAnimationState {
  const phase = useGameStore(selectCompactionPhase);
  const boss = useGameStore(selectBoss);
  const contextUtilization = useGameStore(selectContextUtilization);
  const setCompactionPhase = useGameStore((s) => s.setCompactionPhase);
  const setContextUtilization = useGameStore((s) => s.setContextUtilization);

  // Animation state
  const [animatedPosition, setAnimatedPosition] = useState<Position | null>(
    null,
  );
  const [jumpOffset, setJumpOffset] = useState(0);
  const [isStomping, setIsStomping] = useState(false);
  const [bossScale, setBossScale] = useState(1.0);
  const [currentJump, setCurrentJump] = useState(0);
  const [animatedContextUtilization, setAnimatedContextUtilization] =
    useState(contextUtilization);

  // Animation timing refs
  const animationStartRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const initialContextRef = useRef<number>(0);
  const lastStompJumpRef = useRef<number>(0);

  // Calculate target positions (memoized to prevent unnecessary recalculations)
  const bossDesk = boss.position;
  const trashCanPosition = useMemo<Position>(
    () => ({
      x: bossDesk.x + TRASH_CAN_OFFSET.x,
      y: bossDesk.y + TRASH_CAN_OFFSET.y - 30, // Stand above trash can
    }),
    [bossDesk.x, bossDesk.y],
  );

  // Store tick function in a ref to avoid circular dependency
  const tickRef = useRef<() => void>(() => {});

  // Tick function wrapped in useEffect to avoid updating ref during render
  useEffect(() => {
    tickRef.current = () => {
      const now = performance.now();
      const elapsed = now - animationStartRef.current;

      if (phase === "walking_to_trash") {
        const progress = Math.min(elapsed / WALK_DURATION, 1);
        setAnimatedPosition(lerpPosition(bossDesk, trashCanPosition, progress));

        if (progress >= 1) {
          // Transition to jumping
          animationStartRef.current = now;
          initialContextRef.current = contextUtilization;
          lastStompJumpRef.current = 0;
          setCurrentJump(1);
          setCompactionPhase("jumping");
        }
      } else if (phase === "jumping") {
        const overallProgress = Math.min(elapsed / TOTAL_JUMP_DURATION, 1);

        // Determine which jump we're on (1-5)
        const jumpIndex = Math.min(
          Math.floor(elapsed / JUMP_CYCLE_DURATION),
          JUMP_COUNT - 1,
        );
        const jumpNumber = jumpIndex + 1;
        setCurrentJump(jumpNumber);

        // Time within current jump cycle
        const cycleElapsed = elapsed % JUMP_CYCLE_DURATION;

        // Calculate jump phase within the cycle
        if (cycleElapsed < JUMP_UP_DURATION) {
          // Going up
          const upProgress = cycleElapsed / JUMP_UP_DURATION;
          const height = JUMP_HEIGHT * easeOutQuad(upProgress);
          setJumpOffset(-height);
          setBossScale(1.0 - upProgress * 0.1);
          setIsStomping(false);
        } else if (cycleElapsed < JUMP_UP_DURATION + JUMP_PEAK_DURATION) {
          // At peak (context reduction happens here, but squish is on landing)
          setJumpOffset(-STOMP_HEIGHT);
          setBossScale(0.9);
          setIsStomping(false); // No squish at peak - wait for landing

          // Reduce context utilization on each new stomp
          if (jumpNumber > lastStompJumpRef.current) {
            lastStompJumpRef.current = jumpNumber;
            // Calculate new context based on how many jumps completed
            // After all jumps complete, context should be 0
            const reduction = initialContextRef.current / JUMP_COUNT;
            const newContext = Math.max(
              0,
              initialContextRef.current - reduction * jumpNumber,
            );
            setAnimatedContextUtilization(newContext);
          }
        } else if (
          cycleElapsed <
          JUMP_UP_DURATION + JUMP_PEAK_DURATION + JUMP_DOWN_DURATION
        ) {
          // Coming down / landing
          const landProgress =
            (cycleElapsed - JUMP_UP_DURATION - JUMP_PEAK_DURATION) /
            JUMP_DOWN_DURATION;
          const height = STOMP_HEIGHT * (1 - easeInQuad(landProgress));
          setJumpOffset(-height);
          setBossScale(0.9 + landProgress * 0.1);
          // Squish during last 40% of descent (as Claude lands on can)
          setIsStomping(landProgress > 0.6);
        } else {
          // Pause between jumps (on ground) - keep squish briefly then release
          const pauseStart =
            JUMP_UP_DURATION + JUMP_PEAK_DURATION + JUMP_DOWN_DURATION;
          const pauseDuration = JUMP_CYCLE_DURATION - pauseStart;
          const pauseProgress = (cycleElapsed - pauseStart) / pauseDuration;
          setJumpOffset(0);
          setBossScale(1.0);
          // Stay squished for first 40% of pause (impact moment)
          setIsStomping(pauseProgress < 0.4);
        }

        // Keep position at trash can during jump
        setAnimatedPosition({
          x: trashCanPosition.x + JUMP_X_OFFSET,
          y: trashCanPosition.y,
        });

        if (overallProgress >= 1) {
          // All jumps complete - transition to walking back
          animationStartRef.current = now;
          setJumpOffset(0);
          setBossScale(1.0);
          setIsStomping(false);
          setCurrentJump(0);
          // Set context to 0 after all jumps
          setContextUtilization(0);
          setAnimatedContextUtilization(0);
          setCompactionPhase("walking_back");
        }
      } else if (phase === "walking_back") {
        const progress = Math.min(elapsed / WALK_DURATION, 1);
        setAnimatedPosition(lerpPosition(trashCanPosition, bossDesk, progress));

        if (progress >= 1) {
          // Animation complete - return to idle
          setAnimatedPosition(null);
          setCompactionPhase("idle");
          // Reset isCompacting flag
          useGameStore.getState().setIsCompacting(false);
          // Process any queued boss bubbles that accumulated during compaction
          const store = useGameStore.getState();
          console.log(
            `[Compaction] ENDED - hasContent=${!!store.boss.bubble.content}, queueLen=${store.boss.bubble.queue.length}`,
          );
          if (
            !store.boss.bubble.content &&
            store.boss.bubble.queue.length > 0
          ) {
            console.log(`[Compaction] Advancing queued boss bubble`);
            store.advanceBubble("boss");
          }
          // Notify waiting agents that boss is available again
          setTimeout(() => agentMachineService.notifyBossAvailable(), 100);
        }
      }

      // Continue animation loop
      if (phase !== "idle") {
        rafIdRef.current = requestAnimationFrame(tickRef.current);
      }
    };
  }, [
    phase,
    bossDesk,
    trashCanPosition,
    setCompactionPhase,
    contextUtilization,
    setContextUtilization,
  ]);

  // Start/stop animation based on phase changes
  useEffect(() => {
    if (phase === "idle") {
      // Reset state when idle - use RAF to avoid synchronous setState warning
      requestAnimationFrame(() => {
        setAnimatedPosition(null);
        setJumpOffset(0);
        setIsStomping(false);
        setBossScale(1.0);
        setCurrentJump(0);
      });
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    // Start animation if transitioning from idle
    if (phase === "walking_to_trash" && animatedPosition === null) {
      animationStartRef.current = performance.now();
      // Use RAF to avoid synchronous setState warning
      requestAnimationFrame(() => {
        setAnimatedPosition(bossDesk);
        setAnimatedContextUtilization(contextUtilization);
      });
    }

    // Start the animation loop using the ref
    rafIdRef.current = requestAnimationFrame(tickRef.current);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [phase, bossDesk, animatedPosition, contextUtilization]);

  return {
    bossPosition: animatedPosition,
    jumpOffset,
    phase,
    isStomping,
    bossScale,
    currentJump,
    animatedContextUtilization,
  };
}
