"""Tests for the Agent Orchestrator adapter."""

import pytest
from unittest.mock import AsyncMock, patch
from httpx import Request, Response

from app.services.adapters.ao import AOAdapter

_DUMMY_REQ = Request("GET", "http://test")


@pytest.fixture
def adapter():
    return AOAdapter(ao_url="http://localhost:3000")


class TestAOAdapterInit:
    def test_default_state(self, adapter: AOAdapter):
        assert adapter.adapter_type == "ao"
        assert adapter.connected is False
        assert adapter.ao_url == "http://localhost:3000"

    def test_strips_trailing_slash(self):
        a = AOAdapter(ao_url="http://localhost:3000/")
        assert a.ao_url == "http://localhost:3000"


class TestAOAdapterConnect:
    @pytest.mark.asyncio
    async def test_connect_success(self, adapter: AOAdapter):
        with patch("app.services.adapters.ao.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=Response(200, json=[], request=_DUMMY_REQ))
            mock_client_cls.return_value = mock_client

            result = await adapter.connect()
            assert result is True
            assert adapter.connected is True

    @pytest.mark.asyncio
    async def test_connect_failure(self, adapter: AOAdapter):
        with patch("app.services.adapters.ao.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(side_effect=Exception("Connection refused"))
            mock_client_cls.return_value = mock_client

            result = await adapter.connect()
            assert result is False
            assert adapter.connected is False


class TestAOAdapterPoll:
    @pytest.mark.asyncio
    async def test_poll_returns_external_sessions(self, adapter: AOAdapter):
        ao_response = {
            "sessions": [
                {
                    "id": "sess-1",
                    "projectId": "my-project",
                    "metadata": {"worktree": "/tmp/worktree/1"},
                    "issueId": "#42",
                    "status": "working",
                    "pr": {
                        "url": "https://github.com/org/repo/pull/10",
                        "number": 10,
                        "ciStatus": "passing",
                        "reviewStatus": "pending",
                    },
                },
                {
                    "id": "sess-2",
                    "projectId": "other-project",
                    "metadata": {},
                    "issueId": None,
                    "status": "spawning",
                    "pr": None,
                },
            ],
            "stats": {},
        }
        with patch("app.services.adapters.ao.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=Response(200, json=ao_response, request=_DUMMY_REQ))
            mock_client_cls.return_value = mock_client

            sessions = await adapter.poll()
            assert len(sessions) == 2
            assert sessions[0].session_id == "sess-1"
            assert sessions[0].pr_url == "https://github.com/org/repo/pull/10"
            assert sessions[0].ci_status == "passing"
            assert sessions[1].pr_url is None

    @pytest.mark.asyncio
    async def test_poll_empty_response(self, adapter: AOAdapter):
        with patch("app.services.adapters.ao.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=Response(200, json={"sessions": []}, request=_DUMMY_REQ))
            mock_client_cls.return_value = mock_client

            sessions = await adapter.poll()
            assert sessions == []


class TestAOAdapterSpawn:
    @pytest.mark.asyncio
    async def test_spawn_returns_external_session(self, adapter: AOAdapter):
        spawn_response = {
            "session": {
                "id": "new-sess-1",
                "projectId": "my-project",
                "metadata": {"worktree": "/tmp/worktree/new"},
                "issueId": "#99",
                "status": "spawning",
                "pr": None,
            },
        }
        with patch("app.services.adapters.ao.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=Response(200, json=spawn_response, request=_DUMMY_REQ))
            mock_client_cls.return_value = mock_client

            session = await adapter.spawn("my-project", "#99")
            assert session.session_id == "new-sess-1"
            assert session.status == "spawning"
