"""Poll subagent transcript files for tool use events in real-time."""

import asyncio
import contextlib
import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

from app.config import get_settings
from app.models.common import BubbleContent, BubbleType
from app.models.events import Event, EventData, EventType

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 1.0
INACTIVITY_TIMEOUT = timedelta(minutes=10)


@dataclass
class PolledAgent:
    """Tracks state for a polled subagent transcript."""

    agent_id: str
    session_id: str
    transcript_path: Path
    file_position: int = 0
    last_activity: datetime = field(default_factory=lambda: datetime.now(UTC))
    active_tool_ids: set[str] = field(default_factory=lambda: set[str]())
    poll_task: asyncio.Task[None] | None = None
    last_thinking_hash: int = 0
    last_text_hash: int = 0


class TranscriptPoller:
    """Polls subagent transcript files for tool use events."""

    def __init__(self, event_callback: Any) -> None:
        """Initialize the poller with an event callback function."""
        self._agents: dict[str, PolledAgent] = {}
        self._lock = asyncio.Lock()
        self._event_callback = event_callback

    async def start_polling(self, agent_id: str, session_id: str, transcript_path: str) -> None:
        """Start polling a subagent's transcript file."""
        settings = get_settings()
        translated_path = settings.translate_path(transcript_path)
        path = Path(translated_path).expanduser()

        async with self._lock:
            if agent_id in self._agents:
                logger.debug(f"Already polling agent {agent_id}")
                return

            agent = PolledAgent(
                agent_id=agent_id,
                session_id=session_id,
                transcript_path=path,
            )

            # Start at end of file if it exists
            if path.exists():
                agent.file_position = path.stat().st_size

            self._agents[agent_id] = agent

            agent.poll_task = asyncio.create_task(
                self._poll_loop(agent_id), name=f"poll_{agent_id}"
            )

            logger.info(f"Started polling agent {agent_id} at {transcript_path}")

    async def is_polling(self, agent_id: str) -> bool:
        """Check if polling is active for an agent."""
        async with self._lock:
            return agent_id in self._agents

    async def stop_polling(self, agent_id: str) -> None:
        """Stop polling a subagent's transcript file."""
        async with self._lock:
            agent = self._agents.pop(agent_id, None)
            if agent and agent.poll_task:
                agent.poll_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await agent.poll_task
                logger.info(f"Stopped polling agent {agent_id}")

    async def stop_all(self) -> None:
        """Stop all polling tasks."""
        async with self._lock:
            for agent in list(self._agents.values()):
                if agent.poll_task:
                    agent.poll_task.cancel()
            self._agents.clear()

    async def _poll_loop(self, agent_id: str) -> None:
        """Background task that polls a single agent's transcript."""
        try:
            while True:
                async with self._lock:
                    agent = self._agents.get(agent_id)
                    if not agent:
                        return

                    # Check for inactivity timeout
                    if datetime.now(UTC) - agent.last_activity > INACTIVITY_TIMEOUT:
                        logger.debug(f"Agent {agent_id} timed out due to inactivity")
                        return

                await asyncio.sleep(POLL_INTERVAL_SECONDS)

                async with self._lock:
                    agent = self._agents.get(agent_id)
                    if not agent:
                        return

                events = await self._read_new_content(agent)

                for event in events:
                    try:
                        await self._event_callback(event)
                    except Exception as e:
                        logger.warning(f"Error processing polled event: {e}")

        except asyncio.CancelledError:
            logger.debug(f"Poll loop for agent {agent_id} cancelled")
            raise
        except Exception as e:
            logger.exception(f"Error in poll loop for agent {agent_id}: {e}")

    async def _read_new_content(self, agent: PolledAgent) -> list[Event]:
        """Read new content from the transcript file and extract events."""
        events: list[Event] = []

        if not agent.transcript_path.exists():
            return events

        try:
            current_size = agent.transcript_path.stat().st_size
            if current_size <= agent.file_position:
                return events

            with open(agent.transcript_path, encoding="utf-8") as f:
                f.seek(agent.file_position)
                new_content = f.read()
                agent.file_position = f.tell()

            if new_content.strip():
                agent.last_activity = datetime.now(UTC)
                events = self._parse_content(agent, new_content)

        except OSError as e:
            logger.warning(f"Error reading transcript for {agent.agent_id}: {e}")

        return events

    def _parse_content(self, agent: PolledAgent, content: str) -> list[Event]:
        """Parse JSONL content and extract tool use, thinking, and text events."""
        events: list[Event] = []

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

    def _create_pre_tool_use_event(self, agent: PolledAgent, block: dict[str, Any]) -> Event | None:
        """Create a pre_tool_use event from a tool_use block."""
        tool_name = block.get("name")
        if not tool_name:
            return None

        if tool_name == "Task":
            return None

        tool_input = block.get("input", {})
        tool_use_id = block.get("id", "")

        return Event(
            event_type=EventType.PRE_TOOL_USE,
            session_id=agent.session_id,
            timestamp=datetime.now(UTC),
            data=EventData(
                agent_id=agent.agent_id,
                tool_name=tool_name,
                tool_input=tool_input,
                tool_use_id=tool_use_id,
            ),
        )

    def _create_post_tool_use_event(
        self, agent: PolledAgent, block: dict[str, Any]
    ) -> Event | None:
        """Create a post_tool_use event from a tool_result block."""
        tool_use_id = block.get("tool_use_id", "")
        is_error = block.get("is_error", False)

        return Event(
            event_type=EventType.POST_TOOL_USE,
            session_id=agent.session_id,
            timestamp=datetime.now(UTC),
            data=EventData(
                agent_id=agent.agent_id,
                tool_use_id=tool_use_id,
                success=not is_error,
            ),
        )

    def _create_thinking_event(self, agent: PolledAgent, thinking_text: str) -> Event:
        """Create an agent update event for thinking content."""
        max_length = 200
        display_text = thinking_text.replace("\n", " ").strip()
        if len(display_text) > max_length:
            display_text = display_text[: max_length - 3] + "..."

        return Event(
            event_type=EventType.AGENT_UPDATE,
            session_id=agent.session_id,
            timestamp=datetime.now(UTC),
            data=EventData(
                agent_id=agent.agent_id,
                thinking=thinking_text,
                bubble_content=BubbleContent(
                    type=BubbleType.THOUGHT,
                    text=display_text,
                    icon="💭",
                ),
            ),
        )

    def _create_text_event(self, agent: PolledAgent, text_content: str) -> Event:
        """Create an agent update event for text response."""
        max_length = 200
        display_text = text_content.replace("\n", " ").strip()
        if len(display_text) > max_length:
            display_text = display_text[: max_length - 3] + "..."

        return Event(
            event_type=EventType.AGENT_UPDATE,
            session_id=agent.session_id,
            timestamp=datetime.now(UTC),
            data=EventData(
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
