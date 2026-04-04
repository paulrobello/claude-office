"""Handler for PRE_TOOL_USE and POST_TOOL_USE events.

Responsibilities:
- Appending thinking and tool-call entries to the conversation log.
- Broadcasting state after each tool event.
"""

import logging

from app.core.broadcast_service import broadcast_state
from app.core.state_machine import StateMachine
from app.models.common import BubbleContent, BubbleType
from app.models.events import Event
from app.models.sessions import ConversationEntry

__all__ = [
    "handle_pre_tool_use",
]

logger = logging.getLogger(__name__)


async def handle_pre_tool_use(
    sm: StateMachine,
    event: Event,
    agent_id: str,
    event_summary: str,
) -> None:
    """Handle a PRE_TOOL_USE event.

    Appends any thinking block and the tool call itself to the conversation
    history, then broadcasts updated state.

    Args:
        sm: The StateMachine for this session.
        event: The PRE_TOOL_USE event.
        agent_id: The resolved agent ID (``"main"`` for the boss).
        event_summary: Human-readable summary already computed by the router.
    """
    if not event.data:
        return

    ts = event.timestamp.isoformat()
    aid = agent_id or "main"

    # Capture thinking block if present.
    if event.data.thinking:
        thinking_entry: ConversationEntry = {
            "id": f"{event.timestamp.timestamp()}_thinking",
            "role": "thinking",
            "agentId": aid,
            "text": event.data.thinking,
            "timestamp": ts,
        }
        sm.conversation.append(thinking_entry)

    # Capture the tool call itself.
    if event.data.tool_name:
        tool_entry: ConversationEntry = {
            "id": f"{event.timestamp.timestamp()}_tool",
            "role": "tool",
            "agentId": aid,
            "text": event_summary,
            "timestamp": ts,
            "toolName": event.data.tool_name,
        }
        sm.conversation.append(tool_entry)

    # Set a bubble on the agent/boss showing the tool being used
    tool_name = event.data.tool_name or ""
    entity_id = agent_id if agent_id != "main" else None
    icon = _tool_icon(tool_name)
    bubble = BubbleContent(
        type=BubbleType.SPEECH,
        text=event_summary[:80] if event_summary else tool_name,
        icon=icon,
    )

    if entity_id and entity_id in sm.agents:
        sm.agents[entity_id].bubble = bubble
    elif agent_id == "main":
        sm.boss.bubble = bubble

    await broadcast_state(event.session_id, sm)


def _tool_icon(tool_name: str) -> str:
    """Return an emoji icon for a tool name."""
    icons = {
        "Read": "\U0001f4d6",
        "Write": "\u270f\ufe0f",
        "Edit": "\U0001f527",
        "Bash": "\U0001f4bb",
        "Glob": "\U0001f50d",
        "Grep": "\U0001f50e",
        "Agent": "\U0001f916",
        "Task": "\U0001f4cb",
        "WebSearch": "\U0001f310",
        "WebFetch": "\U0001f310",
    }
    return icons.get(tool_name, "\u26a1")
