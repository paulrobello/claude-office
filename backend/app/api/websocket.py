import asyncio
import logging
import re
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)

# Valid session/room IDs: alphanumeric, dashes, underscores only
_VALID_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")

# Origins permitted for WebSocket connections (localhost only)
_ALLOWED_WS_ORIGINS = frozenset(
    {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    }
)


def validate_websocket_origin(websocket: WebSocket) -> bool:
    """Check the Origin header on a WebSocket handshake.

    Returns True if the origin is allowed (localhost) or absent (non-browser
    clients like the test suite may not send Origin).  Returns False for
    disallowed origins.
    """
    origin = websocket.headers.get("origin")
    if origin is None:
        # Non-browser clients (curl, test suite) -- rely on localhost middleware
        return True
    return origin.rstrip("/") in _ALLOWED_WS_ORIGINS


def validate_session_id(session_id: str) -> bool:
    """Return True if *session_id* matches the expected format."""
    return bool(_VALID_ID_PATTERN.match(session_id))


class ConnectionManager:
    """Manages WebSocket connections grouped by session ID."""

    def __init__(self) -> None:
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.room_connections: dict[str, list[WebSocket]] = {}
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Generic broadcast helper
    # ------------------------------------------------------------------

    async def _broadcast_to_connections(
        self,
        message: dict[str, Any],
        connections: list[WebSocket],
        connection_map: dict[str, list[WebSocket]],
        group_key: str,
    ) -> None:
        """Send a message to a list of WebSocket connections and prune failures.

        Args:
            message: JSON-serializable payload to send.
            connections: Snapshot of connections to iterate.
            connection_map: The master dict (``active_connections`` or
                ``room_connections``) to prune dead sockets from.
            group_key: The key within *connection_map* to clean up.
        """
        failed: list[WebSocket] = []
        for connection in connections:
            try:
                if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_json(message)
            except Exception as e:
                logger.warning("Failed to send to WebSocket (%s): %s", group_key, e)
                failed.append(connection)

        if failed:
            async with self._lock:
                group = connection_map.get(group_key)
                if group:
                    for conn in failed:
                        if conn in group:
                            group.remove(conn)
                    if not group:
                        del connection_map[group_key]

    # ------------------------------------------------------------------
    # Session-level operations
    # ------------------------------------------------------------------

    async def connect(self, websocket: WebSocket, session_id: str) -> None:
        """Accept a WebSocket connection and register it for a session."""
        await websocket.accept()
        async with self._lock:
            if session_id not in self.active_connections:
                self.active_connections[session_id] = []
            self.active_connections[session_id].append(websocket)

    async def disconnect(self, websocket: WebSocket, session_id: str) -> None:
        """Remove a WebSocket connection from a session."""
        async with self._lock:
            if session_id in self.active_connections:
                if websocket in self.active_connections[session_id]:
                    self.active_connections[session_id].remove(websocket)
                if not self.active_connections[session_id]:
                    del self.active_connections[session_id]

    async def broadcast(self, message: dict[str, Any], session_id: str) -> None:
        """Send a message to all WebSocket connections for a session."""
        async with self._lock:
            connections = self.active_connections.get(session_id, []).copy()

        if not connections:
            return

        await self._broadcast_to_connections(
            message, connections, self.active_connections, session_id
        )

    async def send_personal_message(self, message: dict[str, Any], websocket: WebSocket) -> None:
        """Send a message to a specific WebSocket connection."""
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_json(message)
        except Exception as e:
            logger.warning("Failed to send personal message: %s", e)

    async def broadcast_all(self, message: dict[str, Any]) -> None:
        """Broadcast a message to ALL connected clients across all sessions."""
        async with self._lock:
            all_connections: list[tuple[str, WebSocket]] = []
            for session_id, connections in self.active_connections.items():
                for conn in connections:
                    all_connections.append((session_id, conn))

        if not all_connections:
            return

        failed_connections: list[tuple[str, WebSocket]] = []
        for session_id, connection in all_connections:
            try:
                if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_json(message)
            except Exception as e:
                logger.warning("Failed to broadcast to WebSocket: %s", e)
                failed_connections.append((session_id, connection))

        if failed_connections:
            async with self._lock:
                for session_id, conn in failed_connections:
                    group = self.active_connections.get(session_id)
                    if group:
                        if conn in group:
                            group.remove(conn)
                        if not group:
                            del self.active_connections[session_id]

    # ------------------------------------------------------------------
    # Room-level WebSocket support
    # ------------------------------------------------------------------

    async def connect_room(self, websocket: WebSocket, room_id: str) -> None:
        """Accept a WebSocket connection and register it for a room."""
        await websocket.accept()
        async with self._lock:
            if room_id not in self.room_connections:
                self.room_connections[room_id] = []
            self.room_connections[room_id].append(websocket)

    async def disconnect_room(self, websocket: WebSocket, room_id: str) -> None:
        """Remove a WebSocket connection from a room."""
        async with self._lock:
            if room_id in self.room_connections:
                if websocket in self.room_connections[room_id]:
                    self.room_connections[room_id].remove(websocket)
                if not self.room_connections[room_id]:
                    del self.room_connections[room_id]

    async def broadcast_room(self, message: dict[str, Any], room_id: str) -> None:
        """Send a message to all WebSocket connections for a room."""
        async with self._lock:
            connections = self.room_connections.get(room_id, []).copy()

        if not connections:
            return

        await self._broadcast_to_connections(message, connections, self.room_connections, room_id)


manager = ConnectionManager()


def get_manager() -> ConnectionManager:
    """FastAPI-compatible dependency that returns the ConnectionManager singleton.

    Use via ``Depends(get_manager)`` in route handlers for testability.
    Tests can call ``override_manager(instance)`` to inject a mock.
    """
    return manager


def override_manager(instance: ConnectionManager) -> None:
    """Replace the module-level singleton with *instance* (for testing)."""
    global manager
    manager = instance
