"""Watches ~/.claude/projects/ for session JSONL files not tracked by hooks.

Supplements hooks by discovering sessions from Cursor, unhook'd Claude Code, etc.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_PROJECTS_DIR = Path.home() / ".claude" / "projects"


def extract_project_name(path: str) -> str:
    """Extract a human-readable project name from a transcript path.

    Path format: ~/.claude/projects/-Users-apple-Projects-others-startups-mono-abc12345/
    Strategy: strip the hash suffix, take the last 1-2 meaningful path segments.
    """
    dirname = Path(path).parent.name

    # The dirname encodes a full path like:
    # -Users-apple-Projects-others-startups-mono-abc12345
    # We reconstruct the path and take the last meaningful segments.
    parts = dirname.split("-")
    parts = [p for p in parts if p]

    # Strip trailing hex-like hash (8+ hex chars)
    if parts and re.fullmatch(r"[a-f0-9]{8,}", parts[-1]):
        parts = parts[:-1]

    if not parts:
        return "unknown"

    # Strip leading path components: Users/<username>, home/<username>
    lower_parts = [p.lower() for p in parts]
    if len(lower_parts) >= 2 and lower_parts[0] in ("users", "home"):
        parts = parts[2:]  # Skip "Users" and username
        lower_parts = [p.lower() for p in parts]

    if not parts:
        return "unknown"

    # Skip common directory names
    skip = {"projects", "others", "repos", "src", "code", "work", "dev"}
    meaningful = [p for p in parts if p.lower() not in skip]

    if not meaningful:
        return parts[-1]

    # Take last 2 meaningful segments joined by dash
    return "-".join(meaningful[-2:]) if len(meaningful) >= 2 else meaningful[-1]


@dataclass
class DiscoveredSession:
    """A session discovered from transcript files."""

    dir_name: str
    jsonl_path: str
    project_name: str
    last_modified: float


class TranscriptWatcher:
    """Scans ~/.claude/projects/ for active session JSONL files."""

    def __init__(
        self,
        projects_dir: str | Path | None = None,
        active_threshold: float = 600.0,
        known_session_ids: set[str] | None = None,
    ) -> None:
        self.projects_dir = Path(projects_dir) if projects_dir else DEFAULT_PROJECTS_DIR
        self.active_threshold = active_threshold
        self.known_session_ids = known_session_ids or set()

    async def scan(self) -> list[DiscoveredSession]:
        """Scan for active sessions not already tracked."""
        if not self.projects_dir.exists():
            return []

        now = time.time()
        discovered: list[DiscoveredSession] = []

        for proj_dir in self.projects_dir.iterdir():
            if not proj_dir.is_dir():
                continue

            dir_name = proj_dir.name
            if dir_name in self.known_session_ids:
                continue

            # Look for JSONL files
            for jsonl in proj_dir.glob("*.jsonl"):
                try:
                    mtime = jsonl.stat().st_mtime
                except OSError:
                    continue

                if now - mtime > self.active_threshold:
                    continue

                project_name = extract_project_name(str(jsonl))
                discovered.append(DiscoveredSession(
                    dir_name=dir_name,
                    jsonl_path=str(jsonl),
                    project_name=project_name,
                    last_modified=mtime,
                ))

        return discovered
