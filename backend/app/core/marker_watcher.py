"""Poll registered workdocs directories for .panoptica-run.json marker changes.

Emits synthetic run_start / run_phase_change / run_end events via a callback.
Modeled on beads_poller.py: hash-based change detection, first-failure WARNING
then DEBUG, asyncio poll loop.

Configuration:
    PANOPTICA_MARKER_POLL_INTERVAL: Polling interval in seconds (default: 1.0)
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
import os
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.marker_file import (
    MarkerFile,
    MarkerFileReadError,
    marker_path_for_cwd,
    read_marker,
)

logger = logging.getLogger(__name__)

DEFAULT_POLL_INTERVAL_SECONDS = 1.0
MAX_WATCHED_PATHS = 256

EventCallback = Callable[[str, dict[str, Any]], Awaitable[None]]


def _get_interval() -> float:
    try:
        return float(
            os.environ.get("PANOPTICA_MARKER_POLL_INTERVAL", str(DEFAULT_POLL_INTERVAL_SECONDS))
        )
    except ValueError as exc:
        logger.debug(
            "Invalid PANOPTICA_MARKER_POLL_INTERVAL %r, using default: %s",
            os.environ.get("PANOPTICA_MARKER_POLL_INTERVAL"),
            exc,
        )
        return DEFAULT_POLL_INTERVAL_SECONDS


def _hash_marker(m: MarkerFile) -> str:
    parts = [m.run_id, m.phase, m.ended_at.isoformat() if m.ended_at else ""]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


@dataclass
class _WatchedPath:
    cwd: Path
    last_hash: str = ""
    last_marker: MarkerFile | None = None
    has_seen_success: bool = False
    announced: bool = False  # True after run_start has been emitted


class MarkerWatcher:
    """Polls a set of CWD paths for marker-file changes and fires async events."""

    def __init__(self, on_event: EventCallback) -> None:
        self._paths: OrderedDict[Path, _WatchedPath] = OrderedDict()
        self._on_event = on_event
        self._task: asyncio.Task[None] | None = None
        self._stopped = False

    def register(self, cwd: Path) -> None:
        cwd = Path(cwd).resolve()
        if cwd in self._paths:
            self._paths.move_to_end(cwd)
            return
        if len(self._paths) >= MAX_WATCHED_PATHS:
            evicted, _ = self._paths.popitem(last=False)
            logger.warning(
                "MarkerWatcher evicting oldest path %s (limit=%d)",
                evicted,
                MAX_WATCHED_PATHS,
            )
        self._paths[cwd] = _WatchedPath(cwd=cwd)

    def unregister(self, cwd: Path) -> None:
        self._paths.pop(Path(cwd).resolve(), None)

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stopped = False
        self._task = asyncio.create_task(self._loop(), name="marker_watcher")

    async def stop(self) -> None:
        self._stopped = True
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _loop(self) -> None:
        try:
            while not self._stopped:
                for state in list(self._paths.values()):
                    await self._poll_once(state)
                await asyncio.sleep(_get_interval())
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — poller must not die
            logger.exception("marker_watcher loop crashed")

    async def _poll_once(self, state: _WatchedPath) -> None:
        try:
            path = marker_path_for_cwd(state.cwd)
        except ValueError as e:
            logger.warning("Rejected unsafe cwd %r in marker watcher: %s", state.cwd, e)
            return
        try:
            marker = read_marker(path)
        except MarkerFileReadError as e:
            if not state.has_seen_success:
                logger.warning("marker read failed for %s: %s", path, e)
            else:
                logger.debug("marker read failed for %s: %s", path, e)
            return

        if marker is None:
            return

        state.has_seen_success = True
        h = _hash_marker(marker)
        if h == state.last_hash:
            return

        prev = state.last_marker
        state.last_hash = h
        state.last_marker = marker

        payload: dict[str, Any] = {
            "run_id": marker.run_id,
            "orchestrator_session_id": marker.orchestrator_session_id,
            "primary_repo": marker.primary_repo,
            "workdocs_dir": marker.workdocs_dir,
            "phase": marker.phase,
            "started_at": marker.started_at.isoformat(),
            "ended_at": marker.ended_at.isoformat() if marker.ended_at else None,
            "model_config": dict(marker.model_config_dict),
        }

        if not state.announced:
            await self._emit("run_start", payload)
            state.announced = True

        if prev is not None and prev.phase != marker.phase:
            await self._emit(
                "run_phase_change",
                {**payload, "from_phase": prev.phase, "to_phase": marker.phase},
            )

        if marker.ended_at and (prev is None or prev.ended_at is None):
            await self._emit("run_end", payload)

    async def _emit(self, event_type: str, payload: dict[str, Any]) -> None:
        try:
            await self._on_event(event_type, payload)
        except Exception:  # noqa: BLE001
            logger.exception("marker_watcher callback error for %s", event_type)


_marker_watcher: MarkerWatcher | None = None


def get_marker_watcher() -> MarkerWatcher | None:
    return _marker_watcher


def init_marker_watcher(on_event: EventCallback) -> MarkerWatcher:
    global _marker_watcher
    _marker_watcher = MarkerWatcher(on_event=on_event)
    return _marker_watcher
