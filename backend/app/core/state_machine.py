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


def _empty_tool_usage() -> dict[str, int]:
    return cast(dict[str, int], {})


def _empty_agent_lifespans() -> list[AgentLifespan]:
    return cast(list[AgentLifespan], [])


def _empty_news_items() -> list[NewsItem]:
    return cast(list[NewsItem], [])


def _empty_file_edits() -> dict[str, int]:
    return cast(dict[str, int], {})


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

    tool_usage: dict[str, int] = field(default_factory=_empty_tool_usage)
    task_completed_count: int = 0
    bug_fixed_count: int = 0
    coffee_break_count: int = 0
    code_written_count: int = 0
    recent_error_count: int = 0
    recent_success_count: int = 0
    consecutive_successes: int = 0
    last_incident_time: str | None = None
    agent_lifespans: list[AgentLifespan] = field(default_factory=_empty_agent_lifespans)
    news_items: list[NewsItem] = field(default_factory=_empty_news_items)
    coffee_cups: int = 0
    file_edits: dict[str, int] = field(default_factory=_empty_file_edits)

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
            tool_usage=self.tool_usage.copy(),
            task_completed_count=self.task_completed_count,
            bug_fixed_count=self.bug_fixed_count,
            coffee_break_count=self.coffee_break_count,
            code_written_count=self.code_written_count,
            recent_error_count=self.recent_error_count,
            recent_success_count=self.recent_success_count,
            activity_level=activity_level,
            consecutive_successes=self.consecutive_successes,
            last_incident_time=self.last_incident_time,
            agent_lifespans=self.agent_lifespans.copy(),
            news_items=self.news_items.copy(),
            coffee_cups=self.coffee_cups,
            file_edits=self.file_edits.copy(),
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
                except (json.JSONDecodeError, KeyError):
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

    def _add_news_item(self, category: str, headline: str) -> None:
        """Add a news item to the ticker, keeping only the last 20 items."""
        news_item = NewsItem(
            category=category,
            headline=headline,
            timestamp=datetime.now().isoformat(),
        )
        self.news_items.insert(0, news_item)
        if len(self.news_items) > 20:
            self.news_items = self.news_items[:20]

    def _categorize_tool(self, tool_name: str) -> str:
        """Categorize a tool name into a broader category for pizza chart."""
        tool_categories = {
            "Read": "read",
            "Glob": "read",
            "Grep": "read",
            "Write": "write",
            "Edit": "edit",
            "Bash": "bash",
            "Task": "task",
            "TodoWrite": "todo",
            "WebSearch": "web",
            "WebFetch": "web",
        }
        return tool_categories.get(tool_name, "other")

    def _track_tool_use(self, event: Event) -> None:
        """Track tool usage statistics for whiteboard display."""
        if not event.data:
            return

        tool_name = event.data.tool_name or "unknown"
        tool_input: dict[str, str | int | bool | list[str] | None] = event.data.tool_input or {}
        success = event.data.success
        error_type = event.data.error_type

        category = self._categorize_tool(tool_name)
        self.tool_usage[category] = self.tool_usage.get(category, 0) + 1

        if success is False or error_type:
            self.recent_error_count += 1
            self.consecutive_successes = 0
            self.last_incident_time = datetime.now().isoformat()
            error_msg = error_type or "unknown error"
            self._add_news_item("error", f"⚠️ {tool_name} failed: {error_msg}")
        else:
            self.recent_success_count += 1
            self.consecutive_successes += 1

        if tool_name in ("Edit", "Write"):
            self.code_written_count += 1

            file_path = tool_input.get("file_path", "")
            if isinstance(file_path, str) and file_path:
                file_name = file_path.split("/")[-1] if "/" in file_path else file_path
                self.file_edits[file_name] = self.file_edits.get(file_name, 0) + 1

        if tool_name == "Bash":
            cmd = tool_input.get("command", "")
            if isinstance(cmd, str) and "fix" in cmd.lower():
                self.bug_fixed_count += 1

        if tool_name == "TodoWrite":
            todos_data = tool_input.get("todos", [])
            if isinstance(todos_data, list):
                completed_count = 0
                for t in todos_data:
                    if isinstance(t, dict):
                        t_dict: dict[str, str] = cast(dict[str, str], t)
                        if t_dict.get("status") == "completed":
                            completed_count += 1
                self.task_completed_count = completed_count

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
            self.tool_usage = {}
            self.task_completed_count = 0
            self.bug_fixed_count = 0
            self.coffee_break_count = 0
            self.code_written_count = 0
            self.recent_error_count = 0
            self.recent_success_count = 0
            self.consecutive_successes = 0
            self.last_incident_time = None
            self.agent_lifespans = []
            self.news_items = []
            self.coffee_cups = 0
            self.file_edits = {}
            self._add_news_item("session", "📋 New session started - ready for work!")

        elif event.event_type == EventType.CONTEXT_COMPACTION:
            self.tool_uses_since_compaction = 0
            self.coffee_cups += 1
            self.coffee_break_count += 1
            self._add_news_item(
                "coffee", f"☕ Coffee break #{self.coffee_cups}! Context compacted."
            )

        elif event.event_type == EventType.PRE_TOOL_USE:
            tool_name = event.data.tool_name if event.data else None

            if tool_name == "TodoWrite":
                self._parse_todo_write(event)

            if tool_name == "Task":
                # Spawning a subagent
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
            self._track_tool_use(event)

        elif event.event_type == EventType.SUBAGENT_START:
            if event.data and event.data.agent_id and len(self.agents) < self.MAX_AGENTS:
                agent = self._create_agent(event.data)
                self.boss_state = BossState.DELEGATING
                self.elevator_state = ElevatorState.OPEN

                if agent.id not in self.arrival_queue:
                    self.arrival_queue.append(agent.id)

                self.agents[agent.id] = agent
                self.phase = OfficePhase.BUSY

                # Use short name from agent (already generated in _create_agent)
                short_name = agent.name or f"Agent-{agent.id[-4:]}"
                self.agent_lifespans.append(
                    AgentLifespan(
                        agent_id=agent.id,
                        agent_name=short_name,
                        color=agent.color,
                        start_time=datetime.now().isoformat(),
                        end_time=None,
                    )
                )
                if len(self.agent_lifespans) > 10:
                    self.agent_lifespans = self.agent_lifespans[-10:]

                self._add_news_item("agent", f"🆕 {short_name} joins the team!")

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

                    for lifespan in self.agent_lifespans:
                        if lifespan.agent_id == agent_id and lifespan.end_time is None:
                            lifespan.end_time = datetime.now().isoformat()
                            break

                    agent_name = stopping_agent.name or f"Agent-{agent_id[-4:]}"
                    self._add_news_item("agent", f"✅ {agent_name} completed their task!")

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

            self._add_news_item("session", "🎉 Job completed! Great work everyone!")

        elif event.event_type == EventType.SESSION_END:
            self.phase = OfficePhase.ENDED
            self.boss_state = BossState.IDLE
            self.boss_current_task = None

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

        elif tool_name == "Task":
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
