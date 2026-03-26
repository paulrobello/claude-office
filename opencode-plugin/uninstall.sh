#!/bin/bash
set -e

# ---------------------------------------------------------------------------
# uninstall.sh — Remove the opencode-claude-office plugin from OpenCode
#
# Removes the symlink from ~/.config/opencode/plugins/
# ---------------------------------------------------------------------------

PLUGINS_DIR="${OPENCODE_PLUGINS_DIR:-$HOME/.config/opencode/plugins}"
LINK_NAME="claude-office.js"

echo "Uninstalling opencode-claude-office plugin..."

if [ -e "$PLUGINS_DIR/$LINK_NAME" ]; then
    rm -f "$PLUGINS_DIR/$LINK_NAME"
    echo "Removed: $PLUGINS_DIR/$LINK_NAME"
else
    echo "Plugin not found at $PLUGINS_DIR/$LINK_NAME (already uninstalled?)"
fi

echo ""
echo "Done! Restart OpenCode to apply changes."
