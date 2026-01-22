"""Parse Claude Code JSONL transcript files."""

import json
import logging
from pathlib import Path
from typing import TypedDict

logger = logging.getLogger(__name__)


class MessageContent(TypedDict, total=False):
    """Content block within a Claude message."""

    type: str
    text: str


class Message(TypedDict, total=False):
    """Claude message structure."""

    role: str
    content: list[MessageContent]


class TranscriptRecord(TypedDict, total=False):
    """A single record from a JSONL transcript file."""

    type: str
    message: Message
    isSidechain: bool
    agentId: str


def get_last_assistant_response(jsonl_path: str | Path) -> str | None:
    """Extract the most recent assistant text response from a JSONL file.

    Args:
        jsonl_path: Path to the JSONL transcript file.

    Returns:
        The last assistant text response, or None if not found or file doesn't exist.
    """
    path = Path(jsonl_path)
    if not path.exists():
        logger.debug(f"Transcript file not found: {jsonl_path}")
        return None

    last_text: str | None = None

    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    record: TranscriptRecord = json.loads(line)

                    # Only process assistant messages
                    if record.get("type") != "assistant":
                        continue

                    message = record.get("message", {})
                    if message.get("role") != "assistant":
                        continue

                    # Extract text from content blocks
                    content_list = message.get("content", [])
                    for content in content_list:
                        if content.get("type") == "text":
                            text = content.get("text")
                            if text:
                                last_text = text

                except json.JSONDecodeError:
                    continue

    except OSError as e:
        logger.warning(f"Error reading transcript file {jsonl_path}: {e}")
        return None

    return last_text


def get_session_messages(
    jsonl_path: str | Path,
) -> list[dict[str, str]]:
    """Get all assistant messages from a JSONL file for summarization.

    Args:
        jsonl_path: Path to the JSONL transcript file.

    Returns:
        List of message dicts with 'role' and 'text' keys.
    """
    path = Path(jsonl_path)
    if not path.exists():
        logger.debug(f"Transcript file not found: {jsonl_path}")
        return []

    messages: list[dict[str, str]] = []

    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    record: TranscriptRecord = json.loads(line)

                    # Only process assistant messages
                    if record.get("type") != "assistant":
                        continue

                    message = record.get("message", {})
                    role = message.get("role", "")
                    if role != "assistant":
                        continue

                    # Extract text from content blocks
                    content_list = message.get("content", [])
                    for content in content_list:
                        if content.get("type") == "text":
                            text = content.get("text")
                            if text:
                                messages.append({"role": role, "text": text})

                except json.JSONDecodeError:
                    continue

    except OSError as e:
        logger.warning(f"Error reading transcript file {jsonl_path}: {e}")
        return []

    return messages
