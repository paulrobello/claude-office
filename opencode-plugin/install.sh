#!/bin/bash
set -e

# ---------------------------------------------------------------------------
# install.sh — Install the opencode-claude-office plugin for OpenCode
#
# What this does:
#   1. Builds the plugin (bun install + tsc)
#   2. Symlinks the built JS into ~/.config/opencode/plugins/ so OpenCode
#      auto-loads it at startup (the "local file plugin" approach)
# ---------------------------------------------------------------------------

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGINS_DIR="${OPENCODE_PLUGINS_DIR:-$HOME/.config/opencode/plugins}"
LINK_NAME="claude-office.js"

echo "Installing opencode-claude-office plugin..."
echo "  Plugin dir:  $PLUGIN_DIR"
echo "  Target:      $PLUGINS_DIR/$LINK_NAME"

# --- Prerequisites ---

if ! command -v bun &> /dev/null; then
    echo "Error: 'bun' is not installed. Please install it first: https://bun.sh"
    exit 1
fi

# --- Build the plugin ---

echo ""
echo "Building plugin..."
cd "$PLUGIN_DIR"
bun install
bun run build

echo "Build successful."

# --- Symlink into OpenCode's global plugins directory ---

echo ""
echo "Installing plugin to $PLUGINS_DIR..."
mkdir -p "$PLUGINS_DIR"

# Remove existing link/file if present
rm -f "$PLUGINS_DIR/$LINK_NAME"

# Create symlink to the built output
ln -s "$PLUGIN_DIR/dist/index.js" "$PLUGINS_DIR/$LINK_NAME"

echo "Symlink created: $PLUGINS_DIR/$LINK_NAME -> $PLUGIN_DIR/dist/index.js"

echo ""
echo "Done! The plugin is installed."
echo ""
echo "To use it:"
echo "  1. Start the claude-office backend:  cd $(dirname "$PLUGIN_DIR") && make dev"
echo "  2. Open http://localhost:3000 in your browser"
echo "  3. Restart OpenCode — events will flow automatically"
echo ""
echo "Environment variables (optional):"
echo "  CLAUDE_OFFICE_API_URL     — Backend URL (default: http://localhost:8000/api/v1/events)"
echo "  CLAUDE_OFFICE_TIMEOUT_MS  — HTTP timeout ms (default: 1500)"
echo "  CLAUDE_OFFICE_DEBUG=1     — Enable debug logging to stderr"
