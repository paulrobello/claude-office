from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

from app.core.plan_parser import parse_plan_md
from app.models.runs import PlanTask

logger = logging.getLogger(__name__)

DEFAULT_POLL_INTERVAL_SECONDS = 1.0
MAX_PLAN_BYTES = 1 * 1024 * 1024  # 1 MiB

PlanCallback = Callable[[str, list[PlanTask]], Awaitable[None]]


def _get_interval() -> float:
    try:
        return float(
            os.environ.get("PANOPTICA_PLAN_POLL_INTERVAL", str(DEFAULT_POLL_INTERVAL_SECONDS))
        )
    except ValueError as exc:
        logger.debug(
            "Invalid PANOPTICA_PLAN_POLL_INTERVAL %r, using default: %s",
            os.environ.get("PANOPTICA_PLAN_POLL_INTERVAL"),
            exc,
        )
        return DEFAULT_POLL_INTERVAL_SECONDS


@dataclass
class _PlanState:
    run_id: str
    path: Path
    last_hash: str = ""
    last_mtime: float = -1.0
    last_size: int = -1
    warned: bool = False  # first-failure WARN already emitted; resets on recovery


class PlanWatcher:
    def __init__(self, on_update: PlanCallback) -> None:
        self._states: dict[str, _PlanState] = {}
        self._cb = on_update
        self._task: asyncio.Task[None] | None = None
        self._stopped = False

    def register(self, run_id: str, plan_path: Path) -> None:
        self._states[run_id] = _PlanState(run_id=run_id, path=Path(plan_path))

    def unregister(self, run_id: str) -> None:
        self._states.pop(run_id, None)

    async def start(self) -> None:
        if self._task:
            return
        self._stopped = False
        self._task = asyncio.create_task(self._loop(), name="plan_watcher")

    async def stop(self) -> None:
        self._stopped = True
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _loop(self) -> None:
        try:
            while not self._stopped:
                for state in list(self._states.values()):
                    await self._poll_one(state)
                await asyncio.sleep(_get_interval())
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("plan_watcher loop crashed")

    async def _poll_one(self, state: _PlanState) -> None:
        if not state.path.exists():
            if not state.warned:
                logger.warning(
                    "plan file not found for %s: %s (subsequent failures at DEBUG)",
                    state.run_id,
                    state.path,
                )
                state.warned = True
            else:
                logger.debug("plan file still missing for %s: %s", state.run_id, state.path)
            return
        try:
            st = state.path.stat()
        except OSError:
            st = None
        file_size = st.st_size if st is not None else 0
        if file_size > MAX_PLAN_BYTES:
            logger.warning(
                "plan file for %s exceeds size cap (%d MiB > 1 MiB), skipping: %s",
                state.run_id,
                file_size // (1024 * 1024),
                state.path,
            )
            return
        if (
            st is not None
            and st.st_mtime == state.last_mtime
            and st.st_size == state.last_size
        ):
            return
        try:
            content = state.path.read_text()
        except OSError as e:
            if not state.warned:
                logger.warning(
                    "plan read failed for %s: %s (subsequent failures at DEBUG)",
                    state.path,
                    e,
                )
                state.warned = True
            else:
                logger.debug("plan read failed for %s: %s", state.path, e)
            return
        if state.warned:
            logger.info("plan file recovered for %s: %s", state.run_id, state.path)
            state.warned = False
        h = hashlib.sha256(content.encode()).hexdigest()
        if st is not None:
            state.last_mtime = st.st_mtime
            state.last_size = st.st_size
        if h == state.last_hash:
            return
        state.last_hash = h
        tasks = parse_plan_md(content)
        try:
            await self._cb(state.run_id, tasks)
        except Exception:
            logger.exception("plan_watcher callback error for %s", state.run_id)


_plan_watcher: PlanWatcher | None = None


def get_plan_watcher() -> PlanWatcher | None:
    return _plan_watcher


def init_plan_watcher(on_update: PlanCallback) -> PlanWatcher:
    global _plan_watcher
    _plan_watcher = PlanWatcher(on_update=on_update)
    return _plan_watcher
