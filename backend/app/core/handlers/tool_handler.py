"""Handler for PRE_TOOL_USE and POST_TOOL_USE events.

Responsibilities:
- Appending thinking and tool-call entries to the conversation log.
- Broadcasting state after each tool event.
"""

import logging

from app.core.broadcast_service import broadcast_state
from app.core.state_machine import StateMachine
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

    await broadcast_state(event.session_id, sm)
