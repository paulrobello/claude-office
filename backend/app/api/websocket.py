import asyncio
import logging
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections grouped by session ID."""

    def __init__(self) -> None:
        self.active_connections: dict[str, list[WebSocket]] = {}
        self._lock = asyncio.Lock()

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

        failed_connections: list[WebSocket] = []
        for connection in connections:
            try:
                if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket: {e}")
                failed_connections.append(connection)

        if failed_connections:
            async with self._lock:
                if session_id in self.active_connections:
                    for conn in failed_connections:
                        if conn in self.active_connections[session_id]:
                            self.active_connections[session_id].remove(conn)
                    if not self.active_connections[session_id]:
                        del self.active_connections[session_id]

    async def send_personal_message(self, message: dict[str, Any], websocket: WebSocket) -> None:
        """Send a message to a specific WebSocket connection."""
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_json(message)
        except Exception as e:
            logger.warning(f"Failed to send personal message: {e}")

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
                logger.warning(f"Failed to broadcast to WebSocket: {e}")
                failed_connections.append((session_id, connection))

        if failed_connections:
            async with self._lock:
                for session_id, conn in failed_connections:
                    if session_id in self.active_connections:
                        if conn in self.active_connections[session_id]:
                            self.active_connections[session_id].remove(conn)
                        if not self.active_connections[session_id]:
                            del self.active_connections[session_id]


manager = ConnectionManager()
