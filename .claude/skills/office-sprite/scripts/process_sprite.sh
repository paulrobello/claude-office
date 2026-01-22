#!/bin/bash
# Process a raw sprite image to remove magenta background and create transparency
# Usage: ./process_sprite.sh <input_raw.png> <output.png> [--legacy]
#
# By default, uses the improved multi-pass workflow (FFmpeg + ImageMagick)
# that handles anti-aliased edges and dark purple fringing.
#
# Options:
#   --legacy    Use legacy flood-fill method (faster but may leave pink edges)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_SCRIPTS="$SCRIPT_DIR/../../shared/scripts"

INPUT="$1"
OUTPUT="$2"
LEGACY=false

# Check for --legacy flag
for arg in "$@"; do
    if [[ "$arg" == "--legacy" ]]; then
        LEGACY=true
    fi
done

if [[ -z "$INPUT" || -z "$OUTPUT" ]]; then
    echo "Usage: $0 <input_raw.png> <output.png> [--legacy]"
    echo ""
    echo "Removes magenta chroma key background from sprites."
    echo ""
    echo "Options:"
    echo "  --legacy    Use legacy flood-fill method (faster but may leave pink edges)"
    echo ""
    echo "The default method uses a multi-pass approach:"
    echo "  1. FFmpeg geq filter removes purple/magenta hue pixels"
    echo "  2. ImageMagick removes remaining bright magenta shades"
    echo "  3. ImageMagick cleans up dark purple edge artifacts"
    exit 1
fi

if [[ ! -f "$INPUT" ]]; then
    echo "Error: Input file not found: $INPUT"
    exit 1
fi

if [[ "$LEGACY" == true ]]; then
    # Legacy flood-fill method
    echo "Using legacy flood-fill method..."

    WIDTH=$(magick "$INPUT" -format "%w" info:)
    HEIGHT=$(magick "$INPUT" -format "%h" info:)
    MAX_X=$((WIDTH - 1))
    MAX_Y=$((HEIGHT - 1))

    echo "Processing: $INPUT"
    echo "Dimensions: ${WIDTH}x${HEIGHT}"

    CORNER=$(magick "$INPUT" -format "%[pixel:p{0,0}]" info:)
    echo "Corner color: $CORNER"

    magick "$INPUT" \
        -fuzz 20% -fill none -draw "alpha 0,0 floodfill" \
        -fuzz 20% -fill none -draw "alpha ${MAX_X},0 floodfill" \
        -fuzz 20% -fill none -draw "alpha 0,${MAX_Y} floodfill" \
        -fuzz 20% -fill none -draw "alpha ${MAX_X},${MAX_Y} floodfill" \
        -trim +repage -strip \
        "$OUTPUT"
else
    # Use improved multi-pass method
    if [[ -x "$SHARED_SCRIPTS/remove_magenta.sh" ]]; then
        "$SHARED_SCRIPTS/remove_magenta.sh" "$INPUT" "$OUTPUT"
    else
        echo "Error: Shared script not found: $SHARED_SCRIPTS/remove_magenta.sh"
        echo "Falling back to legacy method..."

        WIDTH=$(magick "$INPUT" -format "%w" info:)
        HEIGHT=$(magick "$INPUT" -format "%h" info:)
        MAX_X=$((WIDTH - 1))
        MAX_Y=$((HEIGHT - 1))

        magick "$INPUT" \
            -fuzz 20% -fill none -draw "alpha 0,0 floodfill" \
            -fuzz 20% -fill none -draw "alpha ${MAX_X},0 floodfill" \
            -fuzz 20% -fill none -draw "alpha 0,${MAX_Y} floodfill" \
            -fuzz 20% -fill none -draw "alpha ${MAX_X},${MAX_Y} floodfill" \
            -trim +repage -strip \
            "$OUTPUT"
    fi
fi

# Verify result
FINAL_WIDTH=$(magick "$OUTPUT" -format "%w" info:)
FINAL_HEIGHT=$(magick "$OUTPUT" -format "%h" info:)
OPAQUE=$(magick "$OUTPUT" -format "%[opaque]" info:)

echo ""
echo "Output: $OUTPUT"
echo "Final size: ${FINAL_WIDTH}x${FINAL_HEIGHT}"
echo "Has transparency: $([ "$OPAQUE" = "False" ] && echo "Yes" || echo "No")"

if [[ "$OPAQUE" = "True" ]]; then
    echo "WARNING: Output has no transparency. Background removal may have failed."
    exit 1
fi

echo ""
echo "Success! Sprite processed with clean transparency."
