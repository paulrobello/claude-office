"""WebSocket broadcasting helpers for the EventProcessor.

Provides standalone async functions that send state and event payloads to all
WebSocket connections for a given session.  Extracted from EventProcessor so
that handler modules can import just what they need without pulling in the
full EventProcessor class.
"""

from typing import TYPE_CHECKING, Any

from app.api.websocket import manager
from app.core.state_machine import StateMachine
from app.models.sessions import GameState, HistoryEntry

if TYPE_CHECKING:
    from app.core.room_orchestrator import RoomOrchestrator

__all__ = [
    "broadcast_state",
    "broadcast_event",
    "broadcast_error",
    "broadcast_room_state",
]


async def broadcast_state(session_id: str, sm: StateMachine) -> None:
    """Broadcast the current GameState to all clients connected to *session_id*.

    Args:
        session_id: The session whose clients should receive the update.
        sm: The StateMachine holding current state.
    """
    game_state: GameState = sm.to_game_state(session_id)
    await manager.broadcast(
        {
            "type": "state_update",
            "timestamp": game_state.last_updated.isoformat(),
            "state": game_state.model_dump(mode="json", by_alias=True),
        },
        session_id,
    )


async def broadcast_event(
    session_id: str,
    event_dict: HistoryEntry,
) -> None:
    """Broadcast a single event payload to all clients connected to *session_id*.

    Args:
        session_id: The session whose clients should receive the event.
        event_dict: The history-entry TypedDict describing the event.
    """
    payload: dict[str, Any] = {
        "type": "event",
        "timestamp": event_dict["timestamp"],
        "event": dict(event_dict),
    }
    await manager.broadcast(payload, session_id)


async def broadcast_error(session_id: str, message: str, timestamp: str) -> None:
    """Broadcast an error message to all clients connected to *session_id*.

    Args:
        session_id: The session whose clients should receive the error.
        message: Human-readable error description.
        timestamp: ISO-format timestamp string for the error.
    """
    await manager.broadcast(
        {
            "type": "error",
            "message": message,
            "timestamp": timestamp,
        },
        session_id,
    )


async def broadcast_room_state(room_id: str, orchestrator: RoomOrchestrator) -> None:
    """Broadcast merged room state to all WebSocket clients subscribed to a room."""
    merged_state = orchestrator.merge()
    if merged_state is None:
        return
    await manager.broadcast_room(
        {
            "type": "state_update",
            "timestamp": merged_state.last_updated.isoformat(),
            "state": merged_state.model_dump(mode="json", by_alias=True),
        },
        room_id,
    )
