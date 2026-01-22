#!/bin/bash
# Remove magenta/pink chroma key background from sprites
# Uses a multi-pass approach combining FFmpeg and ImageMagick for thorough cleanup
#
# Usage: remove_magenta.sh input.png output.png [--skip-trim] [--skip-ffmpeg]
#
# This script handles:
# 1. Bright magenta (#FF00FF) backgrounds
# 2. Anti-aliased edge pixels with pink fringing
# 3. Dark purple edge artifacts (common after chroma key removal)
#
# The workflow:
# - Step 1 (FFmpeg): Remove pixels where R≈B and G is low (purple/magenta hues)
# - Step 2 (ImageMagick): Catch remaining bright magenta shades
# - Step 3 (ImageMagick): Remove dark purple edge pixels
#
# Options:
#   --skip-trim    Don't trim transparent edges (useful for sprite sheets)
#   --skip-ffmpeg  Skip FFmpeg step (use if ffmpeg not available)

set -e

# Parse arguments
INPUT=""
OUTPUT=""
SKIP_TRIM=false
SKIP_FFMPEG=false

for arg in "$@"; do
    case $arg in
        --skip-trim)
            SKIP_TRIM=true
            ;;
        --skip-ffmpeg)
            SKIP_FFMPEG=true
            ;;
        *)
            if [[ -z "$INPUT" ]]; then
                INPUT="$arg"
            elif [[ -z "$OUTPUT" ]]; then
                OUTPUT="$arg"
            fi
            ;;
    esac
done

if [[ -z "$INPUT" || -z "$OUTPUT" ]]; then
    echo "Usage: $0 input.png output.png [--skip-trim] [--skip-ffmpeg]"
    echo ""
    echo "Removes magenta chroma key background using multi-pass cleanup."
    echo ""
    echo "Options:"
    echo "  --skip-trim    Don't trim transparent edges (for sprite sheets)"
    echo "  --skip-ffmpeg  Skip FFmpeg step (slower but works without ffmpeg)"
    exit 1
fi

if [[ ! -f "$INPUT" ]]; then
    echo "Error: Input file not found: $INPUT"
    exit 1
fi

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "Processing: $INPUT"
echo "Output: $OUTPUT"

# Get input dimensions
DIMS=$(magick "$INPUT" -format "%wx%h" info:)
echo "Dimensions: $DIMS"

CURRENT="$INPUT"

# Step 1: FFmpeg geq filter - remove purple/magenta hue pixels
# Targets pixels where R≈B (within 60) and G is low relative to R and B
if [[ "$SKIP_FFMPEG" == false ]] && command -v ffmpeg &> /dev/null; then
    echo "Step 1: FFmpeg purple hue removal..."
    STEP1="$TEMP_DIR/step1.png"

    ffmpeg -y -i "$CURRENT" \
        -vf "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(between(r(X,Y)-b(X,Y),-60,60)*lt(g(X,Y),r(X,Y)*0.7)*lt(g(X,Y),b(X,Y)*0.7)*gt(r(X,Y)+b(X,Y),100),0,alpha(X,Y))'" \
        -update 1 -frames:v 1 "$STEP1" 2>/dev/null

    CURRENT="$STEP1"
    echo "  Done"
else
    if [[ "$SKIP_FFMPEG" == false ]]; then
        echo "Step 1: Skipping (ffmpeg not found)"
    else
        echo "Step 1: Skipping (--skip-ffmpeg)"
    fi
fi

# Step 2: ImageMagick - remove remaining bright magenta shades
echo "Step 2: ImageMagick magenta removal..."
STEP2="$TEMP_DIR/step2.png"

magick "$CURRENT" \
    -alpha set -channel RGBA \
    -fuzz 20% -transparent "magenta" \
    -fuzz 15% -transparent "#CC00CC" \
    -fuzz 15% -transparent "#AA00AA" \
    -fuzz 15% -transparent "#880088" \
    -fuzz 15% -transparent "#660066" \
    "$STEP2"

CURRENT="$STEP2"
echo "  Done"

# Step 3: ImageMagick - remove dark purple edge pixels
# These are often left behind after the main removal (values like 32,0,31)
echo "Step 3: ImageMagick dark purple edge cleanup..."
STEP3="$TEMP_DIR/step3.png"

magick "$CURRENT" \
    -fuzz 8% -fill none \
    -opaque "rgb(32,0,31)" \
    -opaque "rgb(34,0,31)" \
    -opaque "rgb(30,0,29)" \
    -opaque "rgb(35,0,32)" \
    -opaque "rgb(28,0,27)" \
    -opaque "rgb(40,0,38)" \
    "$STEP3"

CURRENT="$STEP3"
echo "  Done"

# Step 4: Optional trim and final output
echo "Step 4: Finalizing..."
if [[ "$SKIP_TRIM" == true ]]; then
    magick "$CURRENT" -strip "$OUTPUT"
else
    magick "$CURRENT" -trim +repage -strip "$OUTPUT"
fi
echo "  Done"

# Verify result
FINAL_DIMS=$(magick "$OUTPUT" -format "%wx%h" info:)
OPAQUE=$(magick "$OUTPUT" -format "%[opaque]" info:)

echo ""
echo "Result:"
echo "  Size: $FINAL_DIMS"
echo "  Has transparency: $([ "$OPAQUE" = "False" ] && echo "Yes" || echo "No")"

if [[ "$OPAQUE" = "True" ]]; then
    echo ""
    echo "WARNING: Output has no transparency. Background removal may have failed."
    exit 1
fi

echo ""
echo "Success! Magenta background removed."
