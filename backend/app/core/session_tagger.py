# backend/app/core/session_tagger.py
from __future__ import annotations

import logging
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from app.core.marker_file import MarkerFile
from app.models.runs import Role

logger = logging.getLogger(__name__)

__all__ = ["SessionTag", "classify_session"]


@dataclass(frozen=True)
class SessionTag:
    run_id: str
    role: Role | None
    task_id: str | None
    is_orchestrator: bool


def _parse_role(value: str | None) -> Role | None:
    if not value:
        return None
    try:
        return Role(value)
    except ValueError:
        logger.warning("Unknown RALPH_ROLE=%r, leaving role unset", value)
        return None


def classify_session(
    *,
    session_id: str,
    cwd: Path,
    env: Mapping[str, str],
    marker: MarkerFile | None,
) -> SessionTag | None:
    env_run_id = env.get("RALPH_RUN_ID")
    env_role = _parse_role(env.get("RALPH_ROLE"))
    env_task_id = env.get("RALPH_TASK_ID") or None

    if env_run_id and marker:
        if env_run_id != marker.run_id:
            logger.warning(
                "Ralph env/marker run_id mismatch for %s: env=%s marker=%s (preferring env)",
                session_id,
                env_run_id,
                marker.run_id,
            )
        return SessionTag(
            run_id=env_run_id,
            role=env_role,
            task_id=env_task_id,
            is_orchestrator=False,
        )
    if env_run_id:
        logger.info("Tagged session %s from env only (no marker at %s)", session_id, cwd)
        return SessionTag(
            run_id=env_run_id,
            role=env_role,
            task_id=env_task_id,
            is_orchestrator=False,
        )
    if marker:
        return SessionTag(
            run_id=marker.run_id,
            role=None,
            task_id=None,
            is_orchestrator=True,
        )
    return None
