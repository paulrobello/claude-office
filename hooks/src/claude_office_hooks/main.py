#!/usr/bin/env python3
"""
Claude Office Hooks - Event handler for Claude Code lifecycle events.

CRITICAL: This hook must NEVER interfere with Claude Code:
- Never print to stdout (would inject context into Claude's conversation)
- Never print to stderr (would show errors to user)
- Always exit 0 (non-zero blocks Claude actions)

All output is suppressed and errors are logged to the debug file.
"""

import io
import sys

# Suppress ALL output immediately - before any imports that might fail
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()

# debug_logger defines DEBUG_LOG_PATH and is safe to import here because
# it never writes to stdout/stderr.

from claude_office_hooks.debug_logger import log_error  # noqa: E402

# Wrap ALL remaining logic in try/except to guarantee exit 0
try:
    import argparse
    import json
    import os
    import urllib.request
    from typing import Any, cast

    from claude_office_hooks.config import API_URL, TIMEOUT, load_config
    from claude_office_hooks.debug_logger import debug_log
    from claude_office_hooks.event_mapper import map_event

    __version__ = "0.11.0"

    # Load config at module init so DEBUG flag is available immediately
    _config = load_config()
    DEBUG = _config.get("CLAUDE_OFFICE_DEBUG", "0") == "1"

    def send_event(payload: dict[str, Any]) -> None:
        """POST *payload* as JSON to the backend API.

        Silently ignores all errors so the hook never blocks Claude.
        """
        try:
            json_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                API_URL, data=json_data, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                if response.status >= 300:
                    pass  # Silently fail — never disrupt the user
        except Exception:
            pass

    def main() -> None:
        """Parse arguments, read stdin, map the event, and POST to backend."""
        # Handle --version before argparse (which requires event_type positional arg)
        if "--version" in sys.argv or "-V" in sys.argv:
            real_stdout = sys.__stdout__
            if real_stdout is not None:
                real_stdout.write(f"claude-office-hook {__version__}\n")
                real_stdout.flush()
            sys.exit(0)

        parser = argparse.ArgumentParser(description="Claude Office hook event handler")
        parser.add_argument(
            "event_type",
            nargs="?",
            help="The type of event (session_start, pre_tool_use, etc.)",
        )
        parser.add_argument(
            "-V",
            "--version",
            action="version",
            version=f"claude-office-hook {__version__}",
        )
        parser.add_argument(
            "--strip-prefixes",
            type=str,
            default=None,
            help=(
                "Comma-separated list of prefixes to strip from project names. "
                "Example: --strip-prefixes '-Users-probello-Repos-,-Users-probello-'"
            ),
        )
        args = parser.parse_args()

        if not args.event_type:
            real_stderr = sys.__stderr__
            if real_stderr is not None:
                real_stderr.write("error: event_type is required\n")
                real_stderr.flush()
            sys.exit(1)

        # Resolve strip prefixes: CLI arg > env var > config file > built-in defaults
        strip_prefixes: list[str] | None = None
        prefixes_str = (
            args.strip_prefixes
            or os.environ.get("CLAUDE_OFFICE_STRIP_PREFIXES")
            or _config.get("CLAUDE_OFFICE_STRIP_PREFIXES")
        )
        if prefixes_str:
            strip_prefixes = [p.strip() for p in prefixes_str.split(",") if p.strip()]

        # Read event JSON from the real stdin (our suppressed sys.stdin is a StringIO)
        raw_data: dict[str, Any] = {}
        try:
            real_stdin = sys.__stdin__
            if (
                real_stdin is not None
                and not real_stdin.closed
                and hasattr(real_stdin, "isatty")
                and not real_stdin.isatty()
            ):
                raw_input = real_stdin.read()
                if raw_input.strip():
                    raw_data = cast(dict[str, Any], json.loads(raw_input))
        except Exception:
            pass

        session_id = os.environ.get("CLAUDE_SESSION_ID", "default")
        payload = map_event(args.event_type, raw_data, session_id, strip_prefixes)

        if payload is None:
            if DEBUG:
                debug_log(
                    args.event_type,
                    raw_data,
                    {"skipped": True, "reason": "event returns None"},
                    enabled=DEBUG,
                )
            return

        debug_log(args.event_type, raw_data, payload, enabled=DEBUG)
        send_event(payload)

    if __name__ == "__main__":
        try:
            main()
        except SystemExit:
            # argparse calls sys.exit() on --help / errors — let it propagate
            raise
        except Exception as e:
            log_error(e, "Error in main()")
        # ALWAYS exit 0 when run as script — never let the hook block Claude
        sys.exit(0)

except Exception as e:
    log_error(e, "Error during module initialization")
    sys.exit(0)  # Exit cleanly even on import errors
