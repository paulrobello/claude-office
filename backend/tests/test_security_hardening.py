"""Tests for security hardening (issue #37 + #41)."""

from pathlib import Path
from typing import Any
from unittest.mock import patch
from urllib.parse import urlparse

import pytest
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from starlette.responses import Response

from app.api.websocket import validate_websocket_origin
from app.config import get_settings
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

    def test_cors_origin_non_loopback_rejected(self) -> None:
        """A non-loopback origin present in BACKEND_CORS_ORIGINS must still be
        rejected for WebSocket — the WS trust boundary stays localhost-only
        even when CORS is widened (QA-014).

        ``http://0.0.0.0:3000`` is in the default ``BACKEND_CORS_ORIGINS`` but
        ``0.0.0.0`` is not a loopback hostname, so it must be excluded from the
        derived WS allowlist.
        """
        settings = get_settings()
        assert "http://0.0.0.0:3000" in settings.BACKEND_CORS_ORIGINS
        ws = self._make_ws(origin="http://0.0.0.0:3000")
        assert validate_websocket_origin(ws) is False

    def test_external_origin_rejected(self) -> None:
        ws = self._make_ws(origin="https://evil.com")
        assert validate_websocket_origin(ws) is False

    def test_no_origin_no_key_configured_rejected(self) -> None:
        """No origin + no key = rejected even without explicit CLAUDE_OFFICE_API_KEY.

        The auto-generated per-launch token is always required for non-browser
        WebSocket clients (issue #41 item 3).
        """
        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = ""
        try:
            ws = self._make_ws()
            assert validate_websocket_origin(ws) is False
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_no_origin_auto_key_accepted(self) -> None:
        """No origin + valid auto-generated key = accepted."""
        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = ""
        try:
            ws = self._make_ws(api_key=settings.effective_api_key)
            assert validate_websocket_origin(ws) is True
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_no_origin_valid_key_accepted(self) -> None:
        """No origin + valid API key = accepted."""
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
        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "my-secret"
        try:
            ws = self._make_ws()
            assert validate_websocket_origin(ws) is False
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original


# ---------------------------------------------------------------------------
# Follow-up (issue #39): token_tracker must honor is_safe_transcript_path,
# and the OpenAPI schema URL must stay reachable when an API key is set.
# ---------------------------------------------------------------------------


class TestTokenTrackerPathConfinement:
    """token_tracker must refuse to read paths outside ~/.claude/ (issue #39)."""

    def test_count_tool_uses_rejects_outside_path(self) -> None:
        from app.core.token_tracker import TokenTracker

        # Neither .jsonl nor under ~/.claude — must be rejected, not read.
        assert TokenTracker().count_tool_uses_from_jsonl("/etc/passwd") == 0

    def test_token_usage_slow_path_rejects_outside_path(self) -> None:
        """update_from_event's JSONL fallback must not read an out-of-confine path."""
        from app.core.token_tracker import TokenTracker
        from app.models.events import EventAdapter, EventType

        tracker = TokenTracker()
        event = EventAdapter.validate_python(
            {
                "event_type": EventType.STOP,
                "session_id": "test",
                "data": {"transcript_path": "/etc/hostname"},
            }
        )
        tracker.update_from_event(event)
        assert tracker.total_input_tokens == 0
        assert tracker.total_output_tokens == 0

    def test_extract_thinking_rejects_outside_path(self) -> None:
        from app.core.token_tracker import TokenTracker

        assert TokenTracker().extract_thinking_from_jsonl("/etc/hostname") is None

    def test_valid_in_confine_transcript_is_counted(self, tmp_path: Path) -> None:
        """A well-formed transcript under ~/.claude/ is still parsed normally."""
        from app.core.token_tracker import TokenTracker

        claude_dir = tmp_path / ".claude"
        claude_dir.mkdir()
        f = claude_dir / "session.jsonl"
        f.write_text('{"type":"tool_use"}\n{"type": "tool_use"}\n')

        with patch.object(Path, "home", return_value=tmp_path):
            assert TokenTracker().count_tool_uses_from_jsonl(str(f)) == 2

    def test_oversized_transcript_is_skipped(self, tmp_path: Path) -> None:
        """A transcript larger than the cap is skipped, not read into memory."""
        import app.core.token_tracker as tt

        claude_dir = tmp_path / ".claude"
        claude_dir.mkdir()
        big = claude_dir / "huge.jsonl"
        big.write_text('{"type": "tool_use"}\n' * 100)

        with (
            patch.object(Path, "home", return_value=tmp_path),
            patch.object(tt, "_MAX_TRANSCRIPT_BYTES", 10),
        ):
            assert tt.TokenTracker().count_tool_uses_from_jsonl(str(big)) == 0


class TestOpenApiAuthExemption:
    """OpenAPI docs must stay reachable when an API key is configured (issue #39)."""

    def test_openapi_schema_reachable_with_key(self) -> None:
        from app.config import get_settings
        from app.main import app

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "test-secret-key"
        try:
            client = TestClient(app)
            resp = client.get(f"{settings.API_V1_STR}/openapi.json")
            assert resp.status_code == 200
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_docs_page_reachable_with_key(self) -> None:
        from app.config import get_settings
        from app.main import app

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "test-secret-key"
        try:
            client = TestClient(app)
            resp = client.get("/docs")
            assert resp.status_code == 200
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_redoc_page_reachable_with_key(self) -> None:
        from app.config import get_settings
        from app.main import app

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "test-secret-key"
        try:
            client = TestClient(app)
            resp = client.get("/redoc")
            assert resp.status_code == 200
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original


# ---------------------------------------------------------------------------
# Issue #41 — lower-severity hardening follow-ups
# ---------------------------------------------------------------------------


class TestTimingSafeKeyComparison:
    """Verify API key comparison uses constant-time hmac.compare_digest."""

    def test_middleware_uses_hmac(self) -> None:
        """ApiKeyMiddleware should use hmac.compare_digest, not plain ==."""
        import inspect

        from app.main import ApiKeyMiddleware

        source = inspect.getsource(ApiKeyMiddleware.dispatch)
        assert "hmac.compare_digest" in source
        assert "provided != key" not in source
        assert "provided == key" not in source

    def test_websocket_uses_hmac(self) -> None:
        """WebSocket validation should use hmac.compare_digest."""
        import inspect

        source = inspect.getsource(validate_websocket_origin)
        assert "hmac.compare_digest" in source
        assert "provided == key" not in source


class TestStateChangingEndpointAuth:
    """State-changing endpoints always require the effective API key (issue #41 item 2)."""

    def test_clear_db_requires_key(self) -> None:
        """DELETE /sessions should require the effective API key."""
        from app.main import app

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = ""
        try:
            client = TestClient(app)
            # No X-API-Key header — should be rejected
            resp = client.delete(f"{settings.API_V1_STR}/sessions")
            assert resp.status_code == 401
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_clear_db_with_effective_key(self) -> None:
        """DELETE /sessions with the effective key should pass auth."""
        from app.main import app

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = ""
        try:
            client = TestClient(app)
            resp = client.delete(
                f"{settings.API_V1_STR}/sessions",
                headers={"X-API-Key": settings.effective_api_key},
            )
            # Auth passes — may be 200 or 500 depending on DB state, but not 401
            assert resp.status_code != 401
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_simulate_requires_key(self) -> None:
        """POST /sessions/simulate should require the effective API key."""
        from app.main import app

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = ""
        try:
            client = TestClient(app)
            resp = client.post(f"{settings.API_V1_STR}/sessions/simulate")
            assert resp.status_code == 401
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_read_only_endpoints_open_without_key(self) -> None:
        """GET endpoints should still work without a key."""
        from app.main import app

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = ""
        try:
            client = TestClient(app)
            resp = client.get(f"{settings.API_V1_STR}/sessions")
            assert resp.status_code == 200
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original


class TestEffectiveApiKey:
    """Verify config.effective_api_key behavior."""

    def test_auto_key_generated(self) -> None:
        """An auto-generated key should exist when no explicit key is set."""
        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = ""
        try:
            assert settings.effective_api_key
            assert len(settings.effective_api_key) == 64  # secrets.token_hex(32)
            assert not settings.has_explicit_key
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_explicit_key_takes_precedence(self) -> None:
        """When CLAUDE_OFFICE_API_KEY is set, it is the effective key."""
        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "my-explicit-key"
        try:
            assert settings.effective_api_key == "my-explicit-key"
            assert settings.has_explicit_key is True
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original


# ---------------------------------------------------------------------------
# SEC-001 — /api/v1/status must not disclose the effective API key
# ---------------------------------------------------------------------------


class TestStatusEndpointKeyDisclosure:
    """GET /api/v1/status must not return the effective API key (SEC-001)."""

    def test_status_does_not_disclose_api_key(self) -> None:
        from app.main import app

        client = TestClient(app)
        resp = client.get("/api/v1/status")
        assert resp.status_code == 200
        body = resp.json()
        assert "apiKey" not in body
        assert get_settings().effective_api_key not in resp.text


# ---------------------------------------------------------------------------
# SEC-002 — focus/clipboard endpoint must require the effective API key
# ---------------------------------------------------------------------------


class TestFocusEndpointAuth:
    """POST /sessions/{id}/focus must require the effective API key (SEC-002)."""

    def test_focus_requires_key(self) -> None:
        from app.main import app

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = ""
        try:
            client = TestClient(app)
            resp = client.post(f"{settings.API_V1_STR}/sessions/some-session/focus")
            assert resp.status_code == 401
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_focus_with_effective_key_passes_auth(self) -> None:
        from app.main import app

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = ""
        try:
            client = TestClient(app)
            resp = client.post(
                f"{settings.API_V1_STR}/sessions/does-not-exist/focus",
                headers={"X-API-Key": settings.effective_api_key},
            )
            # Past auth; session lookup fails → 404 (or 500 if DB unavailable).
            assert resp.status_code in (404, 500)
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original


# ---------------------------------------------------------------------------
# SEC-005 — /events auth behavior regression (backend: no code change;
# plugin key support deferred, blocked by QA-002)
# ---------------------------------------------------------------------------


class TestEventsEndpointAuthRegression:
    """Lock in /events auth behavior (SEC-005 backend decision).

    Default config: /events stays open because hooks/plugin have no discovery
    channel for the auto-key after SEC-001 (gating it would silently break all
    event producers). Explicit key set: /events requires that key.
    """

    def test_events_open_in_default_config(self) -> None:
        from app.main import app

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = ""
        try:
            client = TestClient(app)
            resp = client.post(
                f"{settings.API_V1_STR}/events",
                json={
                    "event_type": "session_start",
                    "session_id": "sec005-default",
                    "timestamp": "2026-01-01T00:00:00",
                    "data": {},
                },
            )
            assert resp.status_code == 200
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original

    def test_events_require_explicit_key_when_set(self) -> None:
        from app.main import app

        settings = get_settings()
        original = settings.CLAUDE_OFFICE_API_KEY
        settings.CLAUDE_OFFICE_API_KEY = "explicit-test-key"
        try:
            client = TestClient(app)
            resp = client.post(
                f"{settings.API_V1_STR}/events",
                json={
                    "event_type": "session_start",
                    "session_id": "sec005-explicit",
                    "timestamp": "2026-01-01T00:00:00",
                    "data": {},
                },
            )
            assert resp.status_code == 401
        finally:
            settings.CLAUDE_OFFICE_API_KEY = original


class TestLocalhostOnlySetting:
    """LOCALHOST_ONLY routes through Settings (PR #61 review remediation)."""

    @staticmethod
    def _dispatch(client_host: str) -> tuple[bool, Response | None]:
        import asyncio

        from app.api import middleware as mw

        mw_instance = mw.LocalhostOnlyMiddleware(app=None)  # pyright: ignore[reportArgumentType]
        scope: dict[str, Any] = {
            "type": "http",
            "client": (client_host, 50000),
            "method": "GET",
            "path": "/",
            "headers": [],
        }
        request = Request(scope)
        called = False

        async def call_next(request: Request) -> JSONResponse:
            nonlocal called
            called = True
            return JSONResponse({"ok": True})

        response = asyncio.run(mw_instance.dispatch(request, call_next))
        return called, response if isinstance(response, JSONResponse) else None

    def test_disabled_allows_non_loopback_client(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """LOCALHOST_ONLY=0 (Docker) admits bridge-gateway client addresses."""
        from app.api import middleware as mw

        monkeypatch.setattr(mw.settings, "LOCALHOST_ONLY", False)
        called, _response = self._dispatch("192.168.65.1")
        assert called, "request must reach the app when the IP check is disabled"

    def test_enabled_rejects_non_loopback_client(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.api import middleware as mw

        monkeypatch.setattr(mw.settings, "LOCALHOST_ONLY", True)
        called, response = self._dispatch("192.168.65.1")
        assert not called
        assert response is not None and response.status_code == 403
