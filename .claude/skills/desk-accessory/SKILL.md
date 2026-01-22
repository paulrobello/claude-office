---
name: desk-accessory
description: >
  Generate desk accessories for the Claude Office Visualizer. Creates small office
  items (mugs, staplers, plants, etc.) that sit on agent desks. Items are made
  grayscale/white by default so they can be tinted different colors for variety.
triggers:
  - create desk accessory
  - desk item
  - office desk decoration
  - agent desk item
---

# Desk Accessory Generator

Create desk accessories for the Claude Office Visualizer using Nano Banana MCP for AI image generation and ImageMagick for transparency and tinting preparation.

## Philosophy: Tintable Variety

Desk accessories should be **grayscale or white** so they can be tinted with different colors at runtime. This allows a single sprite to represent many color variations across different desks, adding visual variety without generating multiple sprites.

**Before generating, ask**:
- Is this a unique item (one-of-a-kind) or a common item (appears on multiple desks)?
- If common: make it WHITE/GRAYSCALE for tinting
- If unique: colors can be baked in

## Key Principle: White for Tinting

**CRITICAL**: Unless the item is unique (only appears once), generate it as WHITE or GRAYSCALE so it can be tinted programmatically.

Why this matters:
- A white coffee mug can become blue, pink, green, gold via tinting
- A red stapler can ONLY be red - no variety
- Tinting multiplies the sprite's colors with the tint color
- White (0xFFFFFF) × any tint = that tint color
- Gray gives shaded/dimensional tinting results

## Key Principle: Facing Direction

**CRITICAL**: All desk items should face **NORTH-WEST** (away from the viewer). The game uses a top-down perspective where the user views characters and items from behind/above. Items should be oriented so their "front" faces away from the camera toward the top-left of the screen.

## Prompt Templates

### Scaling Guidance

**IMPORTANT**: Generated images (1024px) are scaled down to ~128px for use in the game. Include guidance in your prompts to ensure details survive scaling:

- Request **thick lines and bold shapes**
- Ask for **chunky pixel art** style
- Avoid fine details that will disappear at small sizes
- Add explicit note: "this will be scaled down significantly, use thick prominent features"

### Common Desk Items (Tintable - WHITE/GRAYSCALE)

```
Pixel art [ITEM], 16-bit retro game style, WHITE colored, simple clean design,
facing north-west, on solid magenta background #FF00FF, game sprite asset,
centered composition, no shadows on background, clean edges,
chunky pixel art with thick lines and bold shapes, this will be scaled down significantly so use thick prominent features
```

**Tintable item examples**:
- Coffee mug (white ceramic)
- Stapler (white/gray body)
- Tape dispenser (white/gray)
- Pencil cup (white ceramic)
- Small plant pot (white ceramic)
- Desk lamp (white/gray)
- Paper tray (white/gray)

### Unique Desk Items (Full Color OK)

```
Pixel art [ITEM], 16-bit retro game style, [SPECIFIC COLORS], simple clean design,
facing north-west, on solid magenta background #FF00FF, game sprite asset,
centered composition, no shadows on background, clean edges,
chunky pixel art with thick lines and bold shapes, this will be scaled down significantly so use thick prominent features
```

**Unique item examples** (color OK):
- Globe (blue/green earth colors)
- Family photo frame (wood frame, photo inside)
- Award trophy (gold)
- Specific branded items

## Processing Workflow

### Step 1: Generate with Nano Banana

Use mcpl to call the nanobanana generate_image tool. **Always use `model_tier: "pro"` and `resolution: "1k"`**:

```bash
mcpl call nanobanana generate_image '{"prompt": "Pixel art white coffee mug, 16-bit retro game style, WHITE colored ceramic, simple clean design, facing north-west, on solid magenta background #FF00FF, game sprite asset, centered composition, no shadows on background, chunky pixel art with thick lines and bold shapes, this will be scaled down significantly so use thick prominent features", "model_tier": "pro", "resolution": "1k"}'
```

**Why these settings**:
- `model_tier: "pro"`: Best quality generation
- `resolution: "1k"`: Smallest output (1024px) since we're scaling down anyway - saves processing time
- Prompt includes scaling guidance so the AI uses thick, prominent features that survive downscaling

### Step 2: Process for Transparency + Grayscale + Scaling

For **tintable items**, use the helper script:

```bash
# Default: scales to 128px max dimension (ideal for desk accessories)
.claude/skills/desk-accessory/scripts/process_tintable.sh input.png output.png

# Custom size for larger/more detailed items
.claude/skills/desk-accessory/scripts/process_tintable.sh input.png output.png 15 140 192

# Skip scaling (keep original ~1024px size)
.claude/skills/desk-accessory/scripts/process_tintable.sh input.png output.png 15 140 0
```

**Arguments**: `input.png output.png [fuzz%] [brightness%] [target_size]`
- `fuzz%`: Background color tolerance (default: 15)
- `brightness%`: Brightness adjustment (default: 140)
- `target_size`: Max dimension in pixels (default: 128, use 0 to skip)

The script now uses a **multi-pass workflow** for thorough magenta removal:

1. **FFmpeg geq filter**: Removes pixels where R≈B and G is low (purple/magenta hues)
2. **ImageMagick multi-pass**: Catches remaining bright magenta shades (#FF00FF, #CC00CC, etc.)
3. **ImageMagick dark purple cleanup**: Removes dark edge pixels like rgb(32,0,31)
4. **Desaturation**: Converts to grayscale for tinting
5. **Scaling**: Uses `-filter Point` for pixel-art-friendly nearest-neighbor scaling

**Manual workflow** (if scripts unavailable):

```bash
INPUT="generated.png"
OUTPUT="accessory.png"
TARGET_SIZE=128

# Step 1: FFmpeg - remove purple hue pixels
ffmpeg -y -i "$INPUT" \
  -vf "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(between(r(X,Y)-b(X,Y),-60,60)*lt(g(X,Y),r(X,Y)*0.7)*lt(g(X,Y),b(X,Y)*0.7)*gt(r(X,Y)+b(X,Y),100),0,alpha(X,Y))'" \
  -update 1 -frames:v 1 /tmp/step1.png

# Step 2: ImageMagick - remove remaining magenta shades
magick /tmp/step1.png -alpha set -channel RGBA \
  -fuzz 20% -transparent "magenta" \
  -fuzz 15% -transparent "#CC00CC" \
  -fuzz 15% -transparent "#880088" \
  /tmp/step2.png

# Step 3: Dark purple cleanup + desaturate + scale
magick /tmp/step2.png \
  -fuzz 8% -fill none -opaque "rgb(32,0,31)" -opaque "rgb(34,0,31)" \
  -modulate 140,0,100 \
  -trim +repage \
  -filter Point -resize "${TARGET_SIZE}x${TARGET_SIZE}>" \
  -type TrueColorAlpha -strip \
  "$OUTPUT"
```

**Key flags explained**:
- `-modulate 140,0,100`: Brightness 140%, Saturation 0% (grayscale), Hue unchanged
- `-filter Point`: Nearest-neighbor interpolation (preserves pixel art crispness)
- `-resize "128x128>"`: Scale down to max 128px, only if larger (the `>` suffix)
- `-type TrueColorAlpha`: Ensure RGBA format for PixiJS compatibility

**Why multi-pass?** AI-generated images often have anti-aliased edges that blend the subject with the magenta background. Single-pass removal leaves pink/purple fringing. The multi-pass approach targets different shades of magenta/purple for thorough cleanup

### Step 3: Verify Result

```bash
# Check has transparency and correct format
magick "$OUTPUT" -format "Size: %wx%h, Channels: %[channels], Transparent: %[opaque]" info:
# Expected: Channels: srgba 4.0, Transparent: False
```

### Step 4: Place in Project

```bash
mv "$OUTPUT" frontend/public/sprites/
```

## Integration with OfficeGameV2

Desk accessories are rendered in `DeskSurfaces` component with tinting:

```tsx
// Define tint colors array
const accessoryTints = [
  0xffffff, // White (no tint)
  0x87ceeb, // Sky blue
  0x98fb98, // Pale green
  0xffb6c1, // Light pink
  0xffd700, // Gold
  0xdda0dd, // Plum
  0xf0e68c, // Khaki
  0xadd8e6, // Light blue
];

// Apply tint based on desk index
<pixiSprite
  texture={accessoryTexture}
  tint={accessoryTints[deskIndex % accessoryTints.length]}
  ...
/>
```

## Adding New Accessories

1. Add texture state in `OfficeGameV2`:
```tsx
const [newItemTexture, setNewItemTexture] = useState<Texture | null>(null);
```

2. Load in useEffect:
```tsx
Assets.load("/sprites/new-item.png"),
```

3. Add to `DeskSurfacesProps` interface and function parameters

4. Render with tint:
```tsx
{newItemTexture && (
  <pixiSprite
    texture={newItemTexture}
    anchor={0.5}
    x={POSITION_X}
    y={POSITION_Y}
    scale={SCALE}
    tint={accessoryTints[i % accessoryTints.length]}
  />
)}
```

## Randomization Pattern

To randomize which desks get which items:

```tsx
// Deterministic "random" based on desk index
const getDeskItem = (index: number): "mug" | "stapler" | "plant" => {
  const items = ["mug", "stapler", "plant"] as const;
  return items[index % items.length];
};
```

Or use a seeded random for more variety:

```tsx
// Simple hash for deterministic randomness
const getDeskItem = (index: number): string => {
  const items = ["mug", "stapler", "plant", "lamp"];
  const hash = (index * 2654435761) % items.length;
  return items[Math.abs(hash)];
};
```

## Output Location

**Default**: `frontend/public/sprites/`

**Naming convention**: `lowercase-with-dashes.png`
- `coffee-mug.png`
- `stapler.png`
- `desk-plant.png`
- `tape-dispenser.png`

## Quick Reference

```bash
# 1. Generate white/grayscale item - use pro model at 1k resolution
mcpl call nanobanana generate_image '{"prompt": "Pixel art white [ITEM], 16-bit retro game style, WHITE colored, simple clean design, facing north-west, on solid magenta background #FF00FF, game sprite asset, centered composition, clean edges, chunky pixel art with thick lines and bold shapes, this will be scaled down significantly so use thick prominent features", "model_tier": "pro", "resolution": "1k"}'

# 2. Process for tinting (default: scales to 128px, grayscale, transparent background)
.claude/skills/desk-accessory/scripts/process_tintable.sh /path/to/generated.png frontend/public/sprites/item-name.png

# 2b. For larger/more detailed items, use a larger target size
.claude/skills/desk-accessory/scripts/process_tintable.sh /path/to/generated.png frontend/public/sprites/item-name.png 15 140 192

# 3. Verify
magick frontend/public/sprites/item-name.png -format "%wx%h %[channels] %[opaque]" info:
# Should show: ~128x128 (or smaller) srgba 4.0 False
```

## Anti-Patterns

❌ **Generating colored common items**
Why: Can't be tinted to other colors effectively.
Better: Generate white/grayscale, tint at runtime.

❌ **Using flood fill for items with holes**
Why: Flood fill from corners won't reach enclosed areas (like mug handles).
Better: Use global `-transparent` for items with enclosed spaces.

❌ **Forgetting `-type TrueColorAlpha`**
Why: Grayscale conversion creates 2-channel images that may not render correctly.
Better: Always convert back to RGBA after desaturation.

❌ **Making items too detailed**
Why: Small desk items are rendered at tiny scales (~0.025-0.03).
Better: Simple, bold shapes that read well at small sizes.

## Existing Accessories

| Item | File | Tintable | Notes |
|------|------|----------|-------|
| Coffee Mug | `coffee-mug.png` | Yes | White ceramic, no steam |
| Stapler | `stapler.png` | Yes | Grayscale, brightened |
| Desk Lamp | `desk-lamp.png` | Yes | Adjustable lamp, facing NW |

## Remember

- **Common items = WHITE/GRAYSCALE** for tinting variety
- Process with `-modulate X,0,100` to desaturate
- Always use `-type TrueColorAlpha` for PixiJS compatibility
- Test tinting looks good with multiple colors before committing
