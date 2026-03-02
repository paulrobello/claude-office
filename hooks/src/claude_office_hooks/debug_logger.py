"""Debug logging utilities for the Claude Office hooks.

IMPORTANT: This module must not produce any stdout/stderr output.
Output suppression is handled in main.py before this module is imported.

All diagnostic output goes to DEBUG_LOG_PATH (a file), never to stdout/stderr,
because writing to either of those streams would break Claude Code integration.
"""

import datetime
import json
import traceback
from pathlib import Path
from typing import Any

DEBUG_LOG_PATH = Path.home() / ".claude" / "claude-office-hooks.log"


def get_iso_timestamp() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.datetime.now(datetime.UTC).isoformat()


def log_error(error: Exception, context: str = "") -> None:
    """Write an exception with full traceback to the debug log file.

    This is the only place errors should be surfaced; it must never raise.

    Args:
        error: The exception that was caught.
        context: A short description of where / why the error occurred.
    """
    try:
        DEBUG_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        timestamp = get_iso_timestamp()
        with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"\n{'!' * 60}\n")
            f.write(f"[{timestamp}] ERROR: {context}\n")
            f.write(f"Exception: {type(error).__name__}: {error}\n")
            f.write("Traceback:\n")
            f.write(traceback.format_exc())
            f.write(f"{'!' * 60}\n")
    except Exception:
        # If we can't even log, silently continue — never block Claude
        pass


def debug_log(
    event_type: str,
    raw_data: dict[str, Any],
    payload: dict[str, Any] | None,
    *,
    enabled: bool,
) -> None:
    """Append a structured debug entry to the debug log file.

    Only writes when *enabled* is True (controlled by the CLAUDE_OFFICE_DEBUG
    config/env variable).

    Args:
        event_type: The Claude Code hook event name.
        raw_data: The raw JSON received from Claude Code on stdin.
        payload: The mapped payload that will be sent to the backend, or None
                 if the event was skipped.
        enabled: Whether debug logging is active.
    """
    if not enabled:
        return
    try:
        DEBUG_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"\n{'=' * 60}\n")
            f.write(f"[{get_iso_timestamp()}] Event: {event_type}\n")
            f.write("--- RAW INPUT FROM CLAUDE CODE ---\n")
            f.write(json.dumps(raw_data, indent=2, default=str))
            f.write("\n--- MAPPED PAYLOAD TO BACKEND ---\n")
            f.write(json.dumps(payload, indent=2, default=str))
            f.write(f"\n{'=' * 60}\n")
    except Exception:
        # Don't let logging break the hook
        pass
