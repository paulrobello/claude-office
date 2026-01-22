"""Tests for the transcript poller service."""

# pyright: reportPrivateUsage=false

import asyncio
import json
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.core.transcript_poller import TranscriptPoller
from app.models.events import EventType

# Use shorter poll interval for tests
TEST_POLL_INTERVAL = 0.1


class TestTranscriptPoller:
    """Tests for TranscriptPoller."""

    @pytest.mark.asyncio
    async def test_start_and_stop_polling(self) -> None:
        """Should start and stop polling without errors."""
        callback = AsyncMock()
        poller = TranscriptPoller(callback)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write("")
            temp_path = f.name

        try:
            with patch("app.core.transcript_poller.POLL_INTERVAL_SECONDS", TEST_POLL_INTERVAL):
                await poller.start_polling("agent1", "session1", temp_path)
                await asyncio.sleep(0.05)
                await poller.stop_polling("agent1")
                # Should handle double stop gracefully
                await poller.stop_polling("agent1")
        finally:
            Path(temp_path).unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_parses_tool_use_events(self) -> None:
        """Should parse tool_use from assistant messages."""
        callback = AsyncMock()
        poller = TranscriptPoller(callback)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            temp_path = f.name

        try:
            with patch("app.core.transcript_poller.POLL_INTERVAL_SECONDS", TEST_POLL_INTERVAL):
                await poller.start_polling("agent1", "session1", temp_path)
                await asyncio.sleep(0.05)

                # Write a tool_use event
                with open(temp_path, "a", encoding="utf-8") as f:
                    record = {
                        "type": "assistant",
                        "message": {
                            "role": "assistant",
                            "content": [
                                {
                                    "type": "tool_use",
                                    "id": "tool123",
                                    "name": "Read",
                                    "input": {"file_path": "/test.py"},
                                }
                            ],
                        },
                    }
                    f.write(json.dumps(record) + "\n")

                # Wait for poll
                await asyncio.sleep(0.2)
                await poller.stop_polling("agent1")

            # Should have called callback with pre_tool_use event
            assert callback.call_count >= 1
            event = callback.call_args_list[0][0][0]
            assert event.event_type == EventType.PRE_TOOL_USE
            assert event.data.tool_name == "Read"
            assert event.data.agent_id == "agent1"
        finally:
            Path(temp_path).unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_parses_tool_result_events(self) -> None:
        """Should parse tool_result from user messages."""
        callback = AsyncMock()
        poller = TranscriptPoller(callback)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            temp_path = f.name

        try:
            with patch("app.core.transcript_poller.POLL_INTERVAL_SECONDS", TEST_POLL_INTERVAL):
                await poller.start_polling("agent1", "session1", temp_path)
                await asyncio.sleep(0.05)

                # Write a tool_use followed by tool_result
                with open(temp_path, "a", encoding="utf-8") as f:
                    # Tool use
                    tool_use = {
                        "type": "assistant",
                        "message": {
                            "role": "assistant",
                            "content": [
                                {
                                    "type": "tool_use",
                                    "id": "tool456",
                                    "name": "Bash",
                                    "input": {"command": "ls"},
                                }
                            ],
                        },
                    }
                    f.write(json.dumps(tool_use) + "\n")

                    # Tool result
                    tool_result = {
                        "type": "user",
                        "message": {
                            "role": "user",
                            "content": [
                                {
                                    "type": "tool_result",
                                    "tool_use_id": "tool456",
                                    "content": "file1.txt\nfile2.txt",
                                    "is_error": False,
                                }
                            ],
                        },
                    }
                    f.write(json.dumps(tool_result) + "\n")

                # Wait for poll
                await asyncio.sleep(0.2)
                await poller.stop_polling("agent1")

            # Should have pre_tool_use and post_tool_use
            assert callback.call_count >= 2
            events = [call[0][0] for call in callback.call_args_list]
            types = [e.event_type for e in events]
            assert EventType.PRE_TOOL_USE in types
            assert EventType.POST_TOOL_USE in types
        finally:
            Path(temp_path).unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_skips_task_tool(self) -> None:
        """Should skip Task tool (subagent spawning)."""
        callback = AsyncMock()
        poller = TranscriptPoller(callback)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            temp_path = f.name

        try:
            with patch("app.core.transcript_poller.POLL_INTERVAL_SECONDS", TEST_POLL_INTERVAL):
                await poller.start_polling("agent1", "session1", temp_path)
                await asyncio.sleep(0.05)

                # Write a Task tool_use event
                with open(temp_path, "a", encoding="utf-8") as f:
                    record = {
                        "type": "assistant",
                        "message": {
                            "role": "assistant",
                            "content": [
                                {
                                    "type": "tool_use",
                                    "id": "tool789",
                                    "name": "Task",
                                    "input": {"prompt": "Do something"},
                                }
                            ],
                        },
                    }
                    f.write(json.dumps(record) + "\n")

                # Wait for poll
                await asyncio.sleep(0.2)
                await poller.stop_polling("agent1")

            # Should NOT have called callback for Task tool
            assert callback.call_count == 0
        finally:
            Path(temp_path).unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_stop_all(self) -> None:
        """Should stop all polling tasks."""
        callback = AsyncMock()
        poller = TranscriptPoller(callback)

        with (
            tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f1,
            tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f2,
        ):
            path1, path2 = f1.name, f2.name

        try:
            with patch("app.core.transcript_poller.POLL_INTERVAL_SECONDS", TEST_POLL_INTERVAL):
                await poller.start_polling("agent1", "session1", path1)
                await poller.start_polling("agent2", "session1", path2)
                await asyncio.sleep(0.05)
                await poller.stop_all()

            # Both should be stopped - check internal state is empty
            assert len(poller._agents) == 0
        finally:
            Path(path1).unlink(missing_ok=True)
            Path(path2).unlink(missing_ok=True)
