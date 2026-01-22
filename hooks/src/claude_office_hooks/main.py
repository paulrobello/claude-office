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

# Debug log path - defined early so we can log errors during import
from pathlib import Path  # noqa: E402

DEBUG_LOG_PATH = Path.home() / ".claude" / "claude-office-hooks.log"


def _log_error(error: Exception, context: str = "") -> None:
    """Log an error to the debug file. Used for catching unexpected failures."""
    try:
        import datetime
        import traceback

        DEBUG_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.datetime.now(datetime.UTC).isoformat()
        with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"\n{'!' * 60}\n")
            f.write(f"[{timestamp}] ERROR: {context}\n")
            f.write(f"Exception: {type(error).__name__}: {error}\n")
            f.write("Traceback:\n")
            f.write(traceback.format_exc())
            f.write(f"{'!' * 60}\n")
    except Exception:
        # If we can't even log, just silently continue
        pass


# Wrap ALL remaining logic in try/except
try:
    import argparse
    import datetime
    import json
    import os
    import urllib.request
    from typing import Any, cast

    # Configuration
    API_URL = "http://localhost:8000/api/v1/events"
    TIMEOUT = 0.5  # Seconds
    CONFIG_FILE = Path.home() / ".claude" / "claude-office-config.env"

    def load_config() -> dict[str, str]:
        """Load configuration from the config file."""
        config: dict[str, str] = {}
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            key, _, value = line.partition("=")
                            # Remove quotes from value
                            value = value.strip().strip('"').strip("'")
                            config[key.strip()] = value
            except Exception:
                pass
        return config

    # Load config at module init
    _config = load_config()
    DEBUG = _config.get("CLAUDE_OFFICE_DEBUG", "0") == "1"

    def get_iso_timestamp() -> str:
        return datetime.datetime.now(datetime.UTC).isoformat()

    # Prefixes to strip from project names (customize as needed)
    STRIP_PREFIXES = ["-Users-probello-Repos-", "-Users-probello-"]

    def get_project_name(raw_data: dict[str, Any], strip_prefixes: list[str] | None = None) -> str:
        """
        Get project name from Claude transcript path, stripping common prefixes.

        Claude stores transcripts at: ~/.claude/projects/PROJECT_NAME/session.jsonl
        The PROJECT_NAME often has path-like prefixes that we want to remove.
        """
        transcript_path = raw_data.get("transcript_path", "")

        if transcript_path:
            # Path format: ~/.claude/projects/PROJECT_NAME/session.jsonl
            path_obj = Path(transcript_path).expanduser()
            parts = path_obj.parts

            # Look for 'projects' in the path and get the next part as project name
            try:
                projects_index = parts.index("projects")
                if projects_index + 1 < len(parts):
                    raw_project_name = parts[projects_index + 1]

                    # Clean up the project name by removing prefixes if specified
                    project_name = raw_project_name
                    prefixes = strip_prefixes or STRIP_PREFIXES
                    if prefixes:
                        # Sort prefixes by length (largest first) to apply longest matching prefix
                        sorted_prefixes = sorted(prefixes, key=len, reverse=True)

                        for prefix in sorted_prefixes:
                            if project_name.startswith(prefix):
                                project_name = project_name[len(prefix) :]
                                break  # Apply only the first (longest) matching prefix

                    return project_name
            except (ValueError, IndexError):
                pass  # Fall through to fallback

        # Fallback: try to get from cwd in raw_data
        cwd = raw_data.get("cwd", "")
        if cwd:
            return Path(cwd).name

        return "unknown"

    def debug_log(
        event_type: str, raw_data: dict[str, Any], payload: dict[str, Any] | None
    ) -> None:
        """Log debug information to a file for troubleshooting."""
        if not DEBUG:
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

    def map_event(
        event_type: str,
        raw_data: dict[str, Any],
        session_id: str,
        strip_prefixes: list[str] | None = None,
    ) -> dict[str, Any] | None:
        """
        Maps raw Claude Code hook data to the backend Event model.

        Claude Code hook data structure:
        - session_id: unique session identifier
        - tool_name: name of tool being used (Bash, Write, Edit, Read, Task, etc.)
        - tool_input: dict with tool-specific parameters
        - tool_use_id: unique ID for this tool invocation
        - tool_response: (PostToolUse only) result from tool execution
        """
        # Use session_id from raw_data (Claude Code provides this), fallback to param
        actual_session_id = raw_data.get("session_id") or session_id or "unknown_session"

        # Extract project name from transcript path
        project_name = get_project_name(raw_data, strip_prefixes)

        # CLAUDE_PROJECT_DIR is the reliable project root where Claude was launched
        # This does NOT change even if Claude uses `cd` during execution
        project_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")

        # cwd is the current working directory - CAN change if Claude uses `cd`
        working_dir = raw_data.get("cwd", "")

        # Always pass transcript_path when available for response extraction
        transcript_path = raw_data.get("transcript_path")

        # Build data dict separately for proper typing
        data: dict[str, Any] = {
            "project_name": project_name,  # Derived from transcript path
            "project_dir": project_dir,  # Stable project root from env (preferred)
            "working_dir": working_dir,  # Current working dir (may differ from project_dir)
            "transcript_path": transcript_path,  # For Claude response extraction
        }

        payload: dict[str, Any] = {
            "event_type": event_type,
            "session_id": actual_session_id,
            "timestamp": get_iso_timestamp(),
            "data": data,
        }

        # Common fields extraction
        if "tool_use_id" in raw_data:
            data["tool_use_id"] = raw_data["tool_use_id"]

        # Event-specific mapping
        if event_type == "session_start":
            # Raw data contains: source (startup, resume, clear, compact)
            source = raw_data.get("source", "unknown")
            data["summary"] = f"Session started ({source})"

        elif event_type == "pre_compact":
            # Context compaction is about to happen - send as context_compaction event
            payload["event_type"] = "context_compaction"
            data["summary"] = "Context window compacting"

        elif event_type == "pre_tool_use":
            # Claude Code sends: tool_name, tool_input, tool_use_id
            data["tool_name"] = raw_data.get("tool_name")
            data["tool_input"] = raw_data.get("tool_input")
            data["tool_use_id"] = raw_data.get("tool_use_id")

            # Heuristic: Task tool means a subagent is starting
            if data["tool_name"] == "Task":
                payload["event_type"] = "subagent_start"
                data["agent_id"] = f"subagent_{data.get('tool_use_id', 'unknown')}"
                tool_input_raw = raw_data.get("tool_input", {})
                if isinstance(tool_input_raw, dict):
                    # Cast to proper type after isinstance check
                    tool_input = cast(dict[str, Any], tool_input_raw)
                    # Extract clean fields from Task tool input
                    description: str = tool_input.get("description", "")
                    prompt: str = tool_input.get("prompt", "")
                    agent_type: str = tool_input.get("subagent_type", "")
                    # Use description as agent name (short 3-5 word summary)
                    if description:
                        data["agent_name"] = description
                    # Use prompt as task description (full task details)
                    data["task_description"] = prompt if prompt else description
                    if agent_type:
                        data["agent_type"] = agent_type
                else:
                    # tool_input is not a dict (maybe a string?) - use as-is
                    data["task_description"] = str(tool_input_raw) if tool_input_raw else ""
                # Remove raw tool_input - we've extracted what we need
                del data["tool_input"]
            else:
                data["agent_id"] = "main"

        elif event_type == "post_tool_use":
            # Claude Code sends: tool_name, tool_input, tool_response, tool_use_id
            data["tool_name"] = raw_data.get("tool_name")
            data["tool_input"] = raw_data.get("tool_input")  # Needed for heat map tracking
            data["success"] = True  # PostToolUse only fires on success
            data["tool_use_id"] = raw_data.get("tool_use_id")

            # Task tool completions → subagent_stop (for synchronous agents only)
            # Background agents fire PostToolUse immediately but continue running;
            # we must wait for native SubagentStop for those.
            if data["tool_name"] == "Task":
                tool_input_raw = raw_data.get("tool_input", {})
                is_background = False
                if isinstance(tool_input_raw, dict):
                    is_background = bool(tool_input_raw.get("run_in_background"))

                if is_background:
                    # Background agent - skip subagent_stop from PostToolUse
                    # Let native SubagentStop handle the actual completion
                    data["agent_id"] = "main"
                else:
                    # Synchronous agent - send subagent_stop now
                    payload["event_type"] = "subagent_stop"
                    data["agent_id"] = f"subagent_{data.get('tool_use_id', 'unknown')}"
                    # Extract result from tool_response if available
                    tool_response_raw = raw_data.get("tool_response", {})
                    if isinstance(tool_response_raw, dict):
                        tool_response = cast(dict[str, Any], tool_response_raw)
                        data["result"] = tool_response.get("content", [])
                        native_agent_id: str | None = tool_response.get("agentId")
                        data["native_agent_id"] = native_agent_id

                        # Construct agent_transcript_path from main transcript_path and agentId
                        # Main: ~/.claude/projects/{PROJECT}/{SESSION}.jsonl
                        # Subagent: ~/.claude/projects/{PROJECT}/{SESSION}/
                        #   subagents/agent-{agentId}.jsonl
                        main_transcript = data.get("transcript_path") or transcript_path
                        if main_transcript and native_agent_id:
                            # Remove .jsonl extension to get session directory path
                            session_dir = main_transcript.rsplit(".jsonl", 1)[0]
                            data["agent_transcript_path"] = (
                                f"{session_dir}/subagents/agent-{native_agent_id}.jsonl"
                            )
            else:
                data["agent_id"] = "main"
            # Note: thinking extraction moved to backend (reads from transcript_path)

        elif event_type == "subagent_start":
            # Native SubagentStart hook from Claude Code
            # Note: The pre_tool_use handler for Task already creates subagent_start
            # with full task details (description, prompt, etc). The native hook
            # fires slightly later with the real agent_id but lacks task details.
            #
            # However, native SubagentStart provides the native agent_id which we
            # need to construct the subagent's transcript path for polling.
            # Send this as a "subagent_info" event to update the existing agent.
            native_agent_id = raw_data.get("agent_id")
            if native_agent_id:
                payload["event_type"] = "subagent_info"
                data["native_agent_id"] = native_agent_id
                data["agent_type"] = raw_data.get("agent_type")

                # Construct agent_transcript_path from main transcript_path and agent_id
                main_transcript = data.get("transcript_path") or transcript_path
                if main_transcript:
                    session_dir = main_transcript.rsplit(".jsonl", 1)[0]
                    data["agent_transcript_path"] = (
                        f"{session_dir}/subagents/agent-{native_agent_id}.jsonl"
                    )
            else:
                return None  # Skip if no agent_id provided

        elif event_type == "subagent_stop":
            # Native SubagentStop - fires when subagent actually completes
            # This is especially important for background agents where post_tool_use Task
            # fires immediately but the agent continues running
            native_agent_id = raw_data.get("agent_id")
            if native_agent_id:
                data["native_agent_id"] = native_agent_id
                # Construct agent_transcript_path from main transcript_path and agent_id
                agent_transcript = raw_data.get("agent_transcript_path")
                if agent_transcript:
                    data["agent_transcript_path"] = agent_transcript
                elif transcript_path:
                    session_dir = transcript_path.rsplit(".jsonl", 1)[0]
                    data["agent_transcript_path"] = (
                        f"{session_dir}/subagents/agent-{native_agent_id}.jsonl"
                    )
            else:
                return None  # Skip if no agent_id provided

        elif event_type == "user_prompt_submit":
            # User submitted a new prompt - boss receives instructions
            prompt = raw_data.get("prompt", "")
            # Truncate long prompts for display
            if len(prompt) > 50:
                prompt = prompt[:47] + "..."
            data["prompt"] = prompt
            data["summary"] = f"User: {prompt}" if prompt else "User submitted prompt"

        elif event_type == "permission_request":
            # Claude needs permission for a tool - show waiting state
            data["tool_name"] = raw_data.get("tool_name")
            data["tool_input"] = raw_data.get("tool_input")
            data["tool_use_id"] = raw_data.get("tool_use_id")
            # Determine if this is for main agent or a subagent
            # For now, assume main unless we can correlate with active subagent
            data["agent_id"] = "main"

        elif event_type == "notification":
            data["notification_type"] = raw_data.get("type")
            data["message"] = raw_data.get("message")

        elif event_type == "stop":
            pass

        elif event_type == "session_end":
            data["reason"] = raw_data.get("reason")

        return payload

    def send_event(payload: dict[str, Any]) -> None:
        try:
            json_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                API_URL, data=json_data, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                if response.status >= 300:
                    # Silently fail in hook to not disrupt user
                    pass
        except Exception:
            # Ignore errors to prevent blocking/breaking Claude
            pass

    __version__ = "0.5.0"

    def main() -> None:
        # Check for --version before argparse (which requires event_type)
        if "--version" in sys.argv or "-V" in sys.argv:
            # Restore real stdout for version output
            real_stdout = sys.__stdout__
            if real_stdout is not None:
                real_stdout.write(f"claude-office-hook {__version__}\n")
                real_stdout.flush()
            sys.exit(0)

        parser = argparse.ArgumentParser(description="Claude Office hook event handler")
        parser.add_argument(
            "event_type",
            nargs="?",  # Make optional so --version works without it
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
            help="Comma-separated list of prefixes to strip from project names. "
            "Example: --strip-prefixes '-Users-probello-Repos-,-Users-probello-'",
        )
        args = parser.parse_args()

        # Require event_type for normal operation
        if not args.event_type:
            # Restore stderr for error message
            real_stderr = sys.__stderr__
            if real_stderr is not None:
                real_stderr.write("error: event_type is required\n")
                real_stderr.flush()
            sys.exit(1)

        # Parse strip prefixes: CLI arg > env var > config file > defaults
        strip_prefixes: list[str] | None = None
        prefixes_str = (
            args.strip_prefixes
            or os.environ.get("CLAUDE_OFFICE_STRIP_PREFIXES")
            or _config.get("CLAUDE_OFFICE_STRIP_PREFIXES")
        )
        if prefixes_str:
            strip_prefixes = [p.strip() for p in prefixes_str.split(",") if p.strip()]

        # Read stdin - use the real stdin, not our suppressed version
        raw_data: dict[str, Any] = {}
        try:
            # Restore real stdin for reading
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

        # Try to find a session ID from environment or raw data
        # Claude Code provides session_id in the hook JSON data
        session_id = os.environ.get("CLAUDE_SESSION_ID", "default")

        payload = map_event(args.event_type, raw_data, session_id, strip_prefixes)

        # Skip events that return None (e.g., raw SubagentStop which has mismatched agent_id)
        if payload is None:
            if DEBUG:
                debug_log(
                    args.event_type,
                    raw_data,
                    {"skipped": True, "reason": "event returns None"},
                )
            return

        # Log for debugging
        debug_log(args.event_type, raw_data, payload)

        send_event(payload)

    if __name__ == "__main__":
        try:
            main()
        except SystemExit:
            # argparse calls sys.exit() on errors - catch and ignore
            pass
        except Exception as e:
            _log_error(e, "Error in main()")
        # ALWAYS exit 0 when run as script - never let the hook block Claude
        sys.exit(0)

except Exception as e:
    # Log any import or module-level errors
    _log_error(e, "Error during module initialization")
    sys.exit(0)  # Exit cleanly even on import errors
