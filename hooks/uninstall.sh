#!/bin/bash
set -e

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Use the command name directly for cross-platform compatibility
HOOK_CMD="claude-office-hook"

echo "Uninstalling hooks..."

# Use the python script to remove settings
uv run -p 3.14 "$HOOKS_DIR/manage_hooks.py" uninstall --hook-cmd "$HOOK_CMD"

echo "Done! Hooks removed from configuration."
