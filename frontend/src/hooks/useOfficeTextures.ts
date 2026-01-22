/**
 * Hook for loading all office sprite textures.
 *
 * Centralizes texture loading logic and provides a clean interface
 * for accessing loaded textures throughout the office game.
 */

import { useState, useEffect } from "react";
import { Assets, Texture } from "pixi.js";

export interface OfficeTextures {
  // Floor
  floorTile: Texture | null;
  bossRug: Texture | null;

  // Furniture
  waterCooler: Texture | null;
  coffeeMachine: Texture | null;
  plant: Texture | null;
  chair: Texture | null;
  desk: Texture | null;
  keyboard: Texture | null;
  monitor: Texture | null;
  phone: Texture | null;
  printer: Texture | null;

  // Elevator
  elevatorFrame: Texture | null;
  elevatorDoor: Texture | null;

  // Wall items
  wallOutlet: Texture | null;

  // Agent accessories
  headset: Texture | null;
  sunglasses: Texture | null;

  // Desk accessories
  coffeeMug: Texture | null;
  stapler: Texture | null;
  deskLamp: Texture | null;
  penHolder: Texture | null;
  magic8Ball: Texture | null;
  rubiksCube: Texture | null;
  rubberDuck: Texture | null;
  thermos: Texture | null;
}

interface UseOfficeTexturesResult {
  textures: OfficeTextures;
  loaded: boolean;
}

const TEXTURE_PATHS: Record<keyof OfficeTextures, string> = {
  floorTile: "/sprites/floor-tile.png",
  bossRug: "/sprites/boss-rug.png",
  waterCooler: "/sprites/watercooler.png",
  coffeeMachine: "/sprites/coffee-machine.png",
  plant: "/sprites/plant.png",
  chair: "/sprites/chair.png",
  desk: "/sprites/desk.png",
  keyboard: "/sprites/keyboard_back.png",
  monitor: "/sprites/monitor_back.png",
  phone: "/sprites/phone.png",
  printer: "/sprites/old-printer.png",
  elevatorFrame: "/sprites/elevator_frame.png",
  elevatorDoor: "/sprites/elevator_door.png",
  wallOutlet: "/sprites/wall-outlet.png",
  headset: "/sprites/headset_small.png",
  sunglasses: "/sprites/sunglasses.png",
  coffeeMug: "/sprites/coffee-mug.png",
  stapler: "/sprites/stapler.png",
  deskLamp: "/sprites/desk-lamp.png",
  penHolder: "/sprites/pen-holder.png",
  magic8Ball: "/sprites/magic-8-ball.png",
  rubiksCube: "/sprites/rubiks-cube.png",
  rubberDuck: "/sprites/rubber-duck.png",
  thermos: "/sprites/thermos.png",
};

const EMPTY_TEXTURES: OfficeTextures = {
  floorTile: null,
  bossRug: null,
  waterCooler: null,
  coffeeMachine: null,
  plant: null,
  chair: null,
  desk: null,
  keyboard: null,
  monitor: null,
  phone: null,
  printer: null,
  elevatorFrame: null,
  elevatorDoor: null,
  wallOutlet: null,
  headset: null,
  sunglasses: null,
  coffeeMug: null,
  stapler: null,
  deskLamp: null,
  penHolder: null,
  magic8Ball: null,
  rubiksCube: null,
  rubberDuck: null,
  thermos: null,
};

/**
 * Hook to load all office sprite textures.
 * Returns textures object and loaded state.
 */
export function useOfficeTextures(): UseOfficeTexturesResult {
  const [textures, setTextures] = useState<OfficeTextures>(EMPTY_TEXTURES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadTextures = async () => {
      try {
        const keys = Object.keys(TEXTURE_PATHS) as (keyof OfficeTextures)[];
        const paths = keys.map((key) => TEXTURE_PATHS[key]);

        const loadedTextures = await Promise.all(
          paths.map((path) => Assets.load(path)),
        );

        const textureMap = keys.reduce(
          (acc, key, index) => {
            acc[key] = loadedTextures[index];
            return acc;
          },
          {} as Record<keyof OfficeTextures, Texture>,
        );

        setTextures(textureMap as OfficeTextures);
        setLoaded(true);
      } catch {
        // Still mark as loaded to show fallback graphics
        setLoaded(true);
      }
    };

    loadTextures();
  }, []);

  return { textures, loaded };
}
