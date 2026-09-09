"""Configuration loading and constants for the Claude Office hooks.

IMPORTANT: This module must not produce any stdout/stderr output.
Output suppression is handled in main.py before this module is imported.
"""

import os
from collections.abc import Callable
from pathlib import Path
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# API endpoint and request constants
# ---------------------------------------------------------------------------

_LOCALHOST_HOSTNAMES = frozenset({"localhost", "127.0.0.1", "::1", None})
_DEFAULT_API_URL = "http://localhost:8000/api/v1/events"


def _resolve_api_url(
    raw_url: str,
    allow_remote: bool,
    on_clamp: Callable[[str | None], None],
) -> str:
    """Return the API URL to use, applying the loopback clamp (ARC-020).

    Remote backends are opt-in: a non-localhost URL is reset to the local
    default unless ``allow_remote`` is True. Event payloads can carry tool
    inputs/outputs and file paths, so this guards against accidental
    exfiltration to an attacker-controlled URL. Mirrored by the OpenCode
    plugin's resolver so both producers treat ``CLAUDE_OFFICE_API_URL``
    identically. Pure + testable; the caller supplies the clamp callback so
    this module never writes to stdout/stderr at import time.
    """
    host = urlparse(raw_url).hostname
    if host in _LOCALHOST_HOSTNAMES:
        return raw_url
    if allow_remote:
        return raw_url
    on_clamp(host)
    return _DEFAULT_API_URL


def _log_clamp(host: str | None) -> None:
    """Record the loopback clamp to the debug log file (never stdout/stderr)."""
    try:
        # Lazy import keeps config.py importable in isolation.
        from claude_office_hooks.debug_logger import log_notice

        log_notice(
            f"CLAUDE_OFFICE_API_URL is non-localhost ('{host}'); clamped to the "
            f"local default. Set CLAUDE_OFFICE_ALLOW_REMOTE=1 to use a remote "
            f"backend.",
            context="config",
        )
    except Exception:
        # Logging must never break the hook.
        pass


def _config_file_value(key: str) -> str | None:
    """Read one key from CONFIG_FILE without importing anything (safe at import time)."""
    try:
        for line in (Path.home() / ".claude" / "claude-office-config.env").read_text().splitlines():
            k, _, v = line.strip().partition("=")
            if k.strip() == key and not line.lstrip().startswith("#"):
                return v.strip().strip('"').strip("'")
    except Exception:
        pass
    return None


API_URL = _resolve_api_url(
    os.environ.get("CLAUDE_OFFICE_API_URL")
    or _config_file_value("CLAUDE_OFFICE_API_URL")
    or _DEFAULT_API_URL,
    os.environ.get("CLAUDE_OFFICE_ALLOW_REMOTE", "") == "1",
    _log_clamp,
)

# Mutable holder for the API key — populated by load_config().
_api_key_holder: list[str] = [""]
TIMEOUT = 0.5  # Seconds — keep short so hooks never block Claude


def get_api_key() -> str:
    """Return the current API key (may be empty string before load_config)."""
    return _api_key_holder[0]


def _set_api_key(key: str) -> None:
    _api_key_holder[0] = key


# ---------------------------------------------------------------------------
# Config file location
# ---------------------------------------------------------------------------

CONFIG_FILE = Path.home() / ".claude" / "claude-office-config.env"

# ---------------------------------------------------------------------------
# Default project-name prefix stripping
# ---------------------------------------------------------------------------

# Prefixes to strip from project names derived from transcript paths.
# These path fragments appear because Claude names projects after the
# filesystem path where the session was started (with slashes → dashes).
# Default is empty -- configure via CLAUDE_OFFICE_STRIP_PREFIXES env var,
# the --strip-prefixes CLI flag, or the config file.
STRIP_PREFIXES: list[str] = []


def load_config() -> dict[str, str]:
    """Load key=value pairs from CONFIG_FILE.

    Returns:
        A dictionary of configuration key/value pairs.  Returns an empty
        dict if the file does not exist or cannot be read.
    """
    config: dict[str, str] = {}
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, value = line.partition("=")
                        # Strip surrounding quotes from the value
                        value = value.strip().strip('"').strip("'")
                        config[key.strip()] = value
        except Exception:
            # Config loading must never raise — hooks must always exit 0
            pass
    # Set API key from config or env var (env var takes precedence)
    _set_api_key(os.environ.get("CLAUDE_OFFICE_API_KEY", config.get("CLAUDE_OFFICE_API_KEY", "")))
    return config
