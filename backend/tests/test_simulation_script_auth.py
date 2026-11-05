"""The simulation scripts must survive an authenticated backend.

Two regressions are pinned here:

* ``POST /api/v1/events`` requires ``X-API-Key`` once the backend is started with
  an explicit ``CLAUDE_OFFICE_API_KEY`` — the scripts used to post bare requests
  and every event came back 401.
* A scenario whose events are all rejected used to print ``Done.`` and exit 0,
  so scripted/pre-commit runs could not tell success from total failure.
* Following a redirect would re-send ``X-API-Key`` to whatever host the
  redirect points at, so ``send_event`` refuses redirects and counts a 3xx as a
  failed event.
"""

import sys
from pathlib import Path

import pytest

# The simulation scripts live outside the backend package and post with
# ``requests``, which is a backend dev dependency precisely so this module runs
# in the backend gate. The importorskip stays as a guard for environments that
# sync only the runtime dependencies.
pytest.importorskip("requests")

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from scripts.scenarios import _base  # noqa: E402


class _FakeResponse:
    """Minimal stand-in for ``requests.Response``."""

    def __init__(self, status_code: int) -> None:
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"{self.status_code} Client Error")


def _capture_post(monkeypatch: pytest.MonkeyPatch, status_code: int) -> list[dict]:
    calls: list[dict] = []

    def fake_post(
        url: str,
        json: dict,
        headers: dict | None = None,
        timeout: int = 0,
        **kwargs: object,
    ) -> _FakeResponse:
        calls.append({"url": url, "json": json, "headers": headers or {}, "kwargs": kwargs})
        return _FakeResponse(status_code)

    monkeypatch.setattr(_base.requests, "post", fake_post)
    return calls


def test_api_key_is_sent_as_header(monkeypatch: pytest.MonkeyPatch) -> None:
    """An explicit key on the context must reach the backend as X-API-Key."""
    calls = _capture_post(monkeypatch, 200)
    ctx = _base.SimulationContext(session_id="t", verbose=False, api_key="secret")
    ctx.send_event("session_start", {})
    assert calls[0]["headers"] == {"X-API-Key": "secret"}
    assert ctx.failures == 0


def test_no_headers_without_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """With no key configured the request stays exactly as before."""
    monkeypatch.setattr(_base, "API_KEY", "")
    calls = _capture_post(monkeypatch, 200)
    ctx = _base.SimulationContext(session_id="t", verbose=False, api_key="")
    ctx.send_event("session_start", {})
    assert calls[0]["headers"] == {}


def test_rejected_events_are_counted(monkeypatch: pytest.MonkeyPatch) -> None:
    """A 401 must increment the failure counter instead of being swallowed."""
    _capture_post(monkeypatch, 401)
    ctx = _base.SimulationContext(session_id="t", verbose=False, api_key="wrong")
    ctx.send_event("session_start", {})
    ctx.send_event("pre_tool_use", {"tool_name": "Bash"})
    assert ctx.failures == 2


def test_network_errors_are_counted(monkeypatch: pytest.MonkeyPatch) -> None:
    """Connection errors count as failures too (backend not running)."""

    def boom(*_args, **_kwargs):
        raise ConnectionError("connection refused")

    monkeypatch.setattr(_base.requests, "post", boom)
    ctx = _base.SimulationContext(session_id="t", verbose=False)
    ctx.send_event("session_start", {})
    assert ctx.failures == 1


def test_redirects_are_not_followed(monkeypatch: pytest.MonkeyPatch) -> None:
    """The request must disable redirects so the key cannot reach another host."""
    calls = _capture_post(monkeypatch, 200)
    ctx = _base.SimulationContext(session_id="t", verbose=False, api_key="secret")
    ctx.send_event("session_start", {})
    assert calls[0]["kwargs"] == {"allow_redirects": False}
    assert calls[0]["headers"] == {"X-API-Key": "secret"}
    assert ctx.failures == 0


def test_redirects_are_counted_as_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    """A 3xx response is a failed event, not a silently accepted one."""
    _capture_post(monkeypatch, 302)
    ctx = _base.SimulationContext(session_id="t", verbose=False, api_key="secret")
    ctx.send_event("session_start", {})
    ctx.send_event("session_end", {})
    assert ctx.failures == 2
