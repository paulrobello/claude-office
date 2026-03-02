/**
 * Time Utilities for CityWindow
 *
 * Seasonal sunrise/sunset time tables and phase calculation for the
 * day/night cycle rendered in the city window.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TimeState {
  hour: number;
  progress: number; // 0–1 progress within the current transition phase
  phase: "night" | "dawn" | "day" | "dusk";
}

// ============================================================================
// SEASONAL TIME TABLES
// ============================================================================

/**
 * Approximate sunrise/sunset times for mid-latitudes, per season.
 * Format: [dawnStart, dawnEnd, duskStart, duskEnd] (all in 24-hour decimal).
 *
 * - Dawn transition: dawnStart → dawnEnd (night → day)
 * - Dusk transition: duskStart → duskEnd (day → night)
 */
const SEASONAL_TIMES: Record<string, [number, number, number, number]> = {
  // Winter (Dec–Feb): Late sunrise, early sunset
  winter: [6.5, 8, 16.5, 18.5], // 6:30 am–8 am dawn, 4:30 pm–6:30 pm dusk
  // Spring (Mar–May): Intermediate
  spring: [5.5, 7, 18, 20.5], // 5:30 am–7 am dawn, 6 pm–8:30 pm dusk
  // Summer (Jun–Aug): Early sunrise, late sunset
  summer: [4.5, 6, 19.5, 21.5], // 4:30 am–6 am dawn, 7:30 pm–9:30 pm dusk
  // Fall (Sep–Nov): Intermediate
  fall: [6, 7.5, 17.5, 19.5], // 6 am–7:30 am dawn, 5:30 pm–7:30 pm dusk
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Return the season name for a given month (0 = Jan, 11 = Dec).
 */
export function getSeason(month: number): string {
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter"; // Nov, Dec, Jan, Feb
}

/**
 * Return the [dawnStart, dawnEnd, duskStart, duskEnd] tuple for the given date.
 */
export function getSeasonalTimes(date: Date): [number, number, number, number] {
  const season = getSeason(date.getMonth());
  return SEASONAL_TIMES[season];
}

// ============================================================================
// PHASE CALCULATION
// ============================================================================

/**
 * Derive the current {@link TimeState} from an hour value and the active date
 * (used for seasonal time lookup).
 *
 * @param hour - Decimal hour (e.g. 14.5 = 2:30 pm)
 * @param date - Calendar date used for season determination
 */
export function computeTimeState(hour: number, date: Date): TimeState {
  const [dawnStart, dawnEnd, duskStart, duskEnd] = getSeasonalTimes(date);

  if (hour >= duskEnd || hour < dawnStart) {
    return { hour, progress: 0, phase: "night" };
  }

  if (hour >= dawnStart && hour < dawnEnd) {
    const progress = (hour - dawnStart) / (dawnEnd - dawnStart);
    return { hour, progress, phase: "dawn" };
  }

  if (hour >= dawnEnd && hour < duskStart) {
    return { hour, progress: 0, phase: "day" };
  }

  // Dusk transition
  const progress = (hour - duskStart) / (duskEnd - duskStart);
  return { hour, progress, phase: "dusk" };
}

// ============================================================================
// HASH UTILITIES (for deterministic window lighting)
// ============================================================================

/**
 * Hash a string to a non-negative 32-bit integer for seeding.
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Mix four integers into a pseudo-random value in [0, 99].
 * Uses bit-mixing to avoid diagonal stripe artefacts.
 */
export function mixHash(a: number, b: number, c: number, d: number): number {
  let h = a;
  h = ((h ^ b) * 2654435761) >>> 0;
  h = ((h ^ c) * 2654435761) >>> 0;
  h = ((h ^ d) * 2654435761) >>> 0;
  h = h ^ (h >>> 16);
  h = (h * 2246822507) >>> 0;
  h = h ^ (h >>> 13);
  return h % 100;
}
