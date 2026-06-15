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


class TestOverviewConnections:
    @pytest.mark.asyncio
    async def test_connect_overview_registers_connection(self) -> None:
        mgr = ConnectionManager()
        ws = AsyncMock()
        ws.client_state = MagicMock()
        await mgr.connect_overview(ws, max_connections=16)
        assert ws in mgr.overview_connections

    @pytest.mark.asyncio
    async def test_disconnect_overview_removes_connection(self) -> None:
        mgr = ConnectionManager()
        ws = AsyncMock()
        ws.client_state = MagicMock()
        await mgr.connect_overview(ws, max_connections=16)
        await mgr.disconnect_overview(ws)
        assert ws not in mgr.overview_connections

    @pytest.mark.asyncio
    async def test_broadcast_overview_sends_to_connections(self) -> None:
        mgr = ConnectionManager()
        ws = AsyncMock()
        from starlette.websockets import WebSocketState

        ws.client_state = WebSocketState.CONNECTED
        await mgr.connect_overview(ws, max_connections=16)
        await mgr.broadcast_overview({"type": "test"})
        ws.send_json.assert_called_once_with({"type": "test"})

    @pytest.mark.asyncio
    async def test_broadcast_overview_noop_when_no_connections(self) -> None:
        mgr = ConnectionManager()
        # Should not raise
        await mgr.broadcast_overview({"type": "test"})

    @pytest.mark.asyncio
    async def test_connect_overview_enforces_cap_atomically(self) -> None:
        """connect_overview rejects (returns False) once the cap is reached, so a
        burst of concurrent handshakes can't each register past the limit."""
        mgr = ConnectionManager()
        # Fill up to the cap.
        for _ in range(2):
            ws = AsyncMock()
            ws.client_state = MagicMock()
            assert await mgr.connect_overview(ws, max_connections=2) is True
        # The next one must be refused without being accepted or registered.
        extra = AsyncMock()
        extra.client_state = MagicMock()
        assert await mgr.connect_overview(extra, max_connections=2) is False
        assert extra not in mgr.overview_connections
        extra.accept.assert_not_called()


class TestOverviewRouteOrder:
    def test_overview_route_registered_before_session_route(self) -> None:
        """`/ws/overview` is a single segment and would be captured by the
        `/ws/{session_id}` route unless declared first — which silently breaks
        the Command Center feed. Guard the registration order."""
        from app.main import app

        paths = [getattr(r, "path", None) for r in app.routes]
        assert "/ws/overview" in paths
        assert "/ws/{session_id}" in paths
        assert paths.index("/ws/overview") < paths.index("/ws/{session_id}")


class TestBroadcastOverviewState:
    @pytest.mark.asyncio
    async def test_skips_build_when_no_watchers(self) -> None:
        """The per-event hook must be cheap when nobody is watching."""
        from app.api import websocket as ws_module
        from app.core.broadcast_service import broadcast_overview_state

        # No overview connections on the live manager -> no-op, no build.
        ws_module.manager.overview_connections.clear()
        await broadcast_overview_state({})  # must not raise

    @pytest.mark.asyncio
    async def test_broadcasts_entries_to_watcher(self) -> None:
        from starlette.websockets import WebSocketState

        from app.api import websocket as ws_module
        from app.core.broadcast_service import broadcast_overview_state
        from app.core.state_machine import StateMachine
        from app.models.agents import BossState

        ws = AsyncMock()
        ws.client_state = WebSocketState.CONNECTED
        await ws_module.manager.connect_overview(ws, max_connections=16)
        try:
            sm = StateMachine()
            sm.boss_state = BossState.WAITING_PERMISSION
            await broadcast_overview_state({"sess-1": sm})

            ws.send_json.assert_called_once()
            payload = ws.send_json.call_args[0][0]
            assert payload["type"] == "state_update"
            entries = payload["state"]["entries"]
            assert entries[0]["sessionId"] == "sess-1"
            assert entries[0]["bucket"] == "needs_you"
        finally:
            await ws_module.manager.disconnect_overview(ws)
