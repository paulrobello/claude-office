import logging
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum, auto
from typing import Any, cast

from app.core.path_utils import compress_path, compress_paths_in_text, truncate_long_words
from app.core.quotes import get_random_job_completion_quote
from app.core.summary_service import get_summary_service
from app.core.token_tracker import TokenTracker
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
    KanbanTask,
    NewsItem,
    WhiteboardData,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


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


def _parse_linear_id(subject: str) -> str | None:
    """Extract a Linear-style ID like REC-42 from a subject string."""
    m = re.search(r"\[([A-Z]+-\d+)\]", subject)
    return m.group(1) if m else None


# ---------------------------------------------------------------------------
# Agent resolution (shared by transition and handler modules)
# ---------------------------------------------------------------------------


@dataclass
class ResolvedAgent:
    """Result of agent resolution by ID or native ID."""

    agent_id: str
    agent: Agent
    was_late_linked: bool = False


def resolve_agent_for_stop(
    agents: dict[str, Agent],
    arrival_queue: list[str],
    agent_id: str | None,
    native_agent_id: str | None,
) -> ResolvedAgent | None:
    """Resolve an agent for SUBAGENT_STOP by ID, native ID, or fallback linking.

    Resolution order:
    1. Direct agent_id match (synchronous agents)
    2. Native ID match (agents that received SubagentInfo)
    3. Fallback: link oldest unlinked agent from arrival_queue (missed SubagentInfo)

    The fallback prefers the oldest unlinked agent (FIFO) to handle cases where
    multiple background agents started but SubagentInfo was missed for some.

    Args:
        agents: Dict of agent_id -> Agent
        arrival_queue: List of agent_ids in arrival order
        agent_id: Optional agent_id from event
        native_agent_id: Optional native_agent_id from event

    Returns:
        ResolvedAgent if found, None otherwise
    """
    # 1. Try direct agent_id match
    if agent_id and agent_id in agents:
        return ResolvedAgent(agent_id=agent_id, agent=agents[agent_id])

    if not native_agent_id:
        return None

    # 2. Try native_id match
    for aid, agent in agents.items():
        if agent.native_id == native_agent_id:
            return ResolvedAgent(agent_id=aid, agent=agent)

    # 3. Fallback: link oldest unlinked agent (FIFO from arrival_queue)
    for aid in arrival_queue:
        agent = agents.get(aid)
        if agent and agent.native_id is None:
            agent.native_id = native_agent_id
            logger.info(
                f"Late-linked agent {aid} to native ID {native_agent_id} (SubagentInfo was missed)"
            )
            return ResolvedAgent(agent_id=aid, agent=agent, was_late_linked=True)

    # 4. Last resort: any unlinked agent not in arrival_queue
    for aid, agent in agents.items():
        if agent.native_id is None:
            agent.native_id = native_agent_id
            logger.warning(
                f"Late-linked orphan agent {aid} to native ID {native_agent_id} "
                f"(not in arrival_queue)"
            )
            return ResolvedAgent(agent_id=aid, agent=agent, was_late_linked=True)

    return None


# ---------------------------------------------------------------------------
# Todo parsing -- extracted from StateMachine for single-responsibility.
# ---------------------------------------------------------------------------


def parse_todos_from_event(event: Event) -> list[TodoItem]:
    """Parse TodoWrite tool input from an event and return a new todo list.

    Args:
        event: A PRE_TOOL_USE event whose ``tool_name`` is ``"TodoWrite"``.

    Returns:
        A list of parsed :class:`TodoItem` objects, or an empty list if the
        event data is missing or malformed.
    """
    if not event.data or not event.data.tool_input:
        return []

    tool_input = event.data.tool_input
    todos_data = tool_input.get("todos", [])

    if not isinstance(todos_data, list):
        return []

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

        try:
            status = TodoStatus(status_str)
        except ValueError:
            status = TodoStatus.PENDING

        if content:
            new_todos.append(TodoItem(content=content, status=status, active_form=active_form))

    return new_todos


# ---------------------------------------------------------------------------
# Dispatch table handlers.
# Each handler receives the StateMachine instance and the Event,
# and mutates state in place.  These are plain functions, not methods,
# so the dispatch table can reference them without circular definition issues.
# ---------------------------------------------------------------------------


def _handle_session_start(sm: "StateMachine", event: Event) -> None:
    """Handle SESSION_START: initialize office state for a new session."""
    sm.phase = OfficePhase.STARTING
    sm.boss_state = BossState.IDLE
    sm.whiteboard.reset()
    sm.whiteboard.add_news_item("session", "New session started - ready for work!")


def _handle_context_compaction(sm: "StateMachine", event: Event) -> None:
    """Handle CONTEXT_COMPACTION: reset tool counter and record compaction."""
    sm.tool_uses_since_compaction = 0
    sm.whiteboard.record_compaction()
    sm.whiteboard.add_news_item(
        "coffee",
        f"Coffee break #{sm.whiteboard.coffee_cups}! Context compacted.",
    )


def _handle_pre_tool_use(sm: "StateMachine", event: Event) -> None:
    """Handle PRE_TOOL_USE: update boss/agent state and process TodoWrite events."""
    tool_name = event.data.tool_name if event.data else None

    if tool_name == "TodoWrite":
        parsed = parse_todos_from_event(event)
        if parsed:
            sm.todos = parsed

    if tool_name in ("Task", "Agent"):
        sm.phase = OfficePhase.DELEGATING
        sm.boss_state = BossState.DELEGATING
        sm.elevator_state = ElevatorState.ARRIVING
    else:
        agent_id = (event.data.agent_id if event.data else None) or "main"

        bubble = sm.tool_to_thought(event)
        if agent_id == "main":
            sm.boss_bubble = bubble
            sm.boss_state = BossState.WORKING
        else:
            if agent_id not in sm.agents and len(sm.agents) < sm.MAX_AGENTS:
                new_agent = sm.create_agent(
                    EventData(
                        agent_id=agent_id,
                        agent_name=f"Ghost {agent_id[-4:]}",
                        task_description="Resumed mid-session",
                    )
                )
                new_agent.state = AgentState.WORKING
                sm.agents[agent_id] = new_agent

            if agent_id in sm.agents:
                sm.agents[agent_id].bubble = bubble
                sm.agents[agent_id].state = AgentState.WORKING
                if agent_id in sm.arrival_queue:
                    sm.arrival_queue.remove(agent_id)


def _handle_user_prompt_submit(sm: "StateMachine", event: Event) -> None:
    """Handle USER_PROMPT_SUBMIT: boss receives a new user prompt."""
    sm.boss_state = BossState.RECEIVING
    prompt_text = event.data.prompt if event.data else ""
    sm.print_report = False
    sm.last_user_prompt = prompt_text
    if prompt_text:
        sm.boss_bubble = BubbleContent(
            type=BubbleType.SPEECH,
            text=prompt_text,
            icon="📞",
        )
        sm.boss_current_task = prompt_text


def _handle_permission_request(sm: "StateMachine", event: Event) -> None:
    """Handle PERMISSION_REQUEST: set boss or agent to waiting state."""
    agent_id = (event.data.agent_id if event.data else None) or "main"
    tool_name = event.data.tool_name if event.data else "permission"

    waiting_bubble = BubbleContent(
        type=BubbleType.THOUGHT,
        text=f"Waiting: {tool_name}",
        icon="❓",
    )

    if agent_id == "main":
        sm.boss_state = BossState.WAITING_PERMISSION
        sm.boss_bubble = waiting_bubble
    else:
        if agent_id in sm.agents:
            sm.agents[agent_id].state = AgentState.WAITING_PERMISSION
            sm.agents[agent_id].bubble = waiting_bubble


def _handle_post_tool_use(sm: "StateMachine", event: Event) -> None:
    """Handle POST_TOOL_USE: increment tool counter and reset agent state."""
    agent_id = (event.data.agent_id if event.data else None) or "main"
    if agent_id == "main":
        sm.boss_state = BossState.IDLE
    elif agent_id in sm.agents and sm.agents[agent_id].state == AgentState.WAITING_PERMISSION:
        sm.agents[agent_id].state = AgentState.WORKING

    sm.tool_uses_since_compaction += 1
    sm.whiteboard.track_tool_use(event)


def _handle_subagent_start(sm: "StateMachine", event: Event) -> None:
    """Handle SUBAGENT_START: create a new agent and add to arrival queue."""
    if event.data and event.data.agent_id and len(sm.agents) < sm.MAX_AGENTS:
        agent = sm.create_agent(event.data)
        sm.boss_state = BossState.DELEGATING
        sm.elevator_state = ElevatorState.OPEN

        if agent.id not in sm.arrival_queue:
            sm.arrival_queue.append(agent.id)

        sm.agents[agent.id] = agent
        sm.phase = OfficePhase.BUSY

        short_name = agent.name or f"Agent-{agent.id[-4:]}"
        sm.whiteboard.record_agent_start(agent.id, short_name, agent.color)
        sm.whiteboard.add_news_item("agent", f"{short_name} joins the team!")


def _handle_subagent_stop(sm: "StateMachine", event: Event) -> None:
    """Handle SUBAGENT_STOP: resolve agent, add to departure queue, credit tool uses."""
    if event.data:
        resolved = resolve_agent_for_stop(
            agents=sm.agents,
            arrival_queue=sm.arrival_queue,
            agent_id=event.data.agent_id,
            native_agent_id=event.data.native_agent_id,
        )

        if resolved:
            agent_id = resolved.agent_id
            stopping_agent = resolved.agent
            stopping_agent.state = AgentState.WAITING
            if agent_id not in sm.handin_queue:
                sm.handin_queue.append(agent_id)

            sm.boss_state = BossState.IDLE

            if not sm.agents:
                sm.phase = OfficePhase.WORKING

            if event.data.agent_transcript_path:
                tool_count = sm.token_tracker.count_tool_uses_from_jsonl(
                    event.data.agent_transcript_path
                )
                if tool_count > 0:
                    sm.tool_uses_since_compaction += tool_count
                    logger.debug(f"Credited {tool_count} subagent tool uses to safety counter")

            sm.whiteboard.record_agent_stop(agent_id)

            agent_name = stopping_agent.name or f"Agent-{agent_id[-4:]}"
            sm.whiteboard.add_news_item("agent", f"{agent_name} completed their task!")


def _handle_cleanup(sm: "StateMachine", event: Event) -> None:
    """Handle CLEANUP: remove a departed agent from all state."""
    if event.data and event.data.agent_id:
        sm.remove_agent(event.data.agent_id)


def _handle_stop(sm: "StateMachine", event: Event) -> None:
    """Handle STOP: main agent completes work, show completion message."""
    sm.phase = OfficePhase.COMPLETING
    sm.boss_state = BossState.COMPLETING

    speech_text = (
        event.data.speech_content.boss_phone
        if event.data and event.data.speech_content and event.data.speech_content.boss_phone
        else get_random_job_completion_quote()
    )
    sm.boss_bubble = BubbleContent(
        type=BubbleType.SPEECH,
        text=speech_text,
        icon="📞",
        persistent=True,
    )

    sm.whiteboard.add_news_item("session", "Job completed! Great work everyone!")


def _handle_session_end(sm: "StateMachine", event: Event) -> None:
    """Handle SESSION_END: mark session as ended."""
    sm.phase = OfficePhase.ENDED
    sm.boss_state = BossState.IDLE
    sm.boss_current_task = None


def _handle_background_task_notification(sm: "StateMachine", event: Event) -> None:
    """Handle BACKGROUND_TASK_NOTIFICATION: update background task status on whiteboard."""
    if event.data:
        task_id = event.data.background_task_id or "unknown"
        status = event.data.background_task_status or "completed"
        summary = event.data.background_task_summary

        sm.whiteboard.update_background_task(task_id, status, summary)

        status_emoji = "Completed" if status == "completed" else "Failed"
        task_id_short = task_id[:8] if len(task_id) > 8 else task_id
        summary_short = (summary[:30] + "...") if summary and len(summary) > 30 else summary
        headline = f"{status_emoji} Task {task_id_short}: {summary_short or status}"
        sm.whiteboard.add_news_item("agent", headline)


def _handle_task_created(sm: "StateMachine", event: Event) -> None:
    """Handle TASK_CREATED: create a KanbanTask entry for Agent Teams."""
    task_id = event.data.task_id if event.data else None
    if not task_id:
        return
    subject = event.data.task_subject or "" if event.data else ""
    sm.kanban_tasks[task_id] = KanbanTask(
        task_id=task_id,
        subject=subject,
        status="pending",
        assignee=sm.teammate_name,
        linear_id=_parse_linear_id(subject),
    )


def _handle_task_completed(sm: "StateMachine", event: Event) -> None:
    """Handle TASK_COMPLETED: mark a KanbanTask as completed for Agent Teams."""
    task_id = event.data.task_id if event.data else None
    if not task_id:
        return
    subject = event.data.task_subject or "" if event.data else ""
    if task_id in sm.kanban_tasks:
        sm.kanban_tasks[task_id].status = "completed"
    else:
        sm.kanban_tasks[task_id] = KanbanTask(
            task_id=task_id,
            subject=subject,
            status="completed",
            assignee=sm.teammate_name,
            linear_id=_parse_linear_id(subject),
        )


def _handle_teammate_idle(sm: "StateMachine", event: Event) -> None:
    """Handle TEAMMATE_IDLE: set teammate boss state to idle."""
    sm.boss_state = BossState.IDLE
    sm.boss_bubble = None


# ---------------------------------------------------------------------------
# Dispatch table: EventType -> handler callable.
# ---------------------------------------------------------------------------

_DISPATCH_TABLE: dict[EventType, Callable[["StateMachine", Event], None]] = {
    EventType.SESSION_START: _handle_session_start,
    EventType.CONTEXT_COMPACTION: _handle_context_compaction,
    EventType.PRE_TOOL_USE: _handle_pre_tool_use,
    EventType.USER_PROMPT_SUBMIT: _handle_user_prompt_submit,
    EventType.PERMISSION_REQUEST: _handle_permission_request,
    EventType.POST_TOOL_USE: _handle_post_tool_use,
    EventType.SUBAGENT_START: _handle_subagent_start,
    EventType.SUBAGENT_STOP: _handle_subagent_stop,
    EventType.CLEANUP: _handle_cleanup,
    EventType.STOP: _handle_stop,
    EventType.SESSION_END: _handle_session_end,
    EventType.BACKGROUND_TASK_NOTIFICATION: _handle_background_task_notification,
    EventType.TASK_CREATED: _handle_task_created,
    EventType.TASK_COMPLETED: _handle_task_completed,
    EventType.TEAMMATE_IDLE: _handle_teammate_idle,
}


# ---------------------------------------------------------------------------
# OfficePhase enum
# ---------------------------------------------------------------------------


class OfficePhase(Enum):
    EMPTY = auto()  # No active session
    STARTING = auto()  # Session starting, boss arriving
    IDLE = auto()  # Boss at desk, no active work
    WORKING = auto()  # Boss actively working
    DELEGATING = auto()  # Boss spawning agents
    BUSY = auto()  # Multiple agents working
    COMPLETING = auto()  # Wrapping up work
    ENDED = auto()  # Session complete


# ---------------------------------------------------------------------------
# StateMachine
# ---------------------------------------------------------------------------


@dataclass
class StateMachine:
    """Manages office state and processes events to track agents, boss, and office elements.

    State mutation happens exclusively through :meth:`transition`, which
    delegates to a dispatch table of handler functions.  External handler
    modules (in ``app.core.handlers``) perform enrichment, polling, and
    broadcasting but should not set core state fields directly.
    """

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
    token_tracker: TokenTracker = field(default_factory=TokenTracker)
    tool_uses_since_compaction: int = 0
    print_report: bool = False
    last_user_prompt: str | None = None
    background_tasks: list[BackgroundTask] = field(default_factory=_empty_background_tasks)
    conversation: list[ConversationEntry] = field(default_factory=_empty_conversation)

    # Floor/room assignment for multi-floor building navigation
    floor_id: str | None = None
    room_id: str | None = None

    # Agent Teams support (used by RoomOrchestrator)
    is_lead: bool = True
    teammate_name: str | None = None
    team_name: str | None = None
    kanban_tasks: dict[str, KanbanTask] = field(
        default_factory=lambda: cast(dict[str, KanbanTask], {})
    )

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

    # ---------------------------------------------------------------------------
    # Backward-compatible property aliases for token fields.
    # ---------------------------------------------------------------------------

    @property
    def total_input_tokens(self) -> int:
        return self.token_tracker.total_input_tokens

    @total_input_tokens.setter
    def total_input_tokens(self, value: int) -> None:
        self.token_tracker.total_input_tokens = value

    @property
    def total_output_tokens(self) -> int:
        return self.token_tracker.total_output_tokens

    @total_output_tokens.setter
    def total_output_tokens(self, value: int) -> None:
        self.token_tracker.total_output_tokens = value

    # ---------------------------------------------------------------------------
    # Core methods
    # ---------------------------------------------------------------------------

    def to_game_state(self, session_id: str) -> GameState:
        """Convert current state to a GameState for frontend consumption.

        Builds a complete snapshot including boss, agents, office layout,
        whiteboard data, queues, conversation history, and floor assignment.

        Args:
            session_id: The session identifier to include in the GameState.

        Returns:
            A GameState instance representing the current office state.
        """
        boss = Boss(
            state=self.boss_state,
            current_task=self.boss_current_task,
            bubble=self.boss_bubble,
        )

        desk_count = min(self.MAX_AGENTS, max(8, ((len(self.agents) + 3) // 4) * 4))

        agents_list: list[Agent] = list(self.agents.values())

        context_utilization = self.token_tracker.context_utilization

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
            kanban_tasks=list(self.kanban_tasks.values()),
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
            floor_id=self.floor_id,
            room_id=self.room_id,
        )

    def remove_agent(self, agent_id: str) -> None:
        """Remove an agent from the office and all queues.

        Deletes the agent from the agents dict, arrival queue, and
        handin (departure) queue.

        Args:
            agent_id: The identifier of the agent to remove.
        """
        if agent_id in self.agents:
            del self.agents[agent_id]
        if agent_id in self.arrival_queue:
            self.arrival_queue.remove(agent_id)
        if agent_id in self.handin_queue:
            self.handin_queue.remove(agent_id)

    def transition(self, event: Event) -> None:
        """Process an event and update state accordingly.

        Uses a dispatch table mapping :class:`EventType` to a handler
        callable instead of an if/elif chain.  Token usage is always
        updated first via :attr:`token_tracker`.

        If the handler raises an exception, a warning is logged but the
        event is not silently swallowed.  State may be partially updated;
        callers that need full rollback should wrap this in a higher-level
        transaction.
        """
        self.token_tracker.update_from_event(event)

        handler = _DISPATCH_TABLE.get(event.event_type)
        if handler is not None:
            try:
                handler(self, event)
            except Exception:
                logger.warning(
                    "Handler for %s raised an exception; state may be partially updated",
                    event.event_type,
                    exc_info=True,
                )
                raise

    def tool_to_thought(self, event: Event) -> BubbleContent:
        """Convert a tool use event to thought bubble content.

        Maps tool names to icons and extracts relevant context (file paths,
        command snippets) for display in character thought bubbles.

        Args:
            event: A PRE_TOOL_USE or POST_TOOL_USE event.

        Returns:
            A BubbleContent with type THOUGHT, a short description, and an icon.
        """
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

    def create_agent(self, data: EventData) -> Agent:
        """Create a new agent from event data.

        Assigns a color from the palette, generates a short name via the
        summary service, and sets initial state to ARRIVING.

        Args:
            data: EventData containing agent_id, agent_name, and
                task_description fields.

        Returns:
            A new Agent instance ready to be added to the office.
        """
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
