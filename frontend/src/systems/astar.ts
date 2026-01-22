/**
 * A* pathfinding algorithm implementation.
 *
 * Uses a binary heap priority queue for efficient node selection.
 * Supports 8-directional movement with proper diagonal costs.
 */

import { Position } from "@/types";
import {
  NavigationGrid,
  GridPosition,
  TILE_SIZE,
  getNavigationGrid,
} from "./navigationGrid";

// Diagonal movement cost (sqrt(2))
const DIAGONAL_COST = Math.SQRT2;

/**
 * A* node for pathfinding.
 */
interface AStarNode {
  gx: number;
  gy: number;
  g: number; // Cost from start
  h: number; // Heuristic to goal
  f: number; // Total cost (g + h)
  parent: AStarNode | null;
}

/**
 * Binary heap priority queue for A* open list.
 */
class PriorityQueue {
  private heap: AStarNode[] = [];

  get length(): number {
    return this.heap.length;
  }

  push(node: AStarNode): void {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): AStarNode | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const result = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);
    return result;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].f <= this.heap[index].f) break;
      [this.heap[parentIndex], this.heap[index]] = [
        this.heap[index],
        this.heap[parentIndex],
      ];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < length &&
        this.heap[leftChild].f < this.heap[smallest].f
      ) {
        smallest = leftChild;
      }
      if (
        rightChild < length &&
        this.heap[rightChild].f < this.heap[smallest].f
      ) {
        smallest = rightChild;
      }

      if (smallest === index) break;

      [this.heap[smallest], this.heap[index]] = [
        this.heap[index],
        this.heap[smallest],
      ];
      index = smallest;
    }
  }
}

/**
 * Calculate octile distance heuristic (allows diagonal movement).
 */
function heuristic(gx1: number, gy1: number, gx2: number, gy2: number): number {
  const dx = Math.abs(gx1 - gx2);
  const dy = Math.abs(gy1 - gy2);
  // Octile distance: cost of diagonal moves + remaining cardinal moves
  return Math.min(dx, dy) * DIAGONAL_COST + Math.abs(dx - dy);
}

/**
 * Get movement cost between adjacent tiles.
 */
function movementCost(dx: number, dy: number): number {
  return dx !== 0 && dy !== 0 ? DIAGONAL_COST : 1.0;
}

/**
 * Find path using A* algorithm.
 *
 * @param start - Start position in world coordinates
 * @param end - End position in world coordinates
 * @param ignoreAgentId - Optional agent ID to ignore as obstacle (self)
 * @returns Array of grid positions forming the path, or empty array if no path
 */
export function findPath(
  start: Position,
  end: Position,
  ignoreAgentId?: string,
): GridPosition[] {
  const grid = getNavigationGrid();

  const startGrid = grid.worldToGrid(start.x, start.y);
  const endGrid = grid.worldToGrid(end.x, end.y);

  // Quick check: if start or end is not walkable, return empty path
  if (!grid.isWalkable(startGrid.gx, startGrid.gy, ignoreAgentId)) {
    // Try to find nearest walkable tile to start
    const nearStart = findNearestWalkable(grid, startGrid, ignoreAgentId);
    if (!nearStart) return [];
    startGrid.gx = nearStart.gx;
    startGrid.gy = nearStart.gy;
  }

  if (!grid.isWalkable(endGrid.gx, endGrid.gy, ignoreAgentId)) {
    // Try to find nearest walkable tile to end
    const nearEnd = findNearestWalkable(grid, endGrid, ignoreAgentId);
    if (!nearEnd) return [];
    endGrid.gx = nearEnd.gx;
    endGrid.gy = nearEnd.gy;
  }

  // Already at destination
  if (startGrid.gx === endGrid.gx && startGrid.gy === endGrid.gy) {
    return [startGrid];
  }

  const openList = new PriorityQueue();
  const closedSet = new Set<string>();
  const nodeMap = new Map<string, AStarNode>();

  const startNode: AStarNode = {
    gx: startGrid.gx,
    gy: startGrid.gy,
    g: 0,
    h: heuristic(startGrid.gx, startGrid.gy, endGrid.gx, endGrid.gy),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;

  openList.push(startNode);
  nodeMap.set(`${startGrid.gx},${startGrid.gy}`, startNode);

  let iterations = 0;
  const maxIterations = TILE_SIZE * TILE_SIZE * 4; // Safety limit

  while (openList.length > 0 && iterations < maxIterations) {
    iterations++;

    const current = openList.pop()!;
    const currentKey = `${current.gx},${current.gy}`;

    // Goal reached
    if (current.gx === endGrid.gx && current.gy === endGrid.gy) {
      return reconstructPath(current);
    }

    closedSet.add(currentKey);

    // Explore neighbors
    const neighbors = grid.getNeighbors(current.gx, current.gy);

    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.gx},${neighbor.gy}`;

      if (closedSet.has(neighborKey)) continue;
      if (!grid.isWalkable(neighbor.gx, neighbor.gy, ignoreAgentId)) continue;

      const dx = neighbor.gx - current.gx;
      const dy = neighbor.gy - current.gy;
      const cost = grid.getCost(neighbor.gx, neighbor.gy, ignoreAgentId);
      const tentativeG = current.g + movementCost(dx, dy) * cost;

      let neighborNode = nodeMap.get(neighborKey);

      if (!neighborNode) {
        neighborNode = {
          gx: neighbor.gx,
          gy: neighbor.gy,
          g: Infinity,
          h: heuristic(neighbor.gx, neighbor.gy, endGrid.gx, endGrid.gy),
          f: Infinity,
          parent: null,
        };
        nodeMap.set(neighborKey, neighborNode);
      }

      if (tentativeG < neighborNode.g) {
        neighborNode.parent = current;
        neighborNode.g = tentativeG;
        neighborNode.f = neighborNode.g + neighborNode.h;
        openList.push(neighborNode);
      }
    }
  }

  // No path found
  return [];
}

/**
 * Find the nearest walkable tile to a position.
 */
function findNearestWalkable(
  grid: NavigationGrid,
  pos: GridPosition,
  ignoreAgentId?: string,
): GridPosition | null {
  // Spiral search outward
  const maxRadius = 5;

  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;

        const gx = pos.gx + dx;
        const gy = pos.gy + dy;

        if (grid.isWalkable(gx, gy, ignoreAgentId)) {
          return { gx, gy };
        }
      }
    }
  }

  return null;
}

/**
 * Reconstruct path from goal node back to start.
 */
function reconstructPath(goalNode: AStarNode): GridPosition[] {
  const path: GridPosition[] = [];
  let current: AStarNode | null = goalNode;

  while (current) {
    path.unshift({ gx: current.gx, gy: current.gy });
    current = current.parent;
  }

  return path;
}

/**
 * Convert grid path to world coordinates (pixel positions).
 */
export function gridPathToWorld(gridPath: GridPosition[]): Position[] {
  const grid = getNavigationGrid();
  return gridPath.map((gp) => grid.gridToWorld(gp.gx, gp.gy));
}

/**
 * High-level pathfinding function that returns world coordinates.
 *
 * @param start - Start position in world coordinates
 * @param end - End position in world coordinates
 * @param ignoreAgentId - Optional agent ID to ignore as obstacle
 * @returns Array of world positions forming the path
 */
export function findWorldPath(
  start: Position,
  end: Position,
  ignoreAgentId?: string,
): Position[] {
  const gridPath = findPath(start, end, ignoreAgentId);

  if (gridPath.length === 0) {
    // No valid path found - log warning and return empty
    // DO NOT return direct path as it may go through obstacles
    console.warn(
      `[A*] No valid path from (${start.x.toFixed(0)},${start.y.toFixed(0)}) to (${end.x.toFixed(0)},${end.y.toFixed(0)})`,
    );
    return [];
  }

  return gridPathToWorld(gridPath);
}
