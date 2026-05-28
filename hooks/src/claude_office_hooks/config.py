"""Configuration loading and constants for the Claude Office hooks.

IMPORTANT: This module must not produce any stdout/stderr output.
Output suppression is handled in main.py before this module is imported.
"""

import os
from pathlib import Path
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# API endpoint and request constants
# ---------------------------------------------------------------------------

_LOCALHOST_HOSTNAMES = frozenset({"localhost", "127.0.0.1", "::1", None})

_raw_api_url = os.environ.get("CLAUDE_OFFICE_API_URL", "http://localhost:8000/api/v1/events")
_parsed_url = urlparse(_raw_api_url)
if _parsed_url.hostname not in _LOCALHOST_HOSTNAMES:
    _raw_api_url = "http://localhost:8000/api/v1/events"
API_URL = _raw_api_url

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
