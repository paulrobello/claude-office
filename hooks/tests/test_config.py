"""Tests for config._resolve_api_url — the ARC-020 loopback clamp + opt-in remote."""

from claude_office_hooks.config import _DEFAULT_API_URL, _resolve_api_url


def _no_clamp(_host: str | None) -> None:
    """Clamp callback that records nothing; use when the clamp path is irrelevant."""
    raise AssertionError("expected no clamp")


def test_localhost_url_passes_through():
    url = "http://localhost:8000/api/v1/events"
    assert _resolve_api_url(url, False, _no_clamp) == url


def test_loopback_ipv4_and_ipv6_pass_through():
    assert (
        _resolve_api_url("http://127.0.0.1:8000/api/v1/events", False, _no_clamp)
        == "http://127.0.0.1:8000/api/v1/events"
    )
    assert (
        _resolve_api_url("http://[::1]:8000/api/v1/events", False, _no_clamp)
        == "http://[::1]:8000/api/v1/events"
    )


def test_remote_url_clamped_by_default():
    clamped: list[str | None] = []
    result = _resolve_api_url(
        "https://office.example.com/api/v1/events",
        False,
        clamped.append,
    )
    assert result == _DEFAULT_API_URL
    assert clamped == ["office.example.com"]


def test_remote_url_allowed_when_flag_set():
    clamped = []
    remote = "https://office.example.com/api/v1/events"
    result = _resolve_api_url(remote, True, clamped.append)
    assert result == remote
    assert clamped == []


def test_remote_hostname_with_port_clamps_on_host_only():
    clamped: list[str | None] = []
    result = _resolve_api_url("http://10.0.0.5:9000/api/v1/events", False, clamped.append)
    assert result == _DEFAULT_API_URL
    assert clamped == ["10.0.0.5"]


def test_config_file_value_reads_config_file_constant(tmp_path, monkeypatch):
    """_config_file_value reads via CONFIG_FILE so tests/patches need only one seam."""
    from claude_office_hooks import config as config_mod

    cfg = tmp_path / "claude-office-config.env"
    cfg.write_text(
        '# comment\nCLAUDE_OFFICE_API_URL="http://localhost:8050/api/v1/events"\nOTHER=ignored\n',
        encoding="utf-8",
    )
    monkeypatch.setattr(config_mod, "CONFIG_FILE", cfg)
    assert config_mod._config_file_value("CLAUDE_OFFICE_API_URL") == (
        "http://localhost:8050/api/v1/events"
    )
    assert config_mod._config_file_value("MISSING_KEY") is None
