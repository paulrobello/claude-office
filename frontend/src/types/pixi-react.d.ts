import { Container, Text, Graphics, Sprite } from "pixi.js";
import { type PixiReactElementProps } from "@pixi/react";

declare module "@pixi/react" {
  interface PixiElements {
    pixiContainer: PixiReactElementProps<typeof Container>;
    pixiText: PixiReactElementProps<typeof Text>;
    pixiGraphics: PixiReactElementProps<typeof Graphics>;
    pixiSprite: PixiReactElementProps<typeof Sprite>;
  }
}
