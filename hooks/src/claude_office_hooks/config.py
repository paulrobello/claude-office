"""Configuration loading and constants for the Claude Office hooks.

IMPORTANT: This module must not produce any stdout/stderr output.
Output suppression is handled in main.py before this module is imported.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# API endpoint and request constants
# ---------------------------------------------------------------------------

API_URL = "http://localhost:8000/api/v1/events"
TIMEOUT = 0.5  # Seconds — keep short so hooks never block Claude

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
STRIP_PREFIXES = ["-Users-probello-Repos-", "-Users-probello-"]


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
    return config
