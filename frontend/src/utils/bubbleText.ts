/**
 * Shared bubble text utilities for speech/thought bubbles.
 *
 * Truncates text that exceeds the max character limit, appending "..."
 * to indicate truncation. Used by both AgentSprite and BossSprite bubbles.
 */

/** Maximum characters shown in a bubble before truncation. */
const BUBBLE_MAX_CHARS = 60;

/**
 * Truncate bubble text to a maximum character length.
 * Text at or below the limit is returned unchanged.
 *
 * @param text - The bubble text to potentially truncate.
 * @param maxLen - Maximum character count (default 60).
 * @returns Truncated text with "..." suffix if over limit, otherwise original.
 */
export function truncateBubbleText(
  text: string,
  maxLen: number = BUBBLE_MAX_CHARS,
): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
