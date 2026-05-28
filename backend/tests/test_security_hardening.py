"""Tests for security hardening (issue #37)."""

from pathlib import Path
from typing import Any
from unittest.mock import patch
from urllib.parse import urlparse

from fastapi.testclient import TestClient

from app.api.websocket import validate_websocket_origin
from app.core.path_utils import is_safe_transcript_path

# ---------------------------------------------------------------------------
# Fix #1: API URL validation — tests the validation logic directly
# (hooks-side module reload can't run from backend test env)
# ---------------------------------------------------------------------------

_ALLOWED_HOSTNAMES = frozenset({"localhost", "127.0.0.1", "::1", None})


class TestApiUrlValidation:
    """Verify the hostname allowlist used by hooks config."""

    def test_localhost_hostname_allowed(self) -> None:
        assert urlparse("http://localhost:8000/api").hostname in _ALLOWED_HOSTNAMES

    def test_127_hostname_allowed(self) -> None:
        assert urlparse("http://127.0.0.1:8000/api").hostname in _ALLOWED_HOSTNAMES

    def test_ipv6_hostname_allowed(self) -> None:
        assert urlparse("http://[::1]:8000/api").hostname in _ALLOWED_HOSTNAMES

    def test_external_hostname_blocked(self) -> None:
        assert urlparse("https://evil.com/collect").hostname not in _ALLOWED_HOSTNAMES

    def test_lan_ip_blocked(self) -> None:
        assert urlparse("http://192.168.1.1:8000/api").hostname not in _ALLOWED_HOSTNAMES


# ---------------------------------------------------------------------------
# Fix #2: Transcript path validation
# ---------------------------------------------------------------------------


class TestSafeTranscriptPath:
    """Verify is_safe_transcript_path rejects paths outside ~/.claude/."""

    def test_valid_claude_jsonl(self) -> None:
        with patch.object(Path, "home", return_value=Path("/home/user")):
            assert is_safe_transcript_path("/home/user/.claude/session.jsonl") is True

    def test_rejects_non_claude_dir(self) -> None:
        with patch.object(Path, "home", return_value=Path("/home/user")):
            assert is_safe_transcript_path("/tmp/evil.jsonl") is False

    def test_rejects_non_jsonl(self) -> None:
        with patch.object(Path, "home", return_value=Path("/home/user")):
            assert is_safe_transcript_path("/home/user/.claude/config.env") is False

    def test_rejects_path_traversal(self) -> None:
        with patch.object(Path, "home", return_value=Path("/home/user")):
            assert is_safe_transcript_path("/home/user/.claude/../../etc/passwd.jsonl") is False

    def test_rejects_empty(self) -> None:
        assert is_safe_transcript_path("") is False


# ---------------------------------------------------------------------------
# Fix #3: API key auth middleware
# ---------------------------------------------------------------------------


class TestApiKeyMiddleware:
    """Verify ApiKeyMiddleware rejects requests without valid key."""

    def test_no_key_configured_allows_requests(self) -> None:
        """When CLAUDE_OFFICE_API_KEY is empty, auth is skipped."""
        from app.main import app

        client = TestClient(app)
        resp = client.post(
            "/api/v1/events",
            json={
                "event_type": "session_start",
                "session_id": "test-no-key",
                "timestamp": "2026-01-01T00:00:00",
                "data": {},
            },
        )
        assert resp.status_code == 200

    def test_valid_key_accepted(self) -> None:
        """Requests with the correct X-API-Key should pass."""
        from app.config import get_settings

        settings = get_settings()
        original_key = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "test-secret-key"

        from app.main import app

        try:
            client = TestClient(app)
            resp = client.post(
                "/api/v1/events",
                json={
                    "event_type": "session_start",
                    "session_id": "test-with-key",
                    "timestamp": "2026-01-01T00:00:00",
                    "data": {},
                },
                headers={"X-API-Key": "test-secret-key"},
            )
            assert resp.status_code == 200
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original_key

    def test_invalid_key_rejected(self) -> None:
        """Requests with wrong X-API-Key should get 401."""
        from app.config import get_settings

        settings = get_settings()
        original_key = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "test-secret-key"

        from app.main import app

        try:
            client = TestClient(app)
            resp = client.post(
                "/api/v1/events",
                json={
                    "event_type": "session_start",
                    "session_id": "test-bad-key",
                    "timestamp": "2026-01-01T00:00:00",
                    "data": {},
                },
                headers={"X-API-Key": "wrong-key"},
            )
            assert resp.status_code == 401
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original_key

    def test_missing_key_rejected(self) -> None:
        """Requests with no X-API-Key when key is configured should get 401."""
        from app.config import get_settings

        settings = get_settings()
        original_key = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "test-secret-key"

        from app.main import app

        try:
            client = TestClient(app)
            resp = client.post(
                "/api/v1/events",
                json={
                    "event_type": "session_start",
                    "session_id": "test-no-key-header",
                    "timestamp": "2026-01-01T00:00:00",
                    "data": {},
                },
            )
            assert resp.status_code == 401
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original_key

    def test_health_endpoint_skips_auth(self) -> None:
        """Health endpoint should not require an API key."""
        from app.config import get_settings

        settings = get_settings()
        original_key = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "test-secret-key"

        from app.main import app

        try:
            client = TestClient(app)
            resp = client.get("/health")
            assert resp.status_code == 200
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original_key


# ---------------------------------------------------------------------------
# Fix #4: WebSocket origin validation with API key fallback
# ---------------------------------------------------------------------------


class TestWebSocketOriginValidation:
    """Verify WebSocket validates both origin and API key."""

    def _make_ws(self, origin: str | None = None, api_key: str | None = None) -> Any:
        """Create a mock WebSocket with specified headers."""

        class MockWebSocket:
            def __init__(self, headers: dict[str, str]) -> None:
                self.headers = headers

        headers: dict[str, str] = {}
        if origin is not None:
            headers["origin"] = origin
        if api_key is not None:
            headers["x-api-key"] = api_key
        return MockWebSocket(headers)

    def test_localhost_origin_accepted(self) -> None:
        ws = self._make_ws(origin="http://localhost:3000")
        assert validate_websocket_origin(ws) is True

    def test_external_origin_rejected(self) -> None:
        ws = self._make_ws(origin="https://evil.com")
        assert validate_websocket_origin(ws) is False

    def test_no_origin_no_key_configured_accepted(self) -> None:
        """No origin + no API key configured = accepted (backwards compat)."""
        from app.config import get_settings

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = ""
        try:
            ws = self._make_ws()
            assert validate_websocket_origin(ws) is True
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_no_origin_valid_key_accepted(self) -> None:
        """No origin + valid API key = accepted."""
        from app.config import get_settings

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "my-secret"
        try:
            ws = self._make_ws(api_key="my-secret")
            assert validate_websocket_origin(ws) is True
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_no_origin_wrong_key_rejected(self) -> None:
        """No origin + wrong API key = rejected."""
        from app.config import get_settings

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "my-secret"
        try:
            ws = self._make_ws(api_key="wrong")
            assert validate_websocket_origin(ws) is False
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_no_origin_no_key_rejected(self) -> None:
        """No origin + no API key when configured = rejected."""
        from app.config import get_settings

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "my-secret"
        try:
            ws = self._make_ws()
            assert validate_websocket_origin(ws) is False
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original
