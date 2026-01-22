#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
from typing import Any

# Constants
HOOK_TYPES = [
    "SessionStart",
    "SessionEnd",
    "PreToolUse",
    "PostToolUse",
    "UserPromptSubmit",
    "PermissionRequest",
    "Notification",
    "Stop",
    "SubagentStart",
    "SubagentStop",
    "PreCompact",
]


def get_settings_path() -> Path:
    """Get the path to the Claude settings file."""
    # Priority: Env var -> ~/.claude/settings.json
    if os.environ.get("CLAUDE_CONFIG_DIR"):
        return Path(os.environ["CLAUDE_CONFIG_DIR"]) / "settings.json"
    return Path.home() / ".claude" / "settings.json"


def load_settings(path: Path) -> dict[str, Any]:
    """Load settings from JSON file."""
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        print(f"Warning: Could not parse {path}. Starting with empty settings.")
        return {}


def save_settings(path: Path, settings: dict[str, Any]) -> None:
    """Save settings to JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)


def create_hook_config(hook_cmd: str, hook_type: str) -> dict[str, Any]:
    """Create the hook configuration dictionary.

    Args:
        hook_cmd: Path to the claude-office-hook command
        hook_type: The hook type in PascalCase (e.g., "PreToolUse")
    """
    # Convert PascalCase to snake_case for the event type argument
    event_type = convert_camel_to_snake(hook_type)

    config = {
        "type": "command",
        "command": f"{hook_cmd} {event_type}",
        "timeout": 2,  # Seconds
    }

    # Wrap in the structure expected by Claude Code
    # Structure:
    # "HookName": [
    #   {
    #     "matcher": ".*" (optional),
    #     "hooks": [ { "type": "command", ... } ]
    #   }
    # ]

    hook_entry: dict[str, Any] = {"hooks": [config]}

    # Hooks that support matchers (match all with ".*")
    if hook_type in [
        "PreToolUse",
        "PostToolUse",
        "PermissionRequest",
        "Notification",
        "SubagentStart",
        "SubagentStop",
    ]:
        hook_entry["matcher"] = ".*"

    return hook_entry


def is_same_hook(entry1: dict[str, Any], entry2: dict[str, Any]) -> bool:
    """Check if two hook entries are effectively the same."""
    # Simple comparison of command path
    try:
        cmd1 = entry1.get("hooks", [])[0].get("command")
        cmd2 = entry2.get("hooks", [])[0].get("command")
        return cmd1 == cmd2
    except (IndexError, AttributeError):
        return False


def install_hooks(hook_cmd: str, dry_run: bool = False):
    """Install hooks into settings.

    Args:
        hook_cmd: Path to the claude-office-hook command
        dry_run: If True, don't actually save changes
    """
    settings_path = get_settings_path()
    print(f"Installing hooks to {settings_path}...")

    settings = load_settings(settings_path)
    hooks_config = settings.get("hooks", {})

    changes_made = False

    for hook_type in HOOK_TYPES:
        new_entry = create_hook_config(hook_cmd, hook_type)
        event_type = convert_camel_to_snake(hook_type)

        current_list = hooks_config.get(hook_type, [])

        # Check for duplicates
        if any(is_same_hook(existing, new_entry) for existing in current_list):
            print(f"  [Skip] {hook_type}: Hook already exists.")
            continue

        print(f"  [Add]  {hook_type}: {hook_cmd} {event_type}")
        current_list.append(new_entry)
        hooks_config[hook_type] = current_list
        changes_made = True

    if changes_made:
        settings["hooks"] = hooks_config
        if not dry_run:
            save_settings(settings_path, settings)
            print("Settings saved.")
        else:
            print("Dry run: No changes saved.")
    else:
        print("No changes needed.")


def uninstall_hooks(_hook_cmd: str, dry_run: bool = False) -> None:
    """Remove hooks from settings.

    Args:
        _hook_cmd: Path to the claude-office-hook command (unused, hooks identified by pattern)
        dry_run: If True, don't actually save changes
    """
    del _hook_cmd  # Unused - hooks identified by pattern match
    settings_path = get_settings_path()
    print(f"Uninstalling hooks from {settings_path}...")

    settings = load_settings(settings_path)
    hooks_config = settings.get("hooks", {})

    changes_made = False

    for hook_type in HOOK_TYPES:
        if hook_type not in hooks_config:
            continue

        current_list = hooks_config[hook_type]
        original_len = len(current_list)

        # Filter out hooks that use our command (both new direct and old .sh wrappers)
        new_list: list[Any] = []
        for entry in current_list:
            try:
                cmd = entry.get("hooks", [])[0].get("command", "")
                # Match both "claude-office-hook" (new) and "claude-office/hooks/*.sh" (old)
                if "claude-office-hook" in cmd or "claude-office/hooks/" in cmd:
                    print(f"  [Remove] {hook_type}: {cmd}")
                    continue
            except (IndexError, AttributeError):
                pass
            new_list.append(entry)

        if len(new_list) < original_len:
            hooks_config[hook_type] = new_list
            changes_made = True

        # Clean up empty lists
        if not hooks_config[hook_type]:
            del hooks_config[hook_type]

    if changes_made:
        settings["hooks"] = hooks_config
        if not dry_run:
            save_settings(settings_path, settings)
            print("Settings saved.")
        else:
            print("Dry run: No changes saved.")
    else:
        print("No hooks found to remove.")


def convert_camel_to_snake(name: str) -> str:
    import re

    s1 = re.sub("(.)([A-Z][a-z]+)", r"\1_\2", name)
    return re.sub("([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


def main():
    parser = argparse.ArgumentParser(description="Manage Claude Office hooks.")
    parser.add_argument("action", choices=["install", "uninstall"], help="Action to perform")
    parser.add_argument("--dry-run", action="store_true", help="Don't save changes")
    parser.add_argument("--hook-cmd", help="Path to claude-office-hook command", required=True)

    args = parser.parse_args()

    if args.action == "install":
        install_hooks(args.hook_cmd, args.dry_run)
    elif args.action == "uninstall":
        uninstall_hooks(args.hook_cmd, args.dry_run)


if __name__ == "__main__":
    main()
