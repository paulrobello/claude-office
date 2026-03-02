import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum, auto
from pathlib import Path
from typing import Any, cast

from app.config import get_settings
from app.core.path_utils import compress_path, compress_paths_in_text, truncate_long_words
from app.core.quotes import get_random_job_completion_quote
from app.core.summary_service import get_summary_service
from app.core.whiteboard_tracker import WhiteboardTracker
from app.models.agents import (
    Agent,
    AgentState,
    Boss,
    BossState,
    ElevatorState,
    OfficeState,
    PhoneState,
)
from app.models.common import BubbleContent, BubbleType, TodoItem, TodoStatus
from app.models.events import Event, EventData, EventType
from app.models.sessions import (
    AgentLifespan,
    BackgroundTask,
    ConversationEntry,
    GameState,
    HistoryEntry,
    NewsItem,
    WhiteboardData,
)

logger = logging.getLogger(__name__)


def _empty_agents() -> dict[str, Agent]:
    return cast(dict[str, Agent], {})


def _empty_str_list() -> list[str]:
    return cast(list[str], [])


def _empty_history_list() -> list[HistoryEntry]:
    return cast(list[HistoryEntry], [])


def _empty_todo_list() -> list[TodoItem]:
    return cast(list[TodoItem], [])


def _empty_background_tasks() -> list[BackgroundTask]:
    return cast(list[BackgroundTask], [])


def _empty_conversation() -> list[ConversationEntry]:
    return cast(list[ConversationEntry], [])


class OfficePhase(Enum):
    EMPTY = auto()  # No active session
    STARTING = auto()  # Session starting, boss arriving
    IDLE = auto()  # Boss at desk, no active work
    WORKING = auto()  # Boss actively working
    DELEGATING = auto()  # Boss spawning agents
    BUSY = auto()  # Multiple agents working
    COMPLETING = auto()  # Wrapping up work
    ENDED = auto()  # Session complete


@dataclass
class StateMachine:
    """Manages office state and processes events to track agents, boss, and office elements."""

    MAX_AGENTS = 8
    MAX_CONTEXT_TOKENS = 200_000

    phase: OfficePhase = OfficePhase.EMPTY
    boss_state: BossState = BossState.IDLE
    boss_bubble: BubbleContent | None = None
    boss_current_task: str | None = None  # Summarized user prompt
    elevator_state: ElevatorState = ElevatorState.CLOSED
    agents: dict[str, Agent] = field(default_factory=_empty_agents)
    arrival_queue: list[str] = field(default_factory=_empty_str_list)
    handin_queue: list[str] = field(default_factory=_empty_str_list)
    history: list[HistoryEntry] = field(default_factory=_empty_history_list)
    todos: list[TodoItem] = field(default_factory=_empty_todo_list)
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    tool_uses_since_compaction: int = 0
    print_report: bool = False
    last_user_prompt: str | None = None
    background_tasks: list[BackgroundTask] = field(default_factory=_empty_background_tasks)
    conversation: list[ConversationEntry] = field(default_factory=_empty_conversation)

    # Whiteboard tracking delegated to WhiteboardTracker
    whiteboard: WhiteboardTracker = field(default_factory=WhiteboardTracker)

    # ---------------------------------------------------------------------------
    # Backward-compatible property aliases so existing code that accesses
    # sm.tool_usage, sm.agent_lifespans, etc. continues to work.
    # ---------------------------------------------------------------------------

    @property
    def tool_usage(self) -> dict[str, int]:
        return self.whiteboard.tool_usage

    @property
    def task_completed_count(self) -> int:
        return self.whiteboard.task_completed_count

    @task_completed_count.setter
    def task_completed_count(self, value: int) -> None:
        self.whiteboard.task_completed_count = value

    @property
    def bug_fixed_count(self) -> int:
        return self.whiteboard.bug_fixed_count

    @bug_fixed_count.setter
    def bug_fixed_count(self, value: int) -> None:
        self.whiteboard.bug_fixed_count = value

    @property
    def coffee_break_count(self) -> int:
        return self.whiteboard.coffee_break_count

    @coffee_break_count.setter
    def coffee_break_count(self, value: int) -> None:
        self.whiteboard.coffee_break_count = value

    @property
    def code_written_count(self) -> int:
        return self.whiteboard.code_written_count

    @code_written_count.setter
    def code_written_count(self, value: int) -> None:
        self.whiteboard.code_written_count = value

    @property
    def recent_error_count(self) -> int:
        return self.whiteboard.recent_error_count

    @recent_error_count.setter
    def recent_error_count(self, value: int) -> None:
        self.whiteboard.recent_error_count = value

    @property
    def recent_success_count(self) -> int:
        return self.whiteboard.recent_success_count

    @recent_success_count.setter
    def recent_success_count(self, value: int) -> None:
        self.whiteboard.recent_success_count = value

    @property
    def consecutive_successes(self) -> int:
        return self.whiteboard.consecutive_successes

    @consecutive_successes.setter
    def consecutive_successes(self, value: int) -> None:
        self.whiteboard.consecutive_successes = value

    @property
    def last_incident_time(self) -> str | None:
        return self.whiteboard.last_incident_time

    @last_incident_time.setter
    def last_incident_time(self, value: str | None) -> None:
        self.whiteboard.last_incident_time = value

    @property
    def agent_lifespans(self) -> list[AgentLifespan]:
        return self.whiteboard.agent_lifespans

    @agent_lifespans.setter
    def agent_lifespans(self, value: list[AgentLifespan]) -> None:
        self.whiteboard.agent_lifespans = value

    @property
    def news_items(self) -> list[NewsItem]:
        return self.whiteboard.news_items

    @news_items.setter
    def news_items(self, value: list[NewsItem]) -> None:
        self.whiteboard.news_items = value

    @property
    def coffee_cups(self) -> int:
        return self.whiteboard.coffee_cups

    @coffee_cups.setter
    def coffee_cups(self, value: int) -> None:
        self.whiteboard.coffee_cups = value

    @property
    def file_edits(self) -> dict[str, int]:
        return self.whiteboard.file_edits

    @file_edits.setter
    def file_edits(self, value: dict[str, int]) -> None:
        self.whiteboard.file_edits = value

    def to_game_state(self, session_id: str) -> GameState:
        """Convert current state to a GameState for frontend consumption."""
        boss = Boss(
            state=self.boss_state,
            current_task=self.boss_current_task,
            bubble=self.boss_bubble,
        )

        desk_count = min(self.MAX_AGENTS, max(8, ((len(self.agents) + 3) // 4) * 4))

        agents_list: list[Agent] = list(self.agents.values())

        total_tokens = self.total_input_tokens + self.total_output_tokens
        context_utilization = min(1.0, total_tokens / self.MAX_CONTEXT_TOKENS)

        office = OfficeState(
            desk_count=desk_count,
            elevator_state=self.elevator_state,
            phone_state=PhoneState.IDLE,  # Simplified
            context_utilization=context_utilization,
            tool_uses_since_compaction=self.tool_uses_since_compaction,
            print_report=self.print_report,
        )

        activity_level = min(1.0, self.tool_uses_since_compaction / 100.0)

        whiteboard_data = WhiteboardData(
            tool_usage=self.whiteboard.get_tool_usage_snapshot(),
            task_completed_count=self.whiteboard.task_completed_count,
            bug_fixed_count=self.whiteboard.bug_fixed_count,
            coffee_break_count=self.whiteboard.coffee_break_count,
            code_written_count=self.whiteboard.code_written_count,
            recent_error_count=self.whiteboard.recent_error_count,
            recent_success_count=self.whiteboard.recent_success_count,
            activity_level=activity_level,
            consecutive_successes=self.whiteboard.consecutive_successes,
            last_incident_time=self.whiteboard.last_incident_time,
            agent_lifespans=self.whiteboard.get_agent_lifespans_snapshot(),
            news_items=self.whiteboard.get_news_items_snapshot(),
            coffee_cups=self.whiteboard.coffee_cups,
            file_edits=self.whiteboard.get_file_edits_snapshot(),
            background_tasks=self.whiteboard.get_background_tasks_snapshot(),
        )

        return GameState(
            session_id=session_id,
            boss=boss,
            agents=agents_list,
            office=office,
            last_updated=datetime.now(),
            history=self.history,
            todos=self.todos,
            arrival_queue=self.arrival_queue.copy(),
            departure_queue=self.handin_queue.copy(),
            whiteboard_data=whiteboard_data,
            conversation=self.conversation.copy(),
        )

    def remove_agent(self, agent_id: str) -> None:
        """Remove an agent from the office and all queues."""
        if agent_id in self.agents:
            del self.agents[agent_id]
        if agent_id in self.arrival_queue:
            self.arrival_queue.remove(agent_id)
        if agent_id in self.handin_queue:
            self.handin_queue.remove(agent_id)

    def _extract_token_usage_from_jsonl(self, transcript_path: str) -> dict[str, int] | None:
        """Extract the latest token usage from a Claude JSONL transcript file."""
        try:
            settings = get_settings()
            translated_path = settings.translate_path(transcript_path)
            path = Path(translated_path).expanduser()
            if not path.exists():
                return None

            with open(path, "rb") as f:
                f.seek(0, 2)  # Go to end
                file_size = f.tell()
                read_size = min(20000, file_size)
                f.seek(max(0, file_size - read_size))
                content = f.read().decode("utf-8", errors="ignore")

            lines = content.strip().split("\n")
            for line in reversed(lines):
                try:
                    if not line.startswith("{"):
                        continue
                    data = json.loads(line)
                    # Look for usage in message object
                    if "message" in data and isinstance(data["message"], dict):
                        message: dict[str, Any] = cast(dict[str, Any], data["message"])
                        usage = message.get("usage")
                        if usage and isinstance(usage, dict):
                            usage_dict: dict[str, Any] = cast(dict[str, Any], usage)
                            # Calculate total input tokens (fresh + cache)
                            input_tokens: int = (
                                int(usage_dict.get("input_tokens", 0) or 0)
                                + int(usage_dict.get("cache_creation_input_tokens", 0) or 0)
                                + int(usage_dict.get("cache_read_input_tokens", 0) or 0)
                            )
                            output_tokens: int = int(usage_dict.get("output_tokens", 0) or 0)
                            return {
                                "input_tokens": input_tokens,
                                "output_tokens": output_tokens,
                            }
                except json.JSONDecodeError, KeyError:
                    continue

        except Exception:
            pass

        return None

    def _count_tool_uses_from_jsonl(self, transcript_path: str) -> int:
        """Count the number of tool_use blocks in a JSONL transcript."""
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
            return 0

    def _extract_thinking_from_jsonl(
        self, transcript_path: str, max_length: int = 200
    ) -> str | None:
        """Extract the most recent thinking block from a JSONL transcript."""
        try:
            path = Path(transcript_path).expanduser()
            if not path.exists():
                return None

            with open(path, "rb") as f:
                f.seek(0, 2)  # Go to end
                file_size = f.tell()
                read_size = min(50000, file_size)
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
            pass

        return None

    def _update_token_usage(self, event: Event) -> None:
        """Update token counts from event data or JSONL transcript."""
        if not event.data:
            return

        if event.data.input_tokens is not None or event.data.output_tokens is not None:
            if event.data.input_tokens is not None:
                self.total_input_tokens = event.data.input_tokens
            if event.data.output_tokens is not None:
                self.total_output_tokens = event.data.output_tokens
            total = self.total_input_tokens + self.total_output_tokens
            util = min(1.0, total / self.MAX_CONTEXT_TOKENS)
            logger.info(f"Context: {util:.1%} ({total:,}/{self.MAX_CONTEXT_TOKENS:,} tokens)")
            return

        transcript_path = event.data.transcript_path or event.data.agent_transcript_path
        if not transcript_path:
            return

        usage = self._extract_token_usage_from_jsonl(transcript_path)
        if not usage:
            logger.debug(f"No token usage found in {transcript_path}")
            return

        self.total_input_tokens = usage["input_tokens"]
        self.total_output_tokens = usage["output_tokens"]
        total = self.total_input_tokens + self.total_output_tokens
        util = min(1.0, total / self.MAX_CONTEXT_TOKENS)
        logger.info(f"Context: {util:.1%} ({total:,}/{self.MAX_CONTEXT_TOKENS:,} tokens)")

    def transition(self, event: Event) -> None:
        """Process an event and update state accordingly."""
        self._update_token_usage(event)

        if event.event_type == EventType.SESSION_START:
            self.phase = OfficePhase.STARTING
            self.boss_state = BossState.IDLE
            self.whiteboard.reset()
            self.whiteboard.add_news_item("session", "New session started - ready for work!")

        elif event.event_type == EventType.CONTEXT_COMPACTION:
            self.tool_uses_since_compaction = 0
            self.whiteboard.record_compaction()
            self.whiteboard.add_news_item(
                "coffee",
                f"Coffee break #{self.whiteboard.coffee_cups}! Context compacted.",
            )

        elif event.event_type == EventType.PRE_TOOL_USE:
            tool_name = event.data.tool_name if event.data else None

            if tool_name == "TodoWrite":
                self._parse_todo_write(event)

            if tool_name in ("Task", "Agent"):
                # Spawning a subagent (Claude Code may use "Task" or "Agent")
                self.phase = OfficePhase.DELEGATING
                self.boss_state = BossState.DELEGATING
                self.elevator_state = ElevatorState.ARRIVING
            else:
                agent_id = (event.data.agent_id if event.data else None) or "main"

                bubble = self._tool_to_thought(event)
                if agent_id == "main":
                    self.boss_bubble = bubble
                    self.boss_state = BossState.WORKING
                else:
                    if agent_id not in self.agents and len(self.agents) < self.MAX_AGENTS:
                        new_agent = self._create_agent(
                            EventData(
                                agent_id=agent_id,
                                agent_name=f"Ghost {agent_id[-4:]}",
                                task_description="Resumed mid-session",
                            )
                        )
                        new_agent.state = AgentState.WORKING
                        self.agents[agent_id] = new_agent

                    if agent_id in self.agents:
                        self.agents[agent_id].bubble = bubble
                        self.agents[agent_id].state = AgentState.WORKING
                        if agent_id in self.arrival_queue:
                            self.arrival_queue.remove(agent_id)

        elif event.event_type == EventType.USER_PROMPT_SUBMIT:
            self.boss_state = BossState.RECEIVING
            prompt_text = event.data.prompt if event.data else ""
            self.print_report = False
            self.last_user_prompt = prompt_text
            if prompt_text:
                self.boss_bubble = BubbleContent(
                    type=BubbleType.SPEECH,
                    text=prompt_text,
                    icon="📞",
                )
                self.boss_current_task = prompt_text

        elif event.event_type == EventType.PERMISSION_REQUEST:
            agent_id = (event.data.agent_id if event.data else None) or "main"
            tool_name = event.data.tool_name if event.data else "permission"

            waiting_bubble = BubbleContent(
                type=BubbleType.THOUGHT,
                text=f"Waiting: {tool_name}",
                icon="❓",
            )

            if agent_id == "main":
                self.boss_state = BossState.WAITING_PERMISSION
                self.boss_bubble = waiting_bubble
            else:
                if agent_id in self.agents:
                    self.agents[agent_id].state = AgentState.WAITING_PERMISSION
                    self.agents[agent_id].bubble = waiting_bubble

        elif event.event_type == EventType.POST_TOOL_USE:
            agent_id = (event.data.agent_id if event.data else None) or "main"
            if agent_id == "main":
                self.boss_state = BossState.IDLE
            elif (
                agent_id in self.agents
                and self.agents[agent_id].state == AgentState.WAITING_PERMISSION
            ):
                self.agents[agent_id].state = AgentState.WORKING

            self.tool_uses_since_compaction += 1
            self.whiteboard.track_tool_use(event)

        elif event.event_type == EventType.SUBAGENT_START:
            if event.data and event.data.agent_id and len(self.agents) < self.MAX_AGENTS:
                agent = self._create_agent(event.data)
                self.boss_state = BossState.DELEGATING
                self.elevator_state = ElevatorState.OPEN

                if agent.id not in self.arrival_queue:
                    self.arrival_queue.append(agent.id)

                self.agents[agent.id] = agent
                self.phase = OfficePhase.BUSY

                short_name = agent.name or f"Agent-{agent.id[-4:]}"
                self.whiteboard.record_agent_start(agent.id, short_name, agent.color)
                self.whiteboard.add_news_item("agent", f"{short_name} joins the team!")

        elif event.event_type == EventType.SUBAGENT_STOP:
            if event.data:
                agent_id = event.data.agent_id
                native_agent_id = event.data.native_agent_id

                # Try to find agent by agent_id first, then by native_id
                stopping_agent = None
                if agent_id:
                    stopping_agent = self.agents.get(agent_id)
                if not stopping_agent and native_agent_id:
                    # Look up by native_id
                    for aid, agent in self.agents.items():
                        if agent.native_id == native_agent_id:
                            agent_id = aid
                            stopping_agent = agent
                            break

                if stopping_agent and agent_id:
                    stopping_agent.state = AgentState.WAITING
                    if agent_id not in self.handin_queue:
                        self.handin_queue.append(agent_id)

                    self.boss_state = BossState.IDLE

                    if not self.agents:
                        self.phase = OfficePhase.WORKING

                    if event.data.agent_transcript_path:
                        tool_count = self._count_tool_uses_from_jsonl(
                            event.data.agent_transcript_path
                        )
                        if tool_count > 0:
                            self.tool_uses_since_compaction += tool_count
                            logger.debug(
                                f"Credited {tool_count} subagent tool uses to safety counter"
                            )

                    self.whiteboard.record_agent_stop(agent_id)

                    agent_name = stopping_agent.name or f"Agent-{agent_id[-4:]}"
                    self.whiteboard.add_news_item("agent", f"{agent_name} completed their task!")

        elif event.event_type == EventType.CLEANUP:
            if event.data and event.data.agent_id:
                self.remove_agent(event.data.agent_id)

        elif event.event_type == EventType.STOP:
            self.phase = OfficePhase.COMPLETING
            self.boss_state = BossState.COMPLETING

            speech_text = (
                event.data.speech_content.boss_phone
                if event.data and event.data.speech_content and event.data.speech_content.boss_phone
                else get_random_job_completion_quote()
            )
            self.boss_bubble = BubbleContent(
                type=BubbleType.SPEECH,
                text=speech_text,
                icon="📞",
                persistent=True,
            )

            self.whiteboard.add_news_item("session", "Job completed! Great work everyone!")

        elif event.event_type == EventType.SESSION_END:
            self.phase = OfficePhase.ENDED
            self.boss_state = BossState.IDLE
            self.boss_current_task = None

        elif event.event_type == EventType.BACKGROUND_TASK_NOTIFICATION:
            if event.data:
                task_id = event.data.background_task_id or "unknown"
                status = event.data.background_task_status or "completed"
                summary = event.data.background_task_summary

                self.whiteboard.update_background_task(task_id, status, summary)

                status_emoji = "Completed" if status == "completed" else "Failed"
                task_id_short = task_id[:8] if len(task_id) > 8 else task_id
                summary_short = (summary[:30] + "...") if summary and len(summary) > 30 else summary
                headline = f"{status_emoji} Task {task_id_short}: {summary_short or status}"
                self.whiteboard.add_news_item("agent", headline)

    def _tool_to_thought(self, event: Event) -> BubbleContent:
        """Convert a tool use event to thought bubble content."""
        tool_icons = {
            "Read": "📖",
            "Write": "✍️",
            "Edit": "📝",
            "Bash": "💻",
            "Glob": "🔍",
            "Grep": "🔎",
            "WebSearch": "🌐",
            "WebFetch": "📥",
            "Task": "🎯",
        }

        tool_name = event.data.tool_name if event.data else ""
        tool_name = tool_name or ""
        icon = tool_icons.get(tool_name, "⚙️")
        tool_input = event.data.tool_input if (event.data and event.data.tool_input) else {}

        text: str = tool_name

        if tool_name in ["Read", "Glob", "Grep", "Write", "Edit"]:
            path = tool_input.get("file_path") or tool_input.get("pattern", "")
            text = compress_path(path, max_len=35) if isinstance(path, str) and path else tool_name

        elif tool_name == "Bash":
            cmd = tool_input.get("command", "")
            if isinstance(cmd, str) and cmd:
                cmd_clean = cmd.strip().split("\n")[0]
                cmd_clean = compress_paths_in_text(cmd_clean)
                if len(cmd_clean) > 45:
                    cmd_clean = cmd_clean[:42] + "..."
                text = cmd_clean

        elif tool_name in ("Task", "Agent"):
            text = "Delegating..."

        text = compress_paths_in_text(text)
        text = truncate_long_words(text, max_len=35)

        return BubbleContent(type=BubbleType.THOUGHT, text=text, icon=icon)

    def _create_agent(self, data: EventData) -> Agent:
        """Create a new agent from event data."""
        agent_id = data.agent_id or "unknown"
        count = len(self.agents) + 1
        colors = [
            "#3B82F6",
            "#22C55E",
            "#A855F7",
            "#F97316",
            "#EC4899",
            "#06B6D4",
            "#EAB308",
            "#EF4444",
        ]
        color = colors[(count - 1) % len(colors)]

        # Generate short name from description using fallback
        name_source = data.agent_name or data.task_description or ""
        summary_service = get_summary_service()
        short_name = summary_service.generate_agent_name_fallback(name_source)

        return Agent(
            id=agent_id,
            name=short_name,
            color=color,
            number=count,
            state=AgentState.ARRIVING,
            desk=count,
            bubble=None,
            current_task=data.task_description,
        )

    def _parse_todo_write(self, event: Event) -> None:
        """Parse TodoWrite tool input and update the todo list state."""
        if not event.data or not event.data.tool_input:
            return

        tool_input = event.data.tool_input
        todos_data = tool_input.get("todos", [])

        if not isinstance(todos_data, list):
            return

        new_todos: list[TodoItem] = []
        typed_todos_data: list[Any] = cast(list[Any], todos_data)
        for item in typed_todos_data:
            if not isinstance(item, dict):
                continue

            item_dict: dict[str, Any] = cast(dict[str, Any], item)
            content: str = str(item_dict.get("content", ""))
            status_str: str = str(item_dict.get("status", "pending"))
            active_form_raw: Any = item_dict.get("activeForm")
            active_form: str | None = str(active_form_raw) if active_form_raw else None

            # Map status string to TodoStatus enum
            try:
                status = TodoStatus(status_str)
            except ValueError:
                status = TodoStatus.PENDING

            if content:
                new_todos.append(TodoItem(content=content, status=status, active_form=active_form))

        self.todos = new_todos
