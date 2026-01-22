#!/bin/bash
# Process a desk accessory sprite for tinting
# Removes chroma key background, converts to grayscale, and scales down for game use
#
# Usage: process_tintable.sh input.png output.png [fuzz_percent] [brightness] [target_size]
#
# Arguments:
#   input.png       - Input image with chroma key background
#   output.png      - Output grayscale image with transparency
#   fuzz_percent    - Color matching tolerance (default: 15)
#   brightness      - Brightness adjustment 100=normal (default: 140)
#   target_size     - Target size in pixels (default: 128, use 0 to skip scaling)
#                     Desk accessories render at 0.025-0.1 scale, so 128px is ideal
#
# Examples:
#   process_tintable.sh mug.png coffee-mug.png              # Default: 128px output
#   process_tintable.sh stapler.png stapler.png 20 130      # Custom fuzz/brightness
#   process_tintable.sh lamp.png lamp.png 15 140 192        # Larger output for detailed items
#   process_tintable.sh item.png item.png 15 140 0          # Skip scaling (keep original size)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_SCRIPTS="$SCRIPT_DIR/../../shared/scripts"

INPUT="${1:?Usage: process_tintable.sh input.png output.png [fuzz_percent] [brightness] [target_size]}"
OUTPUT="${2:?Usage: process_tintable.sh input.png output.png [fuzz_percent] [brightness] [target_size]}"
FUZZ_PERCENT="${3:-15}"
BRIGHTNESS="${4:-140}"
TARGET_SIZE="${5:-128}"

# Check if input exists
if [[ ! -f "$INPUT" ]]; then
    echo "Error: Input file '$INPUT' not found"
    exit 1
fi

# Check if ImageMagick is available
if ! command -v magick &> /dev/null; then
    echo "Error: ImageMagick 'magick' command not found"
    echo "Install with: brew install imagemagick"
    exit 1
fi

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "Processing desk accessory: $INPUT"
echo "  Fuzz: $FUZZ_PERCENT%"
echo "  Brightness: $BRIGHTNESS%"
if [[ "$TARGET_SIZE" -gt 0 ]]; then
    echo "  Target size: ${TARGET_SIZE}px"
else
    echo "  Target size: (no scaling)"
fi

# Get original dimensions
ORIG_DIMS=$(magick "$INPUT" -format "%wx%h" info:)
echo "  Original size: $ORIG_DIMS"

# Step 1: Remove magenta background using improved multi-pass method
STEP1="$TEMP_DIR/step1.png"
if [[ -x "$SHARED_SCRIPTS/remove_magenta.sh" ]]; then
    echo ""
    echo "Removing magenta background (multi-pass method)..."
    "$SHARED_SCRIPTS/remove_magenta.sh" "$INPUT" "$STEP1" --skip-trim 2>&1 | sed 's/^/  /'
else
    echo ""
    echo "Removing magenta background (legacy method)..."
    # Fallback: Detect actual background color and use global transparent
    BG_COLOR=$(magick "$INPUT" -format "%[pixel:p{0,0}]" info:)
    echo "  Detected background: $BG_COLOR"
    magick "$INPUT" -fuzz "${FUZZ_PERCENT}%" -transparent "$BG_COLOR" "$STEP1"
fi

# Step 2: Desaturate, brighten, scale, and ensure RGBA
echo ""
echo "Applying grayscale, brightness, and scaling..."
if [[ "$TARGET_SIZE" -gt 0 ]]; then
    magick "$STEP1" \
        -modulate "${BRIGHTNESS},0,100" \
        -trim +repage \
        -filter Point -resize "${TARGET_SIZE}x${TARGET_SIZE}>" \
        -type TrueColorAlpha \
        -strip \
        "$OUTPUT"
else
    magick "$STEP1" \
        -modulate "${BRIGHTNESS},0,100" \
        -type TrueColorAlpha \
        -trim +repage \
        -strip \
        "$OUTPUT"
fi

# Get final info
FINAL_DIMS=$(magick "$OUTPUT" -format "%wx%h" info:)
CHANNELS=$(magick "$OUTPUT" -format "%[channels]" info:)
OPAQUE=$(magick "$OUTPUT" -format "%[opaque]" info:)

echo ""
echo "Result: $OUTPUT"
echo "  Final size: $FINAL_DIMS"
echo "  Channels: $CHANNELS"

if [[ "$OPAQUE" == "False" ]]; then
    echo "  Transparency: Yes"
    echo ""
    echo "Success: Ready for tinting in PixiJS"
else
    echo "  Transparency: No"
    echo ""
    echo "Warning: Image may not have proper transparency"
    echo "  Try increasing fuzz percentage (current: $FUZZ_PERCENT%)"
fi

if [[ "$CHANNELS" != *"srgba"* && "$CHANNELS" != *"rgba"* ]]; then
    echo ""
    echo "Warning: Image is not in RGBA format (channels: $CHANNELS)"
    echo "  This may cause rendering issues in PixiJS"
fi
