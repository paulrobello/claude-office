---
name: character-sprite
description: >
  Generate complete character sprite sheets for the Claude Office Visualizer agents.
  Creates all animation frames (idle, walking, typing, handoff, coffee) with consistent
  character design across all sheets. Uses iterative approval workflow and reference-based
  generation for consistency.
triggers:
  - create agent sprite
  - create character sprite
  - new office character
  - generate agent animations
  - make character for office
---

# Character Sprite Generator

Create complete, animated character sprite sheets for Claude Office Visualizer agents using Nano Banana MCP and ImageMagick.

## Project Context

Characters are office workers rendered in **retro 16-bit pixel art style**. Each character requires multiple animation sprite sheets for different actions and directions.

**Art Style**: Retro 16-bit pixel art (SNES/Genesis era), clean pixels, limited colors.

**CRITICAL - NO ANTI-ALIASING**: All sprites must have sharp, crisp pixel edges with NO anti-aliasing, NO smoothing, NO blending between pixels. Each pixel should be a solid color with hard edges. Anti-aliased sprites look blurry and muddy in the game.

**Character Constraints**:
- Max width: 60px (matches current agent radius × 2)
- Max height: 75px (25% taller than width allowed)
- Magenta (#FF00FF) chroma key background

## Sprite Sheet Technical Specifications

### CRITICAL: Grid Layout Requirements

The game engine parses sprite sheets by dividing the total image into a fixed grid. **All cells must be uniform with ZERO padding/spacing between them.**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  NO gaps, borders, or padding between cells. Cells are calculated as:       │
│  cell_width = sheet_width / columns                                          │
│  cell_height = sheet_height / rows                                           │
│  Frame at (col, row) starts at pixel (col × cell_width, row × cell_height)  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**DO NOT:**
- Add visible grid lines or cell borders
- Add padding or spacing between cells
- Use inconsistent cell sizes
- Leave empty cells (fill with magenta background)

### Sheet Dimensions & Frame Specifications

| Sheet Type | Total Size | Grid | Cell Size | Frames |
|------------|------------|------|-----------|--------|
| **Idle** | 928 × 1152 px | 8 cols × 8 rows | 116 × 144 px | 64 total |
| **Walking** | 928 × 1152 px | 8 cols × 8 rows | 116 × 144 px | 64 total |
| **Typing** | 928 × 144 px | 8 cols × 1 row | 116 × 144 px | 8 frames |
| **Handoff** | 928 × 1152 px | 4 cols × 1 row | 232 × 411 px* | 4 frames |
| **Coffee** | 928 × 1152 px | 4 cols × 1 row | 232 × 699 px* | 4 frames |

*Handoff/coffee sheets have content offset - see Frame Location Map below.

### Frame Location Map

**Grid Sheets (Idle/Walk) - 8 columns × 8 rows:**
```
Row 0 (y=0-143):    South (front-facing)     - Frames 0-7 at x: 0, 116, 232, 348, 464, 580, 696, 812
Row 1 (y=144-287):  South-West               - Frames 0-7
Row 2 (y=288-431):  West (left profile)      - Frames 0-7
Row 3 (y=432-575):  North-West               - Frames 0-7
Row 4 (y=576-719):  North (back view)        - Frames 0-7
Row 5 (y=720-863):  North-East               - Frames 0-7
Row 6 (y=864-1007): East (right profile)     - Frames 0-7
Row 7 (y=1008-1151): South-East              - Frames 0-7
```

**Strip Sheets (Single row):**
```
Typing:  Row 0, 8 frames at x: 0, 116, 232, 348, 464, 580, 696, 812 (y=0-143)
Handoff: Row 0, 4 frames at x: 0, 232, 464, 696 (content y=343-753)
Coffee:  Row 0, 4 frames at x: 0, 232, 464, 696 (content y=0-698)
```

### Animation Requirements

| Animation | Frames | Duration | Looped | Notes |
|-----------|--------|----------|--------|-------|
| **Idle** | 8 frames × 8 directions | 2000ms | Yes | Subtle breathing/weight shift |
| **Walking** | 8 frames × 8 directions | 800ms | Yes | Full walk cycle with arm swing |
| **Typing** | 8 frames | 400ms | Yes | Back view, hands on keyboard |
| **Handoff** | 4 frames | 600ms | No | Side view, handing folder |
| **Coffee** | 4 frames | 400ms | Yes | Front view, drinking motion |

**8 Directions** (row order): S, SW, W, NW, N, NE, E, SE

## Workflow

### Step 1: Generate Base Character Design

Create a front-facing idle pose to establish the character's look:

```bash
mcpl call nanobanana generate_image '{
  "prompt": "16-bit pixel art game sprite of a [CHARACTER DESCRIPTION], front view facing camera, [CLOTHING DESCRIPTION], simple friendly face, small character suitable for top-down office game, retro SNES/Genesis style pixel art, standing idle pose with arms at sides, isolated on solid magenta background #FF00FF, SHARP CRISP PIXEL EDGES WITH ABSOLUTELY NO ANTI-ALIASING NO SMOOTHING NO BLENDING, each pixel is a solid color with hard edges, centered composition, no text, no shadows on background, 64x80 pixels scale",
  "output_path": "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_front_idle_raw.png",
  "model_tier": "pro"
}'
```

**Prompt Variables:**
- `[CHARACTER DESCRIPTION]`: e.g., "male office worker", "female developer", "robot assistant"
- `[CLOTHING DESCRIPTION]`: e.g., "wearing blue dress shirt and tie, brown pants, black shoes, short brown hair"
- `[NAME]`: Character identifier (e.g., "agent1", "agent2", "boss")

### Step 2: VALIDATE AND ITERATE

**CRITICAL**: Get user approval before generating all sprite sheets.

1. Copy the generated image:
   ```bash
   cp "/Users/probello/nanobanana-images/[FILENAME].png" \
      "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_front_idle_raw.png"
   ```

2. View the image using the Read tool and present to user

3. Ask user to validate:
   - Character design matches their vision
   - Art style is correct (16-bit pixel art)
   - Proportions work for the game
   - Colors and details are acceptable

4. **If rejected**: Regenerate with adjusted prompt based on feedback

5. **If approved**: Proceed to Step 3

### Step 3: Generate All Sprite Sheets

Use BOTH reference images for each generation:
- **Reference 1**: The approved character design (for consistent appearance)
- **Reference 2**: Existing Agent #1 sprite sheet (for consistent frame layout)

#### 3a. Idle Animation Sheet

**Technical Requirements:**
- Total size: 928 × 1152 pixels
- Grid: 8 columns × 8 rows (64 cells total)
- Cell size: 116 × 144 pixels each
- NO borders, padding, or spacing between cells
- Frames must fill entire cell area

```bash
mcpl call nanobanana generate_image '{
  "prompt": "16-bit pixel art sprite sheet, EXACTLY 928x1152 pixels total, divided into 8 columns and 8 rows grid, each cell is EXACTLY 116x144 pixels with NO borders NO padding NO gaps between cells, character is [CHARACTER DESCRIPTION] (EXACTLY as shown in first reference image), 8 DIRECTIONS IN EXACT ORDER from top to bottom: ROW 0 south facing toward camera, ROW 1 south-west diagonal, ROW 2 west facing left profile, ROW 3 north-west diagonal, ROW 4 north facing away back view, ROW 5 north-east diagonal, ROW 6 east facing right profile, ROW 7 south-east diagonal, each row has 8 frames of subtle idle breathing animation, cells touch edge-to-edge with no visible grid lines, retro SNES Genesis 16-bit pixel art, SHARP CRISP PIXEL EDGES WITH ABSOLUTELY NO ANTI-ALIASING NO SMOOTHING NO BLENDING, each pixel is a solid color with hard edges, consistent character in every cell matching reference, solid magenta #FF00FF background fills all empty space in each cell, game sprite sheet asset, no text no watermarks",
  "input_image_path_1": "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_front_idle_raw.png",
  "input_image_path_2": "/Users/probello/Repos/claude-office/frontend/public/sprites/agent1_idle_sheet.png",
  "output_path": "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_idle_sheet_raw.png",
  "model_tier": "pro",
  "aspect_ratio": "4:5",
  "negative_prompt": "blurry, 3D, realistic, anti-aliasing, anti-aliased edges, smoothing, blending, soft edges, gradients, shadows on background, inconsistent character, different characters, text, watermark, grid lines, cell borders, padding between frames, gaps between cells"
}'
```

#### 3b. Walking Animation Sheet

**Technical Requirements:**
- Total size: 928 × 1152 pixels
- Grid: 8 columns × 8 rows (64 cells total)
- Cell size: 116 × 144 pixels each
- NO borders, padding, or spacing between cells

```bash
mcpl call nanobanana generate_image '{
  "prompt": "16-bit pixel art sprite sheet for WALKING animation, EXACTLY 928x1152 pixels total, divided into 8 columns and 8 rows grid, each cell is EXACTLY 116x144 pixels with NO borders NO padding NO gaps between cells, character is [CHARACTER DESCRIPTION] (EXACTLY as shown in first reference image), 8 DIRECTIONS IN EXACT ORDER from top to bottom: ROW 0 walking south toward camera, ROW 1 walking south-west diagonal, ROW 2 walking west left profile, ROW 3 walking north-west diagonal, ROW 4 walking north away back view, ROW 5 walking north-east diagonal, ROW 6 walking east right profile, ROW 7 walking south-east diagonal, each row has 8 frames of walk cycle with alternating legs and natural arm swing, cells touch edge-to-edge with no visible grid lines, retro SNES Genesis 16-bit pixel art, SHARP CRISP PIXEL EDGES WITH ABSOLUTELY NO ANTI-ALIASING NO SMOOTHING NO BLENDING, each pixel is a solid color with hard edges, consistent character in every cell matching reference, solid magenta #FF00FF background fills all empty space in each cell, game sprite sheet asset, no text no watermarks",
  "input_image_path_1": "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_front_idle_raw.png",
  "input_image_path_2": "/Users/probello/Repos/claude-office/frontend/public/sprites/agent1_walk_sheet.png",
  "output_path": "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_walk_sheet_raw.png",
  "model_tier": "pro",
  "aspect_ratio": "4:5",
  "negative_prompt": "blurry, 3D, realistic, anti-aliasing, anti-aliased edges, smoothing, blending, soft edges, gradients, shadows on background, inconsistent character, different characters, text, watermark, standing still, static pose, grid lines, cell borders, padding between frames, gaps between cells"
}'
```

#### 3c. Typing Animation Sheet

**Technical Requirements:**
- Total size: 928 × 144 pixels (single row)
- Grid: 8 columns × 1 row
- Cell size: 116 × 144 pixels each
- NO borders, padding, or spacing between cells
- **CHARACTER ONLY** - no desk, chair, or keyboard (those are separate game assets)

```bash
mcpl call nanobanana generate_image '{
  "prompt": "16-bit pixel art sprite sheet for TYPING animation, EXACTLY 928x144 pixels total, horizontal strip with 8 equal cells of EXACTLY 116x144 pixels each with NO borders NO padding NO gaps between cells, character is [CHARACTER DESCRIPTION] (EXACTLY as shown in first reference image), character seen from behind (back view) in seated typing pose with arms extended forward making typing motions, CHARACTER ONLY no desk no chair no keyboard no furniture, 8 frame typing animation showing hands and arms making typing movements, frames show subtle arm position changes as if typing, cells touch edge-to-edge with no visible grid lines, retro SNES Genesis 16-bit pixel art, SHARP CRISP PIXEL EDGES WITH ABSOLUTELY NO ANTI-ALIASING NO SMOOTHING NO BLENDING, each pixel is a solid color with hard edges, consistent character across all 8 frames matching reference, solid magenta #FF00FF background fills all empty space in each cell, game sprite sheet asset, no text no watermarks",
  "input_image_path_1": "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_front_idle_raw.png",
  "input_image_path_2": "/Users/probello/Repos/claude-office/frontend/public/sprites/agent1_typing_sheet.png",
  "output_path": "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_typing_sheet_raw.png",
  "model_tier": "pro",
  "aspect_ratio": "21:9",
  "negative_prompt": "blurry, 3D, realistic, anti-aliasing, anti-aliased edges, smoothing, blending, soft edges, gradients, shadows on background, inconsistent character, different characters, text, watermark, front view, standing, grid lines, cell borders, padding between frames, gaps between cells, desk, chair, keyboard, furniture, computer, monitor"
}'
```

#### 3d. Folder Handoff Animation Sheet

**Technical Requirements:**
- Total size: 928 × 1120 pixels (but content in one row)
- Grid: 4 columns × 1 row (usable content area)
- Cell size: 232 × 411 pixels each
- Content starts at y=343 (vertical offset)
- NO borders, padding, or spacing between cells

```bash
mcpl call nanobanana generate_image '{
  "prompt": "16-bit pixel art sprite sheet for HANDING FOLDER animation, EXACTLY 928 pixels wide, horizontal strip with 4 equal cells of EXACTLY 232 pixels wide each with NO borders NO padding NO gaps between cells, character is [CHARACTER DESCRIPTION] (EXACTLY as shown in first reference image), character seen from side profile holding and handing over a manila folder document, 4 frame animation sequence: frame 1 holding folder at waist, frame 2 extending arm with folder, frame 3 arm fully extended offering folder, frame 4 releasing folder hand open, cells touch edge-to-edge with no visible grid lines, retro SNES Genesis 16-bit pixel art, SHARP CRISP PIXEL EDGES WITH ABSOLUTELY NO ANTI-ALIASING NO SMOOTHING NO BLENDING, each pixel is a solid color with hard edges, consistent character across all 4 frames matching reference, solid magenta #FF00FF background fills all empty space in each cell, game sprite sheet asset, no text no watermarks",
  "input_image_path_1": "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_front_idle_raw.png",
  "input_image_path_2": "/Users/probello/Repos/claude-office/frontend/public/sprites/agent1_handoff_sheet.png",
  "output_path": "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_handoff_sheet_raw.png",
  "model_tier": "pro",
  "aspect_ratio": "21:9",
  "negative_prompt": "blurry, 3D, realistic, anti-aliasing, anti-aliased edges, smoothing, blending, soft edges, gradients, shadows on background, inconsistent character, different characters, text, watermark, back view, grid lines, cell borders, padding between frames, gaps between cells"
}'
```

#### 3e. Coffee Drinking Animation Sheet

**Technical Requirements:**
- Total size: 928 × 1120 pixels (but content in one row)
- Grid: 4 columns × 1 row (usable content area)
- Cell size: 232 × 699 pixels each
- Content starts at y=0
- NO borders, padding, or spacing between cells

```bash
mcpl call nanobanana generate_image '{
  "prompt": "16-bit pixel art sprite sheet for DRINKING COFFEE animation, EXACTLY 928 pixels wide, horizontal strip with 4 equal cells of EXACTLY 232 pixels wide each with NO borders NO padding NO gaps between cells, character is [CHARACTER DESCRIPTION] (EXACTLY as shown in first reference image), character seen from front holding and drinking from a coffee cup mug, 4 frame animation sequence: frame 1 holding coffee cup at chest, frame 2 raising cup toward face, frame 3 cup at lips drinking, frame 4 lowering cup with satisfied expression, cells touch edge-to-edge with no visible grid lines, retro SNES Genesis 16-bit pixel art, SHARP CRISP PIXEL EDGES WITH ABSOLUTELY NO ANTI-ALIASING NO SMOOTHING NO BLENDING, each pixel is a solid color with hard edges, consistent character across all 4 frames matching reference, solid magenta #FF00FF background fills all empty space in each cell, game sprite sheet asset, no text no watermarks",
  "input_image_path_1": "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_front_idle_raw.png",
  "input_image_path_2": "/Users/probello/Repos/claude-office/frontend/public/sprites/agent1_coffee_sheet.png",
  "output_path": "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_coffee_sheet_raw.png",
  "model_tier": "pro",
  "aspect_ratio": "21:9",
  "negative_prompt": "blurry, 3D, realistic, anti-aliasing, anti-aliased edges, smoothing, blending, soft edges, gradients, shadows on background, inconsistent character, different characters, text, watermark, back view, sitting, grid lines, cell borders, padding between frames, gaps between cells"
}'
```

### Step 4: Validate Each Generated Sheet

**CRITICAL**: After generating each sprite sheet:

1. Copy to sprites folder:
   ```bash
   cp "/Users/probello/nanobanana-images/[FILENAME].png" \
      "/Users/probello/Repos/claude-office/frontend/public/sprites/[NAME]_[TYPE]_sheet_raw.png"
   ```

2. Verify dimensions match specifications:
   ```bash
   cd /Users/probello/Repos/claude-office/frontend/public/sprites

   # Check sheet dimensions
   magick "[NAME]_[TYPE]_sheet_raw.png" -format "Size: %wx%h" info:

   # Expected dimensions:
   # idle/walk sheets: 928x1152
   # typing sheet: 928x144 (after cropping) or 928x1152 (full generation)
   # handoff/coffee sheets: 928x1152
   ```

3. View using Read tool to verify:
   - Character matches approved design
   - All frames are present and properly arranged
   - Animation progression looks correct
   - Magenta background is solid
   - **NO visible grid lines or cell borders**
   - **NO padding/spacing between cells**
   - **SHARP pixel edges with NO anti-aliasing** (zoom in to check)
   - **For directional sheets (idle/walk)**: Verify direction order is correct:
     - Row 0: South (facing camera)
     - Row 1: South-West
     - Row 2: West (left profile)
     - Row 3: North-West
     - Row 4: North (back view)
     - Row 5: North-East
     - Row 6: East (right profile)
     - Row 7: South-East

4. Check for common issues:
   - If grid lines visible: Regenerate with stronger "no grid lines" emphasis
   - If wrong cell count: Regenerate with correct column/row specification
   - If inconsistent cell sizes: Regenerate with exact pixel dimensions in prompt
   - **If edges look soft/blurry (anti-aliased)**: Regenerate with stronger "NO ANTI-ALIASING" emphasis
   - **If directions are in wrong order**: Regenerate with explicit "ROW 0 south, ROW 1 south-west..." sequence

5. If issues found, regenerate that specific sheet

### Step 5: Process All Sprite Sheets

Remove magenta backgrounds from all sheets using the improved multi-pass workflow:

```bash
cd /Users/probello/Repos/claude-office/frontend/public/sprites

# Process all sheets using the shared script
SCRIPT="/Users/probello/Repos/claude-office/.claude/skills/shared/scripts/remove_magenta.sh"

for sheet in [NAME]_idle_sheet [NAME]_walk_sheet [NAME]_typing_sheet [NAME]_handoff_sheet [NAME]_coffee_sheet; do
  INPUT="${sheet}_raw.png"
  OUTPUT="${sheet}.png"

  # Use multi-pass removal (--skip-trim preserves sprite sheet dimensions)
  "$SCRIPT" "$INPUT" "$OUTPUT" --skip-trim

  echo "Processed: $OUTPUT"
  magick "$OUTPUT" -format "  Size: %wx%h, Opaque: %[opaque]" info:
done
```

The multi-pass workflow:
1. **FFmpeg geq filter**: Removes pixels where R≈B and G is low (purple/magenta hues)
2. **ImageMagick multi-pass**: Catches remaining bright magenta shades
3. **ImageMagick dark purple cleanup**: Removes dark edge pixels like rgb(32,0,31)

Also process the base character sprite:
```bash
INPUT="[NAME]_front_idle_raw.png"
OUTPUT="[NAME]_front_idle.png"

"$SCRIPT" "$INPUT" "$OUTPUT"
```

**Fallback** (if script unavailable):
```bash
magick "$INPUT" \
  -fuzz 40% -transparent "#FF00FF" \
  -fuzz 15% -transparent "#CC00CC" \
  -fuzz 15% -transparent "#880088" \
  -strip \
  "$OUTPUT"
```

### Step 6: Final Verification

View each processed sprite sheet to confirm:
- **NO pink/magenta fringing** around character edges (zoom in to check)
- Clean transparency throughout
- Character edges intact (not eroded by transparency removal)
- All frames visible

**If pink edges remain after processing:**
1. Try increasing fuzz value: `-fuzz 45%` or `-fuzz 50%` (but watch for character edge erosion above 50%)
2. If that erodes character edges, reduce fuzz and manually check the raw image
3. Raw images with anti-aliased edges against magenta will always have fringing issues - regenerate the raw image with stronger "NO ANTI-ALIASING" emphasis

## Reference Sprite Sheets

The following Agent #1 sprite sheets serve as layout references:

| Sheet | Location |
|-------|----------|
| Idle | `/frontend/public/sprites/agent1_idle_sheet.png` |
| Walking | `/frontend/public/sprites/agent1_walk_sheet.png` |
| Typing | `/frontend/public/sprites/agent1_typing_sheet.png` |
| Handoff | `/frontend/public/sprites/agent1_handoff_sheet.png` |
| Coffee | `/frontend/public/sprites/agent1_coffee_sheet.png` |

## Output Location

All sprites go to: `/Users/probello/Repos/claude-office/frontend/public/sprites/`

- `[name]_front_idle_raw.png` - Original character design (keep as reference)
- `[name]_front_idle.png` - Processed character design with transparency
- `[name]_[type]_sheet_raw.png` - Raw sprite sheets (keep as backup)
- `[name]_[type]_sheet.png` - Processed sprite sheets ready for game

## Character Ideas

Example character descriptions for variety:

| Character | Description |
|-----------|-------------|
| Agent 2 | Female developer with purple blouse, black pants, glasses, ponytail |
| Agent 3 | Male senior dev with gray sweater, khakis, beard, receding hairline |
| Agent 4 | Non-binary intern with green hoodie, jeans, colorful hair |
| Boss/Claude | Distinguished figure with orange/tan color scheme (matches Claude branding) |

## Anti-Patterns & Common Issues

### Grid Layout Issues (CRITICAL)

**DO NOT:**
- Add visible grid lines or borders between cells
- Add padding/margin/spacing between cells
- Generate sheets with inconsistent cell sizes
- Use wrong row/column counts (must be 8×8 for grid sheets, see specs above)
- Include desk, chair, keyboard in typing sprites (they're separate game assets)

**Common Generation Mistakes to Reject:**
- Grid lines visible between cells → regenerate with emphasis on "no grid lines"
- Cells have varying sizes → regenerate with exact pixel dimensions
- Empty/missing cells → regenerate with all cells filled
- Character includes furniture → regenerate with "CHARACTER ONLY" emphasis

### Anti-Aliasing Issues (CRITICAL)

**DO NOT:**
- Accept sprites with soft/blurry edges
- Accept sprites with color blending between pixels
- Accept sprites with smooth gradients at edges

**How to Detect Anti-Aliasing:**
- Zoom in on character edges - each pixel should be a single solid color
- Look for "halo" or "fringe" colors around the character outline
- Check if edges look smooth instead of jagged/stepped

**Common Anti-Aliasing Mistakes to Reject:**
- Soft edges around character outline → regenerate with stronger "NO ANTI-ALIASING" emphasis
- Color gradients at pixel boundaries → regenerate, emphasize "each pixel is a solid color"
- Blurry/muddy appearance → regenerate with "SHARP CRISP PIXEL EDGES"

### Workflow Anti-Patterns

**DO NOT:**
- Skip the initial design approval - iterate until user is happy
- Generate sprite sheets without both reference images
- Skip validation of each generated sheet
- Use flood-fill for background removal (use `-transparent` for sprite sheets)
- Proceed with inconsistent character designs across sheets

**DO:**
- Always get user approval on base design first
- Use character reference + layout reference for each sheet
- Validate each sheet after generation before proceeding
- Keep raw images as backup
- Process all sheets in batch after validation complete
- Verify cell dimensions match specs after generation
