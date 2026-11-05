"""Handler for PRE_TOOL_USE and POST_TOOL_USE events.

Responsibilities:
- Appending thinking and tool-call entries to the conversation log.
- Broadcasting state after each tool event.
"""

import logging

from app.core.broadcast_service import broadcast_state
from app.core.state_machine import StateMachine
from app.models.events import ToolEvent
from app.models.sessions import ConversationEntry

__all__ = [
    "handle_pre_tool_use",
]

logger = logging.getLogger(__name__)


async def handle_pre_tool_use(
    sm: StateMachine,
    event: ToolEvent,
    agent_id: str,
    event_summary: str,
    entry_id: str,
) -> None:
    """Handle a PRE_TOOL_USE event.

    Appends any thinking block and the tool call itself to the conversation
    history, then broadcasts updated state.

    Args:
        sm: The StateMachine for this session.
        event: The PRE_TOOL_USE event.
        agent_id: The resolved agent ID (``"main"`` for the boss).
        event_summary: Human-readable summary already computed by the router.
        entry_id: Unique id for this event's entry, built by the processor from
            the persisted event row (see ``EventProcessor._entry_id``). The
            thinking / tool entries derive their ids from it, so two tool events
            that share a timestamp no longer collide on the ``_tool`` key.
    """
    ts = event.timestamp.isoformat()
    aid = agent_id or "main"

    # Capture thinking block if present.
    if event.data.thinking:
        thinking_entry: ConversationEntry = {
            "id": f"{entry_id}_thinking",
            "role": "thinking",
            "agentId": aid,
            "text": event.data.thinking,
            "timestamp": ts,
        }
        sm.append_capped(thinking_entry)

    # Capture the tool call itself.
    if event.data.tool_name:
        tool_entry: ConversationEntry = {
            "id": f"{entry_id}_tool",
            "role": "tool",
            "agentId": aid,
            "text": event_summary,
            "timestamp": ts,
            "toolName": event.data.tool_name,
        }
        sm.append_capped(tool_entry)

    await broadcast_state(event.session_id, sm)
