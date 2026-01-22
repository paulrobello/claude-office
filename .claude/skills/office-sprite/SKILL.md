---
name: office-sprite
description: >
  Generate game-ready sprites for the Claude Office Visualizer using Nano Banana MCP
  and ImageMagick. Uses 45-degree front/top-down perspective (NOT isometric) with
  retro 16-bit pixel art style. Includes validation step before processing and
  helper scripts for background removal.
triggers:
  - create office sprite
  - generate office furniture
  - make sprite for office
  - office asset
---

# Office Sprite Generator

Create game-ready sprites for the Claude Office Visualizer using Nano Banana MCP and ImageMagick.

## Project Context

The Claude Office Visualizer uses a **45-degree front/top-down perspective** (NOT isometric). This means:
- Objects are viewed primarily from the front
- Slight top-down angle shows a bit of the top surface
- You do NOT see multiple side faces like in isometric views
- Similar to classic 2D RPGs or top-down office games

**Art Style**: Retro 16-bit pixel art with clean edges and limited anti-aliasing.

## Workflow

### Step 1: Generate with Nano Banana

Use mcpl to call Nano Banana with this prompt template:

```bash
mcpl call nanobanana generate_image '{
  "prompt": "[OBJECT DESCRIPTION], front view with slight top-down angle, NOT isometric, pixel art style, retro 16-bit game sprite, isolated on solid magenta background #FF00FF, clean edges, no shadows on background, game sprite asset, centered composition, no text, no watermarks, simple design",
  "output_path": "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_raw.png"
}'
```

**Prompt Variables:**
- `[OBJECT DESCRIPTION]`: Detailed description of the object (e.g., "Office water cooler dispenser with blue water bottle jug on top of white dispenser stand with hot and cold taps")
- `[NAME]`: Sprite filename (e.g., "watercooler", "desk", "plant")

### Step 2: VALIDATE THE IMAGE

**CRITICAL**: Before proceeding with ImageMagick processing, you MUST:

1. Copy the generated image to the raw location:
   ```bash
   cp "/Users/probello/nanobanana-images/temp_images/[UUID].png" \
      "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_raw.png"
   ```

2. View the image using the Read tool to verify:
   - **Perspective is correct** (front view, NOT isometric/3D cube view)
   - **Subject is centered** and fully visible
   - **Background is solid magenta** (may have black letterboxing on sides)
   - **Art style matches** retro pixel art aesthetic

3. If the image is NOT correct:
   - Regenerate with adjusted prompt
   - Do NOT proceed to ImageMagick processing
   - Common issues:
     - Isometric view: Add "NOT isometric, front facing view" more emphatically
     - Wrong style: Specify "16-bit pixel art, retro game sprite" more clearly
     - Cut off subject: Add "full object visible, not cropped"

### Step 3: Process with ImageMagick

Only after validation passes, remove the magenta background using the helper script:

```bash
# Using the helper script (recommended)
/Users/probello/Repos/claude-office/.claude/skills/office-sprite/scripts/process_sprite.sh \
  /Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_raw.png \
  /Users/probello/Repos/claude-office/frontend/public/sprites/[NAME].png
```

The script uses a **multi-pass workflow** combining FFmpeg and ImageMagick:

1. **FFmpeg geq filter**: Removes pixels where R≈B and G is low (purple/magenta hues)
2. **ImageMagick multi-pass**: Catches remaining bright magenta shades (#FF00FF, #CC00CC, etc.)
3. **ImageMagick dark purple cleanup**: Removes dark edge pixels like rgb(32,0,31)

For legacy flood-fill method (faster but may leave pink edges):
```bash
process_sprite.sh input.png output.png --legacy
```

**Manual multi-pass workflow** (if script unavailable):

```bash
INPUT="/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_raw.png"
OUTPUT="/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME].png"

# Step 1: FFmpeg - remove purple hue pixels (R≈B, G low)
ffmpeg -y -i "$INPUT" \
  -vf "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(between(r(X,Y)-b(X,Y),-60,60)*lt(g(X,Y),r(X,Y)*0.7)*lt(g(X,Y),b(X,Y)*0.7)*gt(r(X,Y)+b(X,Y),100),0,alpha(X,Y))'" \
  -update 1 -frames:v 1 /tmp/step1.png

# Step 2: ImageMagick - remove bright magenta shades
magick /tmp/step1.png -alpha set -channel RGBA \
  -fuzz 20% -transparent "magenta" \
  -fuzz 15% -transparent "#CC00CC" \
  -fuzz 15% -transparent "#880088" \
  -fuzz 15% -transparent "#660066" \
  /tmp/step2.png

# Step 3: ImageMagick - remove dark purple edge pixels
magick /tmp/step2.png \
  -fuzz 8% -fill none \
  -opaque "rgb(32,0,31)" \
  -opaque "rgb(34,0,31)" \
  -trim +repage -strip \
  "$OUTPUT"

# Verify transparency
magick "$OUTPUT" -format "Size: %wx%h, Opaque: %[opaque]" info:
```

**Why multi-pass?** AI-generated images often have anti-aliased edges that blend the subject with the magenta background. Single-pass removal leaves pink/purple fringing. The multi-pass approach targets different shades of magenta/purple for thorough cleanup

### Step 4: Verify Final Sprite

View the processed sprite with the Read tool to confirm:
- Clean transparency (no magenta fringing)
- Sprite edges are intact (not eroded)
- Correct dimensions for game use

### Step 5: Update Game Code

In `OfficeGameV2.tsx`, sprites are loaded and displayed like this:

```typescript
// Add texture state
const [spriteTexture, setSpriteTexture] = useState<Texture | null>(null);

// Load texture in useEffect
useEffect(() => {
  const loadTextures = async () => {
    try {
      const texture = await Assets.load("/sprites/[NAME].png");
      setSpriteTexture(texture);
    } catch (e) {
      console.warn("Failed to load sprite:", e);
    }
  };
  loadTextures();
}, []);

// Render sprite with fallback to placeholder
<pixiContainer x={X_POS} y={Y_POS}>
  {spriteTexture ? (
    <pixiSprite
      texture={spriteTexture}
      anchor={0.5}
      scale={SCALE_FACTOR}
    />
  ) : (
    <pixiGraphics draw={drawPlaceholder} />
  )}
</pixiContainer>
```

**Scale Calculation:**
- Target display width / Sprite actual width = scale factor
- Example: For 50px display width with 189px sprite: `scale={50/189}` or `scale={0.26}`

## Furniture Reference

Current furniture sizes from `furnitureManager.ts`:

| Type | Width | Height | Notes |
|------|-------|--------|-------|
| desk | 140px | 80px | With chair position |
| plant | 40px | 40px | Potted plant |
| watercooler | 50px | 50px | Water dispenser |
| filing_cabinet | 60px | 80px | Metal cabinet |
| couch | 120px | 60px | Office couch |
| table | 100px | 60px | Meeting table |

Additional elements from `OfficeGameV2.tsx`:

| Element | Approx Size | Notes |
|---------|-------------|-------|
| Wall clock | 88x88px | Analog clock face |
| Whiteboard | 330x170px | With todo display |
| Elevator | 128x160px | With doors |
| Safety sign | 140x100px | Days without incident |

## Output Location

All sprites go to: `/Users/probello/Repos/claude-office/frontend/public/sprites/`

- `[name]_raw.png` - Original generated image (keep for reference)
- `[name].png` - Processed sprite with transparency

## Anti-Patterns

**DO NOT:**
- Skip the validation step - always view the raw image first
- Use `-transparent` instead of flood fill - it removes ALL matching pixels
- Proceed with isometric/wrong perspective images - regenerate instead
- Use white or black as chroma key - they appear in subjects
- Forget to trim - wastes texture memory

**DO:**
- Always validate before processing
- Use flood fill from corners for clean background removal
- Keep raw images as backup
- Verify final sprite has transparency (`Opaque: False`)
- Test sprite in game before moving to next asset
