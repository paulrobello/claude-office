from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

__all__ = [
    "MarkerFile",
    "MarkerFileReadError",
    "read_marker",
    "marker_path_for_cwd",
]

MARKER_FILENAME = ".panoptica-run.json"
_REQUIRED = ("run_id", "primary_repo", "workdocs_dir", "started_at", "phase")


class MarkerFileReadError(Exception):
    """Raised when a marker file exists but cannot be parsed into a MarkerFile."""


@dataclass(frozen=True)
class MarkerFile:
    run_id: str
    orchestrator_session_id: str | None
    primary_repo: str
    workdocs_dir: str
    started_at: datetime
    ended_at: datetime | None
    phase: str
    model_config_dict: dict[str, str]
    source_path: Path


def _validate_cwd(
    cwd: Path | str,
    allowed_roots: list[Path] | None = None,
) -> Path:
    path = Path(cwd)
    if not path.is_absolute():
        raise ValueError(f"working_dir must be absolute, got: {cwd!r}")
    resolved = path.resolve(strict=False)
    if allowed_roots is None:
        home_env = os.environ.get("HOME")
        home = Path(home_env) if home_env else Path.home()
        allowed_roots = [home]
    for root in allowed_roots:
        root_resolved = Path(root).resolve(strict=False)
        try:
            resolved.relative_to(root_resolved)
            return resolved
        except ValueError as exc:
            logger.debug("cwd %s is not under allowed root %s: %s", resolved, root_resolved, exc)
            continue
    raise ValueError(
        f"working_dir {resolved!r} is outside allowed roots {[str(r) for r in allowed_roots]!r}"
    )


def marker_path_for_cwd(
    cwd: Path | str,
    allowed_roots: list[Path] | None = None,
) -> Path:
    validated = _validate_cwd(cwd, allowed_roots)
    return validated / "workdocs" / MARKER_FILENAME


def _parse_dt(value: str | None) -> datetime | None:
    if value is None:
        return None
    # Accept trailing 'Z' (ISO-8601 UTC).
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def read_marker(path: Path) -> MarkerFile | None:
    """Read and validate a marker file.

    Returns None if the file does not exist.
    Raises MarkerFileReadError if the file exists but is malformed.
    """
    if not path.exists():
        return None
    try:
        raw: Any = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as e:
        raise MarkerFileReadError(f"{path}: {e}") from e
    if not isinstance(raw, dict):
        raise MarkerFileReadError(f"{path}: expected object, got {type(raw).__name__}")

    missing = [k for k in _REQUIRED if k not in raw]
    if missing:
        raise MarkerFileReadError(f"{path}: missing fields {missing}")

    try:
        started_at = _parse_dt(raw["started_at"])
        ended_at = _parse_dt(raw.get("ended_at"))
        if started_at is None:
            raise MarkerFileReadError(f"{path}: started_at is required")
        model_config_dict = raw.get("model_config") or {}
        if not isinstance(model_config_dict, dict):
            raise MarkerFileReadError(f"{path}: model_config must be object")
        return MarkerFile(
            run_id=str(raw["run_id"]),
            orchestrator_session_id=raw.get("orchestrator_session_id"),
            primary_repo=str(raw["primary_repo"]),
            workdocs_dir=str(raw["workdocs_dir"]),
            started_at=started_at,
            ended_at=ended_at,
            phase=str(raw["phase"]),
            model_config_dict={str(k): str(v) for k, v in model_config_dict.items()},
            source_path=path,
        )
    except (ValueError, TypeError) as e:
        raise MarkerFileReadError(f"{path}: {e}") from e
