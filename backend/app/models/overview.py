"""Cross-session overview models for the Command Center view.

The Command Center gathers the boss (main agent) of every live session into a
single compact payload so the user can see, at a glance, which terminals are
working, which need attention, and which are done.  Unlike the room-level merge,
there is no lead/teammate hierarchy and no desk layout — every session is an
equal "peer".
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, cast

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.models.agents import BossState

__all__ = [
    "OverviewBucket",
    "OverviewEntry",
    "OverviewState",
]

# Status buckets used to place a peer into a zone on the Command Center canvas.
# The "ended" bucket is applied frontend-side from the session list, so it is
# not part of the live backend payload.
OverviewBucket = Literal["needs_you", "working", "done"]


class OverviewEntry(BaseModel):
    """A single session's boss snapshot for the Command Center."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str
    bucket: OverviewBucket
    state: BossState  # raw boss state, for the peer tooltip
    current_task: str | None = None
    todo_done: int = 0
    todo_total: int = 0
    subagent_count: int = 0


class OverviewState(BaseModel):
    """The full cross-session overview broadcast over ``/ws/overview``."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    entries: list[OverviewEntry] = Field(default_factory=lambda: cast(list[OverviewEntry], []))
    last_updated: datetime
