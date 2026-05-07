"""Token usage tracking extracted from StateMachine.

Encapsulates JSONL-based token extraction, tool-use counting,
and thinking-block extraction so StateMachine can delegate
these concerns instead of embedding file I/O in its dataclass body.
"""

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from app.models.events import Event

logger = logging.getLogger(__name__)

# Read-sizes used when tail-scanning JSONL files.
# 20 KB is enough to find the most recent ``usage`` block.
# 50 KB is needed to scan for thinking blocks (larger payloads).
_TOKEN_READ_SIZE = 20_000
_THINKING_READ_SIZE = 50_000

# Model family → max context window (tokens).
# Any model not in this map falls back to 200k.
_CONTEXT_WINDOWS: dict[str, int] = {
    "opus": 1_000_000,
    "sonnet": 1_000_000,
    "haiku": 200_000,
}


def _context_window_for_model(model: str) -> int:
    """Return the context window size for a Claude model ID.

    Examples: ``claude-opus-4-7`` → 1M, ``claude-sonnet-4-6`` → 1M,
    ``claude-haiku-4-5`` → 200k.
    """
    model_lower = model.lower()
    for family, window in _CONTEXT_WINDOWS.items():
        if family in model_lower:
            return window
    return 200_000


@dataclass
class TokenTracker:
    """Tracks cumulative token usage for a single session."""

    total_input_tokens: int = 0
    total_output_tokens: int = 0

    max_context_tokens: int = 200_000

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    @property
    def total_tokens(self) -> int:
        """Return the combined input + output token count."""
        return self.total_input_tokens + self.total_output_tokens

    @property
    def context_utilization(self) -> float:
        """Return 0.0-1.0 ratio of tokens used vs. context window."""
        return min(1.0, self.total_tokens / self.max_context_tokens)

    def update_from_event(self, event: Event) -> None:
        """Update token counts from an incoming event.

        Checks event data first (fast path), then falls back to JSONL
        transcript parsing if the event carries a transcript path.

        Args:
            event: The event to extract token data from.
        """
        if not event.data:
            return

        # Fast path: token counts embedded directly in event data.
        if event.data.input_tokens is not None or event.data.output_tokens is not None:
            if event.data.input_tokens is not None:
                self.total_input_tokens = event.data.input_tokens
            if event.data.output_tokens is not None:
                self.total_output_tokens = event.data.output_tokens
            logger.info(
                f"Context: {self.context_utilization:.1%} "
                f"({self.total_tokens:,}/{self.max_context_tokens:,} tokens)"
            )
            return

        # Slow path: parse the JSONL transcript for usage data.
        transcript_path = event.data.transcript_path or event.data.agent_transcript_path
        if not transcript_path:
            return

        usage = self._extract_token_usage_from_jsonl(transcript_path)
        if not usage:
            logger.debug(f"No token usage found in {transcript_path}")
            return

        self.total_input_tokens = int(usage["input_tokens"])
        self.total_output_tokens = int(usage["output_tokens"])
        model = usage.get("model")
        if model and isinstance(model, str):
            self.max_context_tokens = _context_window_for_model(model)
        logger.info(
            f"Context: {self.context_utilization:.1%} "
            f"({self.total_tokens:,}/{self.max_context_tokens:,} tokens)"
        )

    def count_tool_uses_from_jsonl(self, transcript_path: str) -> int:
        """Count tool_use blocks in a JSONL transcript file.

        Args:
            transcript_path: Path to the JSONL file.

        Returns:
            Number of ``"type": "tool_use"`` entries found.
        """
        try:
            path = Path(transcript_path).expanduser()
            if not path.exists():
                return 0

            with open(path, encoding="utf-8", errors="ignore") as f:
                content = f.read()

            count = content.count('"type":"tool_use"')
            count += content.count('"type": "tool_use"')
            return count

        except Exception:
            logger.debug("Failed to count tool uses in %s", transcript_path, exc_info=True)
            return 0

    def extract_thinking_from_jsonl(
        self, transcript_path: str, max_length: int = 200
    ) -> str | None:
        """Extract the most recent thinking block from a JSONL transcript.

        Args:
            transcript_path: Path to the JSONL file.
            max_length: Truncate the thinking text to this many characters.

        Returns:
            The latest thinking text, or None if not found.
        """
        try:
            path = Path(transcript_path).expanduser()
            if not path.exists():
                return None

            with open(path, "rb") as f:
                f.seek(0, 2)  # Go to end
                file_size = f.tell()
                read_size = min(_THINKING_READ_SIZE, file_size)
                f.seek(max(0, file_size - read_size))
                content = f.read().decode("utf-8", errors="ignore")

            latest_thinking: str | None = None
            search_start = 0
            while True:
                idx = content.find('"type":"thinking"', search_start)
                if idx == -1:
                    break

                thinking_start = content.find('"thinking":"', idx)
                if thinking_start == -1:
                    search_start = idx + 1
                    continue

                content_start = thinking_start + len('"thinking":"')
                # Find closing quote (handle escaped quotes)
                pos = content_start
                while pos < len(content):
                    if content[pos] == '"' and content[pos - 1] != "\\":
                        break
                    pos += 1

                if pos < len(content):
                    thinking_text = content[content_start:pos]
                    # Unescape basic JSON escapes
                    thinking_text = (
                        thinking_text.replace('\\"', '"').replace("\\n", " ").replace("\\t", " ")
                    )
                    latest_thinking = thinking_text

                search_start = pos + 1

            if latest_thinking:
                if len(latest_thinking) > max_length:
                    latest_thinking = latest_thinking[: max_length - 3] + "..."
                return latest_thinking

        except Exception:
            logger.debug("Failed to extract thinking from %s", transcript_path, exc_info=True)

        return None

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _extract_token_usage_from_jsonl(self, transcript_path: str) -> dict[str, int | str] | None:
        """Extract the latest token usage from a Claude JSONL transcript file.

        Reads the last ~20 KB of the file and walks backwards through
        JSONL lines looking for a ``message.usage`` object.

        Args:
            transcript_path: Path to the JSONL file.

        Returns:
            Dict with ``input_tokens``, ``output_tokens``, and optionally ``model``.
        """
        try:
            path = Path(transcript_path).expanduser()
            if not path.exists():
                return None

            with open(path, "rb") as f:
                f.seek(0, 2)  # Go to end
                file_size = f.tell()
                read_size = min(_TOKEN_READ_SIZE, file_size)
                f.seek(max(0, file_size - read_size))
                content = f.read().decode("utf-8", errors="ignore")

            lines = content.strip().split("\n")
            for line in reversed(lines):
                try:
                    if not line.startswith("{"):
                        continue
                    data = json.loads(line)
                    if "message" in data and isinstance(data["message"], dict):
                        message: dict[str, Any] = cast(dict[str, Any], data["message"])
                        usage = message.get("usage")
                        if usage and isinstance(usage, dict):
                            usage_dict: dict[str, Any] = cast(dict[str, Any], usage)
                            input_tokens: int = (
                                int(usage_dict.get("input_tokens", 0) or 0)
                                + int(usage_dict.get("cache_creation_input_tokens", 0) or 0)
                                + int(usage_dict.get("cache_read_input_tokens", 0) or 0)
                            )
                            output_tokens: int = int(usage_dict.get("output_tokens", 0) or 0)
                            result: dict[str, int | str] = {
                                "input_tokens": input_tokens,
                                "output_tokens": output_tokens,
                            }
                            model = message.get("model")
                            if model and isinstance(model, str):
                                result["model"] = model
                            return result
                except (json.JSONDecodeError, KeyError):
                    continue

        except Exception:
            logger.debug("Failed to extract token usage from %s", transcript_path, exc_info=True)

        return None
