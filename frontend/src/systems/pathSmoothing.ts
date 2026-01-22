/**
 * Path smoothing for natural-looking agent movement.
 *
 * Takes grid-aligned A* paths and produces smooth pixel paths using:
 * 1. Funnel algorithm to remove unnecessary waypoints
 * 2. Bezier curve smoothing at corners for natural curves
 */

import { Position } from "@/types";
import { getNavigationGrid, TILE_SIZE } from "./navigationGrid";

/**
 * Simplify path by removing collinear points.
 * Keeps only waypoints where direction changes.
 */
export function removeCollinearPoints(path: Position[]): Position[] {
  if (path.length <= 2) return path;

  const result: Position[] = [path[0]];

  for (let i = 1; i < path.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = path[i];
    const next = path[i + 1];

    // Calculate direction vectors
    const dir1x = curr.x - prev.x;
    const dir1y = curr.y - prev.y;
    const dir2x = next.x - curr.x;
    const dir2y = next.y - curr.y;

    // Normalize and compare directions
    const len1 = Math.sqrt(dir1x * dir1x + dir1y * dir1y);
    const len2 = Math.sqrt(dir2x * dir2x + dir2y * dir2y);

    if (len1 === 0 || len2 === 0) continue;

    const n1x = dir1x / len1;
    const n1y = dir1y / len1;
    const n2x = dir2x / len2;
    const n2y = dir2y / len2;

    // If directions are significantly different, keep the waypoint
    const dot = n1x * n2x + n1y * n2y;
    if (dot < 0.99) {
      result.push(curr);
    }
  }

  result.push(path[path.length - 1]);
  return result;
}

/**
 * Check if a straight line between two points is walkable.
 * Uses Bresenham-like line sampling.
 */
function isLineWalkable(start: Position, end: Position): boolean {
  const grid = getNavigationGrid();

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(distance / (TILE_SIZE / 2));

  if (steps === 0) return true;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = start.x + dx * t;
    const y = start.y + dy * t;
    const gridPos = grid.worldToGrid(x, y);

    if (!grid.isWalkable(gridPos.gx, gridPos.gy)) {
      return false;
    }
  }

  return true;
}

/**
 * Apply funnel algorithm to remove unnecessary waypoints.
 * Greedily tries to skip waypoints while maintaining valid path.
 */
export function applyFunnelAlgorithm(path: Position[]): Position[] {
  if (path.length <= 2) return path;

  const result: Position[] = [path[0]];
  let current = 0;

  while (current < path.length - 1) {
    // Try to skip as many waypoints as possible
    let furthest = current + 1;

    for (let i = path.length - 1; i > current + 1; i--) {
      if (isLineWalkable(path[current], path[i])) {
        furthest = i;
        break;
      }
    }

    result.push(path[furthest]);
    current = furthest;
  }

  return result;
}

/**
 * Calculate quadratic bezier point.
 */
function quadraticBezier(
  p0: Position,
  p1: Position,
  p2: Position,
  t: number,
): Position {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/**
 * Check if a single point is walkable.
 */
function isPointWalkable(point: Position): boolean {
  const grid = getNavigationGrid();
  const gridPos = grid.worldToGrid(point.x, point.y);
  return grid.isWalkable(gridPos.gx, gridPos.gy);
}

/**
 * Check if all bezier curve sample points are walkable.
 */
function isCurveWalkable(
  curveStart: Position,
  controlPoint: Position,
  curveEnd: Position,
  samples: number,
): boolean {
  for (let j = 0; j <= samples; j++) {
    const t = j / samples;
    const point = quadraticBezier(curveStart, controlPoint, curveEnd, t);
    if (!isPointWalkable(point)) {
      return false;
    }
  }
  return true;
}

/**
 * Apply bezier smoothing at corners.
 * Inserts smooth curves at waypoints where direction changes sharply.
 * Only applies smoothing if the entire curve is walkable.
 */
export function applyBezierSmoothing(
  path: Position[],
  cornerRadius: number = TILE_SIZE * 0.75,
): Position[] {
  if (path.length <= 2) return path;

  const result: Position[] = [path[0]];

  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];

    // Calculate vectors to prev and next
    const toPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
    const toNext = { x: next.x - curr.x, y: next.y - curr.y };

    // Normalize vectors
    const lenPrev = Math.sqrt(toPrev.x * toPrev.x + toPrev.y * toPrev.y);
    const lenNext = Math.sqrt(toNext.x * toNext.x + toNext.y * toNext.y);

    if (lenPrev === 0 || lenNext === 0) {
      result.push(curr);
      continue;
    }

    // Calculate angle between vectors
    const dot =
      (toPrev.x * toNext.x + toPrev.y * toNext.y) / (lenPrev * lenNext);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

    // Only smooth sharp corners (angle > 45 degrees from straight)
    if (angle < Math.PI * 0.75) {
      result.push(curr);
      continue;
    }

    // Calculate control point offset (capped to half the segment length)
    const offset = Math.min(cornerRadius, lenPrev / 2, lenNext / 2);

    // Calculate start and end points of the curve
    const curveStart = {
      x: curr.x + (toPrev.x / lenPrev) * offset,
      y: curr.y + (toPrev.y / lenPrev) * offset,
    };
    const curveEnd = {
      x: curr.x + (toNext.x / lenNext) * offset,
      y: curr.y + (toNext.y / lenNext) * offset,
    };

    // Check if all curve points are walkable before applying smoothing
    const samples = 4; // Number of intermediate points
    if (!isCurveWalkable(curveStart, curr, curveEnd, samples)) {
      // Curve would pass through obstacle, keep original waypoint
      result.push(curr);
      continue;
    }

    // Sample the bezier curve (all points verified walkable)
    for (let j = 0; j <= samples; j++) {
      const t = j / samples;
      const point = quadraticBezier(curveStart, curr, curveEnd, t);
      result.push(point);
    }
  }

  result.push(path[path.length - 1]);
  return result;
}

/**
 * Full path smoothing pipeline.
 *
 * @param path - Raw grid-aligned path from A*
 * @returns Smoothed path suitable for animation
 */
export function smoothPath(path: Position[]): Position[] {
  if (path.length <= 1) return path;

  // Step 1: Remove collinear points
  let smoothed = removeCollinearPoints(path);

  // Step 2: Apply funnel algorithm to skip unnecessary waypoints
  smoothed = applyFunnelAlgorithm(smoothed);

  // Step 3: Apply bezier smoothing at corners
  smoothed = applyBezierSmoothing(smoothed);

  // Step 4: Final cleanup - remove any duplicate adjacent points
  return removeDuplicatePoints(smoothed);
}

/**
 * Remove adjacent duplicate points.
 */
function removeDuplicatePoints(path: Position[]): Position[] {
  if (path.length <= 1) return path;

  const result: Position[] = [path[0]];
  const threshold = 0.5; // Minimum distance between points

  for (let i = 1; i < path.length; i++) {
    const prev = result[result.length - 1];
    const curr = path[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= threshold) {
      result.push(curr);
    }
  }

  return result;
}

/**
 * Calculate total path length in pixels.
 */
export function getPathLength(path: Position[]): number {
  let length = 0;

  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }

  return length;
}

/**
 * Get position along path at a given distance from start.
 */
export function getPositionAlongPath(
  path: Position[],
  distance: number,
): Position {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1) return path[0];

  let accumulated = 0;

  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (accumulated + segmentLength >= distance) {
      // Interpolate within this segment
      const remaining = distance - accumulated;
      const t = segmentLength > 0 ? remaining / segmentLength : 0;
      return {
        x: path[i - 1].x + dx * t,
        y: path[i - 1].y + dy * t,
      };
    }

    accumulated += segmentLength;
  }

  // Past end of path, return last point
  return path[path.length - 1];
}
