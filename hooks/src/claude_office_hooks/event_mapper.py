"""Event mapping logic for the Claude Office hooks.

Maps raw Claude Code hook payloads (received on stdin as JSON) to the
structured Event model expected by the claude-office backend API.

IMPORTANT: This module must not produce any stdout/stderr output.
Output suppression is handled in main.py before this module is imported.
"""

import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, cast

from claude_office_hooks.config import STRIP_PREFIXES
from claude_office_hooks.debug_logger import get_iso_timestamp


def get_project_name(raw_data: dict[str, Any], strip_prefixes: list[str] | None = None) -> str:
    """Derive a human-readable project name from the Claude transcript path.

    Claude stores transcripts at::

        ~/.claude/projects/PROJECT_NAME/session.jsonl

    The PROJECT_NAME is derived from the filesystem path where Claude was
    launched (with slashes replaced by dashes), which often produces long
    path-like strings.  This function strips common prefixes to yield a
    short, readable project name.

    Args:
        raw_data: The raw hook JSON data from Claude Code.
        strip_prefixes: Path prefixes to remove.  Defaults to STRIP_PREFIXES.

    Returns:
        A short project name string, or ``"unknown"`` when it cannot be
        determined.
    """
    transcript_path = raw_data.get("transcript_path", "")

    if transcript_path:
        path_obj = Path(transcript_path).expanduser()
        parts = path_obj.parts

        try:
            projects_index = parts.index("projects")
            if projects_index + 1 < len(parts):
                raw_project_name = parts[projects_index + 1]

                project_name = raw_project_name
                prefixes = strip_prefixes or STRIP_PREFIXES
                if prefixes:
                    # Apply the longest matching prefix first
                    sorted_prefixes: list[str] = sorted(prefixes, key=len, reverse=True)
                    for prefix in sorted_prefixes:
                        if project_name.startswith(prefix):
                            project_name = project_name[len(prefix):]
                            break

                return project_name
        except (ValueError, IndexError):
            pass  # Fall through to cwd fallback

    cwd = raw_data.get("cwd", "")
    if cwd:
        return Path(cwd).name

    return "unknown"


def _build_agent_transcript_path(main_transcript: str | None, native_agent_id: str) -> str | None:
    """Construct the subagent transcript path from the main transcript path.

    Main transcript:   ~/.claude/projects/{PROJECT}/{SESSION}.jsonl
    Subagent transcript: ~/.claude/projects/{PROJECT}/{SESSION}/subagents/agent-{id}.jsonl

    Args:
        main_transcript: Absolute path to the main session transcript.
        native_agent_id: The native agent ID provided by Claude Code.

    Returns:
        The constructed subagent transcript path, or None when the main
        transcript path is unavailable.
    """
    if not main_transcript:
        return None
    session_dir = main_transcript.rsplit(".jsonl", 1)[0]
    return f"{session_dir}/subagents/agent-{native_agent_id}.jsonl"


_RALPH_ENV_MAP = {
    "RALPH_RUN_ID": "run_id",
    "RALPH_ROLE": "ralph_role",
    "RALPH_TASK_ID": "ralph_task_id",
    "RALPH_PRIMARY_REPO": "primary_repo",
}


def _handle_session_start(raw_data: dict[str, Any], data: dict[str, Any]) -> None:
    """Populate *data* for a session_start event."""
    source = raw_data.get("source", "unknown")
    data["summary"] = f"Session started ({source})"
    for env_key, data_key in _RALPH_ENV_MAP.items():
        value = os.environ.get(env_key)
        if value:
            data[data_key] = value


def _handle_pre_compact(payload: dict[str, Any], data: dict[str, Any]) -> None:
    """Remap a pre_compact event to context_compaction."""
    payload["event_type"] = "context_compaction"
    data["summary"] = "Context window compacting"


def _handle_pre_tool_use(
    raw_data: dict[str, Any],
    payload: dict[str, Any],
    data: dict[str, Any],
    transcript_path: str | None,
) -> None:
    """Populate *data* for a pre_tool_use event (may remap to subagent_start)."""
    data["tool_name"] = raw_data.get("tool_name")
    data["tool_input"] = raw_data.get("tool_input")
    data["tool_use_id"] = raw_data.get("tool_use_id")

    if data["tool_name"] in ("Task", "Agent"):
        payload["event_type"] = "subagent_start"
        data["agent_id"] = f"subagent_{data.get('tool_use_id', 'unknown')}"
        tool_input_raw = raw_data.get("tool_input", {})
        if isinstance(tool_input_raw, dict):
            tool_input = cast(dict[str, Any], tool_input_raw)
            description: str = tool_input.get("description", "")
            prompt: str = tool_input.get("prompt", "")
            agent_type: str = tool_input.get("subagent_type", "")
            if description:
                data["agent_name"] = description
            data["task_description"] = prompt if prompt else description
            if agent_type:
                data["agent_type"] = agent_type
        else:
            data["task_description"] = str(tool_input_raw) if tool_input_raw else ""
        # Remove raw tool_input — we've extracted what we need
        del data["tool_input"]
    else:
        data["agent_id"] = "main"


def _handle_post_tool_use(
    raw_data: dict[str, Any],
    payload: dict[str, Any],
    data: dict[str, Any],
    transcript_path: str | None,
) -> None:
    """Populate *data* for a post_tool_use event (may remap to subagent_stop)."""
    data["tool_name"] = raw_data.get("tool_name")
    data["tool_input"] = raw_data.get("tool_input")  # Needed for heat map tracking
    data["success"] = True  # PostToolUse only fires on success
    data["tool_use_id"] = raw_data.get("tool_use_id")

    if data["tool_name"] in ("Task", "Agent"):
        tool_input_raw = raw_data.get("tool_input", {})
        is_background = False
        if isinstance(tool_input_raw, dict):
            is_background = bool(tool_input_raw.get("run_in_background"))

        if is_background:
            # Background agent — let native SubagentStop handle completion
            data["agent_id"] = "main"
        else:
            # Synchronous agent — send subagent_stop immediately
            payload["event_type"] = "subagent_stop"
            data["agent_id"] = f"subagent_{data.get('tool_use_id', 'unknown')}"
            tool_response_raw = raw_data.get("tool_response", {})
            if isinstance(tool_response_raw, dict):
                tool_response = cast(dict[str, Any], tool_response_raw)
                data["result"] = tool_response.get("content", [])
                native_agent_id: str | None = tool_response.get("agentId")
                data["native_agent_id"] = native_agent_id

                if native_agent_id:
                    agent_path = _build_agent_transcript_path(
                        data.get("transcript_path") or transcript_path, native_agent_id
                    )
                    if agent_path:
                        data["agent_transcript_path"] = agent_path
    else:
        data["agent_id"] = "main"


def _handle_native_subagent_start(
    raw_data: dict[str, Any],
    payload: dict[str, Any],
    data: dict[str, Any],
    transcript_path: str | None,
) -> dict[str, Any] | None:
    """Handle a native SubagentStart hook (converts to subagent_info).

    Returns None when the event should be skipped (no agent_id present).
    """
    native_agent_id = raw_data.get("agent_id")
    if not native_agent_id:
        return None

    payload["event_type"] = "subagent_info"
    data["native_agent_id"] = native_agent_id
    data["agent_type"] = raw_data.get("agent_type")

    agent_path = _build_agent_transcript_path(
        data.get("transcript_path") or transcript_path, native_agent_id
    )
    if agent_path:
        data["agent_transcript_path"] = agent_path

    return payload


def _handle_native_subagent_stop(
    raw_data: dict[str, Any],
    data: dict[str, Any],
    transcript_path: str | None,
) -> dict[str, Any] | None:
    """Handle a native SubagentStop hook.

    Returns None when the event should be skipped (no agent_id present).
    """
    native_agent_id = raw_data.get("agent_id")
    if not native_agent_id:
        return None

    data["native_agent_id"] = native_agent_id
    agent_transcript = raw_data.get("agent_transcript_path")
    if agent_transcript:
        data["agent_transcript_path"] = agent_transcript
    else:
        agent_path = _build_agent_transcript_path(transcript_path, native_agent_id)
        if agent_path:
            data["agent_transcript_path"] = agent_path

    return data  # Sentinel: non-None means "do not skip"


def _handle_user_prompt_submit(
    raw_data: dict[str, Any],
    payload: dict[str, Any],
    data: dict[str, Any],
) -> None:
    """Populate *data* for a user_prompt_submit event.

    Detects <task-notification> XML in the prompt and routes it as a
    background_task_notification event instead.
    """
    prompt = raw_data.get("prompt", "")
    task_notification_pattern = r"<task-notification>(.*?)</task-notification>"
    match = re.search(task_notification_pattern, prompt, re.DOTALL)

    if match:
        try:
            xml_content = match.group(0)
            root = ET.fromstring(xml_content)
            task_id = root.findtext("task-id", "")
            output_file = root.findtext("output-file", "")
            status = root.findtext("status", "completed")
            summary_text = root.findtext("summary", "")

            payload["event_type"] = "background_task_notification"
            data["background_task_id"] = task_id
            data["background_task_output_file"] = output_file
            data["background_task_status"] = status
            data["background_task_summary"] = summary_text
            data["summary"] = f"Background task {task_id[:8]}... {status}"
            return
        except ET.ParseError:
            pass  # Fall through to regular prompt handling

    # Regular user prompt
    if len(prompt) > 50:
        prompt = prompt[:47] + "..."
    data["prompt"] = prompt
    data["summary"] = f"User: {prompt}" if prompt else "User submitted prompt"


def _handle_permission_request(raw_data: dict[str, Any], data: dict[str, Any]) -> None:
    """Populate *data* for a permission_request event."""
    data["tool_name"] = raw_data.get("tool_name")
    data["tool_input"] = raw_data.get("tool_input")
    data["tool_use_id"] = raw_data.get("tool_use_id")
    data["agent_id"] = "main"


def _handle_notification(raw_data: dict[str, Any], data: dict[str, Any]) -> None:
    """Populate *data* for a notification event."""
    data["notification_type"] = raw_data.get("type")
    data["message"] = raw_data.get("message")


def _handle_session_end(raw_data: dict[str, Any], data: dict[str, Any]) -> None:
    """Populate *data* for a session_end event."""
    data["reason"] = raw_data.get("reason")


def _handle_task_created(raw_data: dict[str, Any], data: dict[str, Any]) -> None:
    """Populate data for a task_created event."""
    # Claude Code may nest task data under "task" key or at top level
    task = raw_data.get("task") or raw_data
    data["task_id"] = task.get("id") or raw_data.get("id")
    data["task_subject"] = task.get("content") or raw_data.get("content")


def _handle_task_completed(raw_data: dict[str, Any], data: dict[str, Any]) -> None:
    """Populate data for a task_completed event."""
    task = raw_data.get("task") or raw_data
    data["task_id"] = task.get("id") or raw_data.get("id")
    data["task_subject"] = task.get("content") or raw_data.get("content")


def _handle_teammate_idle(raw_data: dict[str, Any], data: dict[str, Any]) -> None:
    """Populate data for a teammate_idle event (no extra fields beyond team fields)."""
    pass  # team_name and teammate_name are extracted globally below


def map_event(
    event_type: str,
    raw_data: dict[str, Any],
    session_id: str,
    strip_prefixes: list[str] | None = None,
) -> dict[str, Any] | None:
    """Map raw Claude Code hook data to the backend Event model.

    Claude Code hook data structure:
    - session_id: unique session identifier
    - tool_name: name of tool being used (Bash, Write, Edit, Read, Task, etc.)
    - tool_input: dict with tool-specific parameters
    - tool_use_id: unique ID for this tool invocation
    - tool_response: (PostToolUse only) result from tool execution

    Args:
        event_type: The Claude Code hook event name (e.g. ``"pre_tool_use"``).
        raw_data: The raw JSON payload received from Claude Code on stdin.
        session_id: Fallback session ID when not present in *raw_data*.
        strip_prefixes: Path prefixes to remove when deriving the project name.

    Returns:
        A dict ready to POST to the backend, or None if the event should be
        skipped entirely.
    """
    actual_session_id = raw_data.get("session_id") or session_id or "unknown_session"
    project_name = get_project_name(raw_data, strip_prefixes)

    # CLAUDE_PROJECT_DIR is the stable project root (does not change on `cd`)
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
    # cwd may differ from project_dir when Claude changes directory
    working_dir = raw_data.get("cwd", "")
    transcript_path: str | None = raw_data.get("transcript_path")

    data: dict[str, Any] = {
        "project_name": project_name,
        "project_dir": project_dir,
        "working_dir": working_dir,
        "transcript_path": transcript_path,
    }

    task_list_id = os.environ.get("CLAUDE_CODE_TASK_LIST_ID")
    if task_list_id:
        data["task_list_id"] = task_list_id

    # Extract team fields — present on ALL events from Agent Teams sessions
    team_name = raw_data.get("team_name") or os.environ.get("CLAUDE_TEAM_NAME")
    if team_name:
        data["team_name"] = team_name
    teammate_name = raw_data.get("teammate_name") or os.environ.get("CLAUDE_TEAMMATE_NAME")
    if teammate_name:
        data["teammate_name"] = teammate_name

    payload: dict[str, Any] = {
        "event_type": event_type,
        "session_id": actual_session_id,
        "timestamp": get_iso_timestamp(),
        "data": data,
    }

    if "tool_use_id" in raw_data:
        data["tool_use_id"] = raw_data["tool_use_id"]

    # ------------------------------------------------------------------
    # Event-specific mapping
    # ------------------------------------------------------------------
    if event_type == "session_start":
        _handle_session_start(raw_data, data)

    elif event_type == "pre_compact":
        _handle_pre_compact(payload, data)

    elif event_type == "pre_tool_use":
        _handle_pre_tool_use(raw_data, payload, data, transcript_path)

    elif event_type == "post_tool_use":
        _handle_post_tool_use(raw_data, payload, data, transcript_path)

    elif event_type == "subagent_start":
        result = _handle_native_subagent_start(raw_data, payload, data, transcript_path)
        if result is None:
            return None

    elif event_type == "subagent_stop":
        result = _handle_native_subagent_stop(raw_data, data, transcript_path)
        if result is None:
            return None

    elif event_type == "user_prompt_submit":
        _handle_user_prompt_submit(raw_data, payload, data)

    elif event_type == "permission_request":
        _handle_permission_request(raw_data, data)

    elif event_type == "notification":
        _handle_notification(raw_data, data)

    elif event_type == "stop":
        pass  # No additional fields required

    elif event_type == "session_end":
        _handle_session_end(raw_data, data)

    elif event_type == "task_created":
        _handle_task_created(raw_data, data)

    elif event_type == "task_completed":
        _handle_task_completed(raw_data, data)

    elif event_type == "teammate_idle":
        _handle_teammate_idle(raw_data, data)

    return payload
