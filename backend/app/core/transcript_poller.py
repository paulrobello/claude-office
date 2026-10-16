"""Poll subagent transcript files for tool use events in real-time."""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

from app.config import get_settings
from app.core.base_poller import BasePoller
from app.core.path_utils import is_safe_transcript_path
from app.models.common import BubbleContent, BubbleType
from app.models.events import (
    AgentEvent,
    AgentEventData,
    AnyEvent,
    EventType,
    ToolEvent,
    ToolEventData,
)

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 1.0

# Hard upper bound — even if no zombie detection ever fires, give up after
# this long. Kept high so legitimate long-running subagents are not killed.
INACTIVITY_TIMEOUT = timedelta(minutes=10)


def _zombie_timeout() -> timedelta:
    """Return the configured zombie-subagent timeout as a timedelta."""
    return timedelta(seconds=get_settings().ZOMBIE_SUBAGENT_TIMEOUT_SECONDS)


@dataclass
class PolledAgent:
    """Tracks state for a polled subagent transcript."""

    agent_id: str
    session_id: str
    transcript_path: Path
    file_position: int = 0
    last_activity: datetime = field(default_factory=lambda: datetime.now(UTC))
    active_tool_ids: set[str] = field(default_factory=lambda: set[str]())
    last_thinking_hash: int = 0
    last_text_hash: int = 0


class TranscriptPoller(BasePoller[PolledAgent]):
    """Polls subagent transcript files for tool use events.

    Registry key is ``agent_id`` (one poll task per subagent transcript);
    the owning session id lives on :class:`PolledAgent`.
    """

    def _get_poll_interval(self) -> float:
        # Read live so test patches to POLL_INTERVAL_SECONDS apply.
        return POLL_INTERVAL_SECONDS

    def __init__(self, event_callback: Any) -> None:
        """Initialize the poller with an event callback function."""
        super().__init__()
        self._event_callback = event_callback

    async def start_polling(self, agent_id: str, session_id: str, transcript_path: str) -> None:
        """Start polling a subagent's transcript file."""
        settings = get_settings()
        translated_path = settings.translate_path(transcript_path)
        # Validate and poll the TRANSLATED path: hooks report host-form paths,
        # and the container only accepts paths under its own roots (Docker).
        path = Path(translated_path).expanduser()

        if not is_safe_transcript_path(path):
            logger.warning(f"Rejected transcript path outside ~/.claude/: {translated_path}")
            return

        # Start at end of file if it exists
        agent = PolledAgent(
            agent_id=agent_id,
            session_id=session_id,
            transcript_path=path,
        )
        if path.exists():
            agent.file_position = path.stat().st_size

        await self._register_polling(agent_id, agent, task_name=f"poll_{agent_id}")
        logger.info(f"Started polling agent {agent_id} at {transcript_path}")

    async def _check(self, key: str, state: PolledAgent) -> None:
        """Poll one iteration: zombie check, inactivity check, content read.

        On zombie detection, emits a synthetic SUBAGENT_STOP and removes the
        state so the loop terminates — guaranteeing the synthetic event is
        dispatched exactly once even if the state machine's cleanup path
        never calls ``stop_polling``.

        On hard inactivity timeout, removes the state so the loop terminates.
        """
        inactivity = datetime.now(UTC) - state.last_activity
        zombie_timeout = _zombie_timeout()

        # Zombie detection: emit a synthetic SubagentStop so the
        # state machine can clean up the orphaned agent. This
        # covers cases where Claude Code never sends SubagentStop
        # itself (rate-limit, crash, user interrupt, ...).
        if inactivity > zombie_timeout:
            zombie_event = self._build_zombie_stop_event(state)
            logger.warning(
                f"Agent {key} appears to be a zombie "
                f"(no transcript activity for "
                f"{inactivity.total_seconds():.0f}s, "
                f"threshold {zombie_timeout.total_seconds():.0f}s) "
                f"— emitting synthetic SubagentStop on session {state.session_id}"
            )
            try:
                await self._event_callback(zombie_event)
            except Exception as e:
                logger.warning(f"Error dispatching synthetic SubagentStop: {e}")
            # Remove state so the loop exits and we do not keep emitting
            # zombie events every tick. The state machine's SUBAGENT_STOP
            # handler normally calls stop_polling(key); popping here
            # guarantees termination even if that path fails.
            async with self._lock:
                self._sessions.pop(key, None)
            return

        # Hard fallback: if the zombie callback also failed for
        # any reason, eventually stop the loop so we do not poll
        # forever.
        if inactivity > INACTIVITY_TIMEOUT:
            logger.debug(f"Agent {key} timed out due to inactivity")
            async with self._lock:
                self._sessions.pop(key, None)
            return

        events = await self._read_new_content(state)
        for event in events:
            try:
                await self._event_callback(event)
            except Exception as e:
                logger.warning(f"Error processing polled event: {e}")

    def _build_zombie_stop_event(self, agent: PolledAgent) -> AgentEvent:
        """Build a synthetic SUBAGENT_STOP for an agent we believe has crashed."""
        return AgentEvent(
            event_type=EventType.SUBAGENT_STOP,
            session_id=agent.session_id,
            timestamp=datetime.now(UTC),
            data=AgentEventData(
                agent_id=agent.agent_id,
                agent_transcript_path=str(agent.transcript_path),
            ),
        )

    async def _read_new_content(self, agent: PolledAgent) -> list[AnyEvent]:
        """Read new content from the transcript file and extract events."""
        events: list[AnyEvent] = []

        if not agent.transcript_path.exists():
            return events

        if not is_safe_transcript_path(agent.transcript_path):
            logger.warning(f"Rejected transcript path outside ~/.claude/: {agent.transcript_path}")
            return events

        try:
            path = agent.transcript_path
            position = agent.file_position

            def _read_sync() -> tuple[str, int] | None:
                current_size = path.stat().st_size
                if current_size <= position:
                    return None
                with open(path, encoding="utf-8") as f:
                    f.seek(position)
                    data = f.read()
                    return data, f.tell()

            result = await asyncio.to_thread(_read_sync)
            if result is None:
                return events

            new_content, new_position = result
            agent.file_position = new_position

            if new_content.strip():
                agent.last_activity = datetime.now(UTC)
                events = self._parse_content(agent, new_content)

        except OSError as e:
            logger.warning(f"Error reading transcript for {agent.agent_id}: {e}")

        return events

    def _parse_content(self, agent: PolledAgent, content: str) -> list[AnyEvent]:
        """Parse JSONL content and extract tool use, thinking, and text events."""
        events: list[AnyEvent] = []

        for line in content.split("\n"):
            line = line.strip()
            if not line:
                continue

            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue

            record_type = record.get("type")
            message: dict[str, Any] = record.get("message", {})
            content_blocks: list[Any] = message.get("content", [])

            if record_type == "assistant" and message.get("role") == "assistant":
                for item in content_blocks:
                    if not isinstance(item, dict):
                        continue
                    block = cast(dict[str, Any], item)
                    block_type: str | None = block.get("type")

                    if block_type == "tool_use":
                        event = self._create_pre_tool_use_event(agent, block)
                        if event:
                            events.append(event)
                            tool_id: str = block.get("id", "")
                            agent.active_tool_ids.add(tool_id)

                    elif block_type == "thinking":
                        thinking_text: str = block.get("thinking", "")
                        if thinking_text:
                            text_hash = hash(thinking_text[:200])
                            if text_hash != agent.last_thinking_hash:
                                agent.last_thinking_hash = text_hash
                                event = self._create_thinking_event(agent, thinking_text)
                                if event:
                                    events.append(event)

                    elif block_type == "text":
                        text_content: str = block.get("text", "")
                        if text_content:
                            text_hash = hash(text_content[:200])
                            if text_hash != agent.last_text_hash:
                                agent.last_text_hash = text_hash
                                event = self._create_text_event(agent, text_content)
                                if event:
                                    events.append(event)

            elif record_type == "user" and message.get("role") == "user":
                for item in content_blocks:
                    if not isinstance(item, dict):
                        continue
                    block = cast(dict[str, Any], item)
                    if block.get("type") == "tool_result":
                        tool_use_id: str = block.get("tool_use_id", "")
                        if tool_use_id in agent.active_tool_ids:
                            event = self._create_post_tool_use_event(agent, block)
                            if event:
                                events.append(event)
                            agent.active_tool_ids.discard(tool_use_id)

        return events

    def _create_pre_tool_use_event(
        self, agent: PolledAgent, block: dict[str, Any]
    ) -> ToolEvent | None:
        """Create a pre_tool_use event from a tool_use block."""
        tool_name = block.get("name")
        if not tool_name:
            return None

        if tool_name == "Task":
            return None

        tool_input = block.get("input", {})
        tool_use_id = block.get("id", "")

        return ToolEvent(
            event_type=EventType.PRE_TOOL_USE,
            session_id=agent.session_id,
            timestamp=datetime.now(UTC),
            data=ToolEventData(
                agent_id=agent.agent_id,
                tool_name=tool_name,
                tool_input=tool_input,
                tool_use_id=tool_use_id,
            ),
        )

    def _create_post_tool_use_event(
        self, agent: PolledAgent, block: dict[str, Any]
    ) -> ToolEvent | None:
        """Create a post_tool_use event from a tool_result block."""
        tool_use_id = block.get("tool_use_id", "")
        is_error = block.get("is_error", False)

        return ToolEvent(
            event_type=EventType.POST_TOOL_USE,
            session_id=agent.session_id,
            timestamp=datetime.now(UTC),
            data=ToolEventData(
                agent_id=agent.agent_id,
                tool_use_id=tool_use_id,
                success=not is_error,
            ),
        )

    def _create_thinking_event(self, agent: PolledAgent, thinking_text: str) -> AgentEvent:
        """Create an agent update event for thinking content."""
        max_length = 200
        display_text = thinking_text.replace("\n", " ").strip()
        if len(display_text) > max_length:
            display_text = display_text[: max_length - 3] + "..."

        return AgentEvent(
            event_type=EventType.AGENT_UPDATE,
            session_id=agent.session_id,
            timestamp=datetime.now(UTC),
            data=AgentEventData(
                agent_id=agent.agent_id,
                thinking=thinking_text,
                bubble_content=BubbleContent(
                    type=BubbleType.THOUGHT,
                    text=display_text,
                    icon="💭",
                ),
            ),
        )

    def _create_text_event(self, agent: PolledAgent, text_content: str) -> AgentEvent:
        """Create an agent update event for text response."""
        max_length = 200
        display_text = text_content.replace("\n", " ").strip()
        if len(display_text) > max_length:
            display_text = display_text[: max_length - 3] + "..."

        return AgentEvent(
            event_type=EventType.AGENT_UPDATE,
            session_id=agent.session_id,
            timestamp=datetime.now(UTC),
            data=AgentEventData(
                agent_id=agent.agent_id,
                summary=text_content,
                bubble_content=BubbleContent(
                    type=BubbleType.SPEECH,
                    text=display_text,
                    icon="💬",
                ),
            ),
        )


_transcript_poller: TranscriptPoller | None = None


def get_transcript_poller() -> TranscriptPoller | None:
    """Get the singleton transcript poller instance, or None if not initialized."""
    return _transcript_poller


def init_transcript_poller(event_callback: Any) -> TranscriptPoller:
    """Initialize the singleton transcript poller with an event callback."""
    global _transcript_poller
    _transcript_poller = TranscriptPoller(event_callback)
    return _transcript_poller
