# backend/tests/test_websocket_room.py
"""Tests for room-level WebSocket connection management."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.websocket import ConnectionManager


class TestRoomConnections:
    @pytest.mark.asyncio
    async def test_connect_room_registers_connection(self) -> None:
        mgr = ConnectionManager()
        ws = AsyncMock()
        ws.client_state = MagicMock()
        await mgr.connect_room(ws, "room-1")
        assert "room-1" in mgr.room_connections
        assert ws in mgr.room_connections["room-1"]

    @pytest.mark.asyncio
    async def test_disconnect_room_removes_connection(self) -> None:
        mgr = ConnectionManager()
        ws = AsyncMock()
        ws.client_state = MagicMock()
        await mgr.connect_room(ws, "room-1")
        await mgr.disconnect_room(ws, "room-1")
        assert "room-1" not in mgr.room_connections

    @pytest.mark.asyncio
    async def test_broadcast_room_sends_to_room_connections(self) -> None:
        mgr = ConnectionManager()
        ws = AsyncMock()
        from starlette.websockets import WebSocketState
        ws.client_state = WebSocketState.CONNECTED
        await mgr.connect_room(ws, "room-1")
        await mgr.broadcast_room({"type": "test"}, "room-1")
        ws.send_json.assert_called_once_with({"type": "test"})

    @pytest.mark.asyncio
    async def test_broadcast_room_noop_when_no_connections(self) -> None:
        mgr = ConnectionManager()
        # Should not raise
        await mgr.broadcast_room({"type": "test"}, "room-with-no-subs")
