/**
 * HMR Cleanup Utilities
 *
 * Provides cleanup functions for Hot Module Replacement to prevent
 * WebGL context leaks and stale animation loops.
 */

import { animationSystem } from "./animationSystem";
import { collisionManager } from "./agentCollision";
import { resetNavigationGrid } from "./navigationGrid";
import { agentMachineService } from "@/machines/agentMachineService";
import type { Application as PixiApplication } from "pixi.js";

// Track the current PixiJS app instance for cleanup
let currentApp: PixiApplication | null = null;

/**
 * Register the current PixiJS application for cleanup tracking.
 */
export function registerPixiApp(app: PixiApplication): void {
  currentApp = app;
}

/**
 * Perform full cleanup of all game systems.
 * Call this before HMR remount or component unmount.
 */
export function performFullCleanup(): void {
  // Stop animation system first to prevent stale updates
  animationSystem.stop();

  // Clear collision tracking
  collisionManager.clear();

  // Reset navigation grid
  resetNavigationGrid();

  // Reset agent state machines
  agentMachineService.reset();

  // Destroy PixiJS application if registered
  if (currentApp) {
    try {
      // Destroy the app and its renderer to free WebGL context
      currentApp.destroy(true, {
        children: true,
        texture: true,
        textureSource: true,
      });
    } catch {
      // Ignore cleanup errors
    }
    currentApp = null;
  }
}

/**
 * Reset game state without destroying the PixiJS app.
 * Use this for soft resets (e.g., session change).
 */
export function performSoftReset(): void {
  animationSystem.stop();
  collisionManager.clear();
  resetNavigationGrid();
  agentMachineService.reset();
}

// Track HMR version for forcing component remounts
let hmrVersion = 0;

/**
 * Get current HMR version. Use as React key to force remount.
 */
export function getHmrVersion(): number {
  return hmrVersion;
}

/**
 * Increment HMR version (called on module reload).
 */
export function incrementHmrVersion(): void {
  hmrVersion++;
}

// Auto-increment version on module load in development
if (process.env.NODE_ENV === "development") {
  incrementHmrVersion();
}
