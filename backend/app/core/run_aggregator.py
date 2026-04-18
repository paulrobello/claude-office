from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from app.core.marker_file import MarkerFile
from app.models.runs import Role, Run, RunOutcome, RunPhase

logger = logging.getLogger(__name__)

__all__ = ["RunAggregator", "RunDiff"]


def _coerce_phase(raw: str) -> RunPhase:
    try:
        return RunPhase(raw)
    except ValueError:
        logger.warning("Unknown phase %r — treating as A", raw)
        return RunPhase.A


@dataclass(frozen=True)
class RunDiff:
    run_id: str
    created: bool = False
    phase_changed: tuple[str, str] | None = None
    ended: bool = False


class RunAggregator:
    def __init__(self) -> None:
        self._runs: dict[str, Run] = {}

    def get(self, run_id: str) -> Run | None:
        return self._runs.get(run_id)

    def list_active(self) -> list[Run]:
        return [r for r in self._runs.values() if r.ended_at is None]

    def list_all(self) -> list[Run]:
        return list(self._runs.values())

    def upsert_from_marker(self, marker: MarkerFile) -> RunDiff:
        existing = self._runs.get(marker.run_id)
        new_phase = _coerce_phase(marker.phase)

        if existing is None:
            run = Run(
                run_id=marker.run_id,
                orchestrator_session_id=marker.orchestrator_session_id,
                primary_repo=marker.primary_repo,
                workdocs_dir=marker.workdocs_dir,
                phase=new_phase,
                started_at=marker.started_at,
                ended_at=marker.ended_at,
                outcome=(RunOutcome.COMPLETED if marker.ended_at else RunOutcome.IN_PROGRESS),
                model_config_={**marker.model_config_dict},
            )
            self._runs[run.run_id] = run
            return RunDiff(run_id=run.run_id, created=True, ended=marker.ended_at is not None)

        diff = RunDiff(run_id=existing.run_id)
        if existing.phase != new_phase:
            diff = RunDiff(
                run_id=existing.run_id,
                phase_changed=(existing.phase.value, new_phase.value),
            )
            existing.phase = new_phase

        if marker.ended_at and existing.ended_at is None:
            existing.ended_at = marker.ended_at
            existing.outcome = RunOutcome.COMPLETED
            diff = RunDiff(
                run_id=existing.run_id,
                phase_changed=diff.phase_changed,
                ended=True,
            )
        return diff

    def add_member(
        self,
        run_id: str,
        *,
        session_id: str,
        role: Role | None,
        task_id: str | None,
        is_orchestrator: bool,
    ) -> None:
        run = self._runs.get(run_id)
        if run is None:
            logger.warning("add_member called for unknown run %s (session=%s)", run_id, session_id)
            return
        run.member_session_ids.add(session_id)
        if is_orchestrator and run.orchestrator_session_id is None:
            run.orchestrator_session_id = session_id

    def remove_member(self, run_id: str, *, session_id: str) -> None:
        run = self._runs.get(run_id)
        if run is None:
            logger.debug("remove_member called for unknown run %s (session=%s)", run_id, session_id)
            return
        run.member_session_ids.discard(session_id)

    def end_if_orchestrator_stopped(self, session_id: str) -> RunDiff | None:
        for run in self._runs.values():
            if run.orchestrator_session_id == session_id and run.ended_at is None:
                run.ended_at = datetime.now(UTC)
                run.outcome = RunOutcome.COMPLETED
                return RunDiff(run_id=run.run_id, ended=True)
        return None
