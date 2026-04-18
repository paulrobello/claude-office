from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

__all__ = [
    "Role",
    "RunPhase",
    "RunOutcome",
    "PlanTaskStatus",
    "PlanTask",
    "RunStats",
    "Run",
]


class Role(StrEnum):
    DESIGNER = "designer"
    CODER = "coder"
    CODER_CONTINUATION = "coder-continuation"
    VERIFIER = "verifier"
    REVIEWER = "reviewer"


class RunPhase(StrEnum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    DONE = "done"


class RunOutcome(StrEnum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    STUCK = "stuck"
    ABANDONED = "abandoned"


class PlanTaskStatus(StrEnum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class PlanTask(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    title: str
    status: PlanTaskStatus = PlanTaskStatus.TODO
    assigned_session_id: str | None = None


class RunStats(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    elapsed_seconds: int = 0
    phase_timings: dict[str, int] = Field(default_factory=dict)


class Run(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    run_id: str
    orchestrator_session_id: str | None
    primary_repo: str
    workdocs_dir: str
    phase: RunPhase
    started_at: datetime
    ended_at: datetime | None
    outcome: RunOutcome
    # model_config collides with Pydantic's ConfigDict; use model_config_ with alias
    model_config_: dict[str, str] = Field(default_factory=dict, alias="modelConfig")

    member_session_ids: set[str] = Field(default_factory=set)
    plan_tasks: list[PlanTask] = Field(default_factory=list)
    stats: RunStats = Field(default_factory=RunStats)

    # Reserved for Spec B — populated as None in MVP
    token_usage: dict[str, Any] | None = None
    cost_usd: float | None = None
