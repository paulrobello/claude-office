# Ralph × Panoptica — Plan 1: Backend Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the backend event pipeline for Spec A (Run visualizer) — session classification, Run aggregation, marker-file and PLAN.md watchers, and synthetic run events — behind the existing WebSocket broadcast, with no user-visible change until the frontend plan lands.

**Architecture:** Additive layer on top of the existing Session-centric FastAPI/state-machine backend. Three pure modules (marker reader, PLAN parser, session tagger), two pollers modeled on `beads_poller.py`, a `RunAggregator` that owns Run objects in memory, new synthetic event types, and a minimal integration into the existing `session_start`/`session_end` handlers and event broadcast.

**Tech Stack:** Python 3.12+, Pydantic v2 (camelCase `alias_generator`), asyncio, FastAPI, pytest, `uv run pytest`, `make checkall`.

**Spec reference:** `docs/superpowers/specs/2026-04-18-ralph-panoptica-merger-design.md`

---

## File Structure

Files created in this plan:

- `backend/app/models/runs.py` — `Role`, `PlanTaskStatus`, `PlanTask`, `RunStats`, `Run`, `RunOutcome`, `RunPhase`.
- `backend/app/core/marker_file.py` — pure reader/validator for `workdocs/.panoptica-run.json`.
- `backend/app/core/plan_parser.py` — pure lax PLAN.md → `list[PlanTask]`.
- `backend/app/core/session_tagger.py` — reconciles env vars + marker into `SessionTag`.
- `backend/app/core/run_aggregator.py` — in-memory Run store; join/leave, phase, end.
- `backend/app/core/marker_watcher.py` — polls known marker paths; emits synthetic events.
- `backend/app/core/plan_watcher.py` — polls `PLAN.md` for active runs.

Files modified:

- `backend/app/models/events.py` — add `RUN_START`, `RUN_PHASE_CHANGE`, `RUN_END`, `ROLE_SESSION_JOINED`; extend `EventData` with run fields.
- `backend/app/models/sessions.py` — add `run_id`, `role`, `task_id` to `Session`.
- `backend/app/core/handlers/session_handler.py` — wire tagger into `handle_session_start`, aggregator on start/end.
- `backend/app/core/broadcast_service.py` (or equivalent) — add `run_state` broadcast channel.

Tests created:

- `backend/tests/test_models_runs.py`
- `backend/tests/test_marker_file.py`
- `backend/tests/test_plan_parser.py`
- `backend/tests/test_session_tagger.py`
- `backend/tests/test_run_aggregator.py`
- `backend/tests/test_marker_watcher.py`
- `backend/tests/test_plan_watcher.py`
- `backend/tests/test_ralph_pipeline_smoke.py` — integration smoke.

---

## Task 1: Run domain types

**Files:**
- Create: `backend/app/models/runs.py`
- Test:   `backend/tests/test_models_runs.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_models_runs.py
from datetime import datetime, UTC
from app.models.runs import (
    Role, RunPhase, RunOutcome, PlanTaskStatus, PlanTask, RunStats, Run,
)


def test_role_values():
    assert Role.DESIGNER == "designer"
    assert Role.CODER == "coder"
    assert Role.CODER_CONTINUATION == "coder-continuation"
    assert Role.VERIFIER == "verifier"
    assert Role.REVIEWER == "reviewer"


def test_run_minimal_construction():
    run = Run(
        run_id="ral-20260418-a7f3",
        orchestrator_session_id=None,
        primary_repo="/tmp/repo",
        workdocs_dir="/tmp/repo/workdocs",
        phase=RunPhase.A,
        started_at=datetime.now(UTC),
        ended_at=None,
        outcome=RunOutcome.IN_PROGRESS,
        model_config={"coder": "claude-sonnet-4-6"},
    )
    assert run.member_session_ids == set()
    assert run.plan_tasks == []
    assert run.token_usage is None
    assert run.cost_usd is None


def test_run_camelcase_serialisation():
    run = Run(
        run_id="ral-x",
        orchestrator_session_id="s1",
        primary_repo="/r",
        workdocs_dir="/r/workdocs",
        phase=RunPhase.B,
        started_at=datetime.now(UTC),
        ended_at=None,
        outcome=RunOutcome.IN_PROGRESS,
        model_config={},
    )
    d = run.model_dump(by_alias=True)
    assert "runId" in d
    assert "primaryRepo" in d
    assert "modelConfig" in d


def test_plan_task_status_round_trip():
    t = PlanTask(id="plan-task-1", title="scaffold api", status=PlanTaskStatus.TODO)
    assert t.status == "todo"
    t.status = PlanTaskStatus.IN_PROGRESS
    assert t.status == "in_progress"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/test_models_runs.py -v`
Expected: FAIL — `app.models.runs` does not exist.

- [ ] **Step 3: Implement the module**

```python
# backend/app/models/runs.py
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
    model_config_: dict[str, str] = Field(default_factory=dict, alias="modelConfig")

    member_session_ids: set[str] = Field(default_factory=set)
    plan_tasks: list[PlanTask] = Field(default_factory=list)
    stats: RunStats = Field(default_factory=RunStats)

    # Reserved for Spec B — shape owned by Spec B.
    token_usage: dict[str, Any] | None = None
    cost_usd: float | None = None
```

Note: `model_config` collides with Pydantic's own `ConfigDict` attribute. Use attribute name `model_config_` with alias `modelConfig` so JSON stays `modelConfig` while Python stays unambiguous.

- [ ] **Step 4: Adjust tests to read `run.model_config_`**

Update both constructor calls in the test to pass the keyword `model_config={...}` via alias — Pydantic accepts alias with `populate_by_name=True`. If tests still fail, rewrite fields in tests as `modelConfig={...}` (kwarg by alias) — not both. Pick one convention and keep it.

Chosen convention: tests use the Python attribute `model_config_`:

```python
run = Run(
    run_id=...,
    model_config_={"coder": "claude-sonnet-4-6"},
    ...
)
```

Update the two tests accordingly.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_models_runs.py -v`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/runs.py backend/tests/test_models_runs.py
git commit -m "feat(runs): add Run/PlanTask/RunStats domain types"
```

---

## Task 2: Extend Session with run_id / role / task_id

**Files:**
- Modify: `backend/app/models/sessions.py`
- Modify: `backend/tests/test_state_machine.py` (only if a constructor call breaks — otherwise leave)
- Test:   add cases to `backend/tests/test_models_runs.py`

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_models_runs.py`:

```python
from datetime import datetime, UTC
from app.models.sessions import Session
from app.models.runs import Role


def test_session_has_run_fields_nullable_by_default():
    s = Session(
        id="01HX",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        status="active",
        event_count=0,
        agent_count=0,
    )
    assert s.run_id is None
    assert s.role is None
    assert s.task_id is None


def test_session_accepts_run_fields():
    s = Session(
        id="01HX",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        status="active",
        event_count=0,
        agent_count=0,
        run_id="ral-20260418-a7f3",
        role=Role.CODER,
        task_id="plan-task-5",
    )
    assert s.run_id == "ral-20260418-a7f3"
    assert s.role == Role.CODER
    assert s.task_id == "plan-task-5"
```

- [ ] **Step 2: Run — verify fail**

Run: `cd backend && uv run pytest tests/test_models_runs.py::test_session_has_run_fields_nullable_by_default -v`
Expected: FAIL (unexpected-keyword or AttributeError).

- [ ] **Step 3: Edit `Session` in `backend/app/models/sessions.py`**

```python
from app.models.runs import Role

class Session(BaseModel):
    """A Claude Code session summary."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    created_at: datetime
    updated_at: datetime
    status: str  # "active" | "completed" | "error"
    event_count: int
    agent_count: int
    run_id: str | None = None
    role: Role | None = None
    task_id: str | None = None
```

(Also ensure `Session` gets the alias_generator — the existing class did not. If other code constructs `Session` via positional or by-alias kwargs, check with `grep -n "Session(" backend/`. Fix any new failures before proceeding.)

- [ ] **Step 4: Run tests**

Run: `cd backend && uv run pytest tests/test_models_runs.py -v && uv run pytest tests/ -q`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/sessions.py backend/tests/test_models_runs.py
git commit -m "feat(sessions): add run_id/role/task_id Ralph-attribution fields"
```

---

## Task 3: Synthetic event types + EventData extensions

**Files:**
- Modify: `backend/app/models/events.py`
- Test:   add to `backend/tests/test_models_runs.py` (or a new `test_events_run.py`)

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_events_run.py
from datetime import datetime, UTC
from app.models.events import Event, EventData, EventType


def test_run_event_types_exist():
    assert EventType.RUN_START == "run_start"
    assert EventType.RUN_PHASE_CHANGE == "run_phase_change"
    assert EventType.RUN_END == "run_end"
    assert EventType.ROLE_SESSION_JOINED == "role_session_joined"


def test_event_data_accepts_run_fields():
    e = Event(
        event_type=EventType.RUN_PHASE_CHANGE,
        session_id="orchestrator-01HX",
        timestamp=datetime.now(UTC),
        data=EventData(
            run_id="ral-20260418-a7f3",
            from_phase="A",
            to_phase="B",
            ralph_role=None,
        ),
    )
    assert e.data.run_id == "ral-20260418-a7f3"
    assert e.data.from_phase == "A"
    assert e.data.to_phase == "B"
```

- [ ] **Step 2: Run — verify fail**

Run: `cd backend && uv run pytest tests/test_events_run.py -v`
Expected: FAIL.

- [ ] **Step 3: Edit `events.py`**

Add four members to `EventType`:

```python
    RUN_START = "run_start"
    RUN_PHASE_CHANGE = "run_phase_change"
    RUN_END = "run_end"
    ROLE_SESSION_JOINED = "role_session_joined"
```

Add fields to `EventData`:

```python
    # Ralph run fields (Spec A)
    run_id: str | None = None
    orchestrator_session_id: str | None = None
    primary_repo: str | None = None
    workdocs_dir: str | None = None
    from_phase: str | None = None
    to_phase: str | None = None
    outcome: str | None = None
    ralph_role: str | None = None  # matches RALPH_ROLE env, kept as str for forward-compat
    ralph_task_id: str | None = None
    model_config_dict: dict[str, str] | None = None
```

Keep the field name `model_config_dict` with Python; EventData already avoids the `model_config` name collision by being a pure data class. Do NOT name this field `model_config` — it would shadow Pydantic's config.

- [ ] **Step 4: Run — verify pass**

Run: `cd backend && uv run pytest tests/test_events_run.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/events.py backend/tests/test_events_run.py
git commit -m "feat(events): add run_start/run_phase_change/run_end/role_session_joined"
```

---

## Task 4: Marker file reader (pure)

**Files:**
- Create: `backend/app/core/marker_file.py`
- Test:   `backend/tests/test_marker_file.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_marker_file.py
import json
from pathlib import Path
import tempfile
import pytest

from app.core.marker_file import (
    MarkerFile, MarkerFileReadError, read_marker, marker_path_for_cwd,
)


VALID = {
    "run_id": "ral-20260418-a7f3",
    "orchestrator_session_id": "01ARZ3NDEK",
    "primary_repo": "/Users/m/dev/athlete-optics",
    "workdocs_dir": "/Users/m/dev/athlete-optics/workdocs",
    "started_at": "2026-04-18T14:32:07Z",
    "ended_at": None,
    "phase": "A",
    "model_config": {"coder": "claude-sonnet-4-6"},
}


def _write(tmp: Path, payload: dict | str) -> Path:
    p = tmp / ".panoptica-run.json"
    if isinstance(payload, dict):
        p.write_text(json.dumps(payload))
    else:
        p.write_text(payload)
    return p


def test_read_marker_valid(tmp_path: Path):
    p = _write(tmp_path, VALID)
    m = read_marker(p)
    assert m.run_id == "ral-20260418-a7f3"
    assert m.phase == "A"
    assert m.ended_at is None
    assert m.model_config_dict == {"coder": "claude-sonnet-4-6"}


def test_read_marker_missing_file_returns_none(tmp_path: Path):
    assert read_marker(tmp_path / ".panoptica-run.json") is None


def test_read_marker_malformed_json_raises(tmp_path: Path):
    p = _write(tmp_path, "{not json")
    with pytest.raises(MarkerFileReadError):
        read_marker(p)


def test_read_marker_missing_required_field_raises(tmp_path: Path):
    bad = {k: v for k, v in VALID.items() if k != "run_id"}
    p = _write(tmp_path, bad)
    with pytest.raises(MarkerFileReadError):
        read_marker(p)


def test_marker_path_for_cwd_appends_workdocs(tmp_path: Path):
    assert marker_path_for_cwd(tmp_path) == tmp_path / "workdocs" / ".panoptica-run.json"
```

- [ ] **Step 2: Run — verify fail**

Run: `cd backend && uv run pytest tests/test_marker_file.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement module**

```python
# backend/app/core/marker_file.py
from __future__ import annotations

import json
import logging
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


def marker_path_for_cwd(cwd: Path | str) -> Path:
    return Path(cwd) / "workdocs" / MARKER_FILENAME


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
```

- [ ] **Step 4: Run — verify pass**

Run: `cd backend && uv run pytest tests/test_marker_file.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/marker_file.py backend/tests/test_marker_file.py
git commit -m "feat(marker): add marker-file reader for Panoptica run attribution"
```

---

## Task 5: PLAN.md parser (pure, lax)

**Files:**
- Create: `backend/app/core/plan_parser.py`
- Test:   `backend/tests/test_plan_parser.py`

Ralph's PLAN.md uses checkbox lines `- [ ] plan-task-N: title`, `- [x] ...`, `- [~] ...` (in-progress). Task IDs are stable.

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_plan_parser.py
from app.core.plan_parser import parse_plan_md
from app.models.runs import PlanTaskStatus


SAMPLE = """\
# PLAN

Some prose.

- [x] plan-task-1: scaffold api
- [x] plan-task-2: auth wiring
- [~] plan-task-3: feed schema
- [ ] plan-task-4: fetcher stub
   not-a-task bullet
- [ ] plan-task-5: rate-limit logic

# notes
misc line
"""


def test_parse_plan_md_basic():
    tasks = parse_plan_md(SAMPLE)
    ids = [t.id for t in tasks]
    assert ids == ["plan-task-1", "plan-task-2", "plan-task-3", "plan-task-4", "plan-task-5"]
    assert tasks[0].status == PlanTaskStatus.DONE
    assert tasks[2].status == PlanTaskStatus.IN_PROGRESS
    assert tasks[3].status == PlanTaskStatus.TODO
    assert tasks[0].title == "scaffold api"


def test_parse_plan_md_empty_returns_empty():
    assert parse_plan_md("") == []


def test_parse_plan_md_ignores_garbage_lines():
    content = "- [ ] not-a-plan-task just a bullet\n- [x] plan-task-9: real\n"
    tasks = parse_plan_md(content)
    assert len(tasks) == 1
    assert tasks[0].id == "plan-task-9"


def test_parse_plan_md_unrecognised_status_char_defaults_todo():
    content = "- [?] plan-task-1: weird\n"
    tasks = parse_plan_md(content)
    assert tasks[0].status == PlanTaskStatus.TODO
```

- [ ] **Step 2: Run — verify fail**

Run: `cd backend && uv run pytest tests/test_plan_parser.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement module**

```python
# backend/app/core/plan_parser.py
from __future__ import annotations

import logging
import re

from app.models.runs import PlanTask, PlanTaskStatus

logger = logging.getLogger(__name__)

__all__ = ["parse_plan_md"]


_LINE_RE = re.compile(
    r"^\s*-\s*\[(?P<mark>.)\]\s*(?P<id>plan-task-\d+)\s*:\s*(?P<title>.+?)\s*$"
)

_STATUS_MAP = {
    " ": PlanTaskStatus.TODO,
    "x": PlanTaskStatus.DONE,
    "X": PlanTaskStatus.DONE,
    "~": PlanTaskStatus.IN_PROGRESS,
}


def parse_plan_md(content: str) -> list[PlanTask]:
    tasks: list[PlanTask] = []
    seen_ids: set[str] = set()
    for raw_line in content.splitlines():
        m = _LINE_RE.match(raw_line)
        if not m:
            continue
        task_id = m.group("id")
        if task_id in seen_ids:
            logger.warning("PLAN.md duplicate task id %s — keeping first", task_id)
            continue
        seen_ids.add(task_id)
        status = _STATUS_MAP.get(m.group("mark"), PlanTaskStatus.TODO)
        tasks.append(PlanTask(id=task_id, title=m.group("title"), status=status))
    return tasks
```

- [ ] **Step 4: Run — verify pass**

Run: `cd backend && uv run pytest tests/test_plan_parser.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/plan_parser.py backend/tests/test_plan_parser.py
git commit -m "feat(plan): add lax PLAN.md parser for Ralph run tasks"
```

---

## Task 6: Session tagger

Classifies a session at `session_start` time across the 4 env-vs-marker permutations.

**Files:**
- Create: `backend/app/core/session_tagger.py`
- Test:   `backend/tests/test_session_tagger.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_session_tagger.py
from pathlib import Path
import pytest

from app.core.session_tagger import SessionTag, classify_session
from app.core.marker_file import MarkerFile
from app.models.runs import Role
from datetime import datetime, UTC


def _marker(tmp_path: Path, run_id: str = "ral-1") -> MarkerFile:
    return MarkerFile(
        run_id=run_id,
        orchestrator_session_id="orc-1",
        primary_repo=str(tmp_path),
        workdocs_dir=str(tmp_path / "workdocs"),
        started_at=datetime.now(UTC),
        ended_at=None,
        phase="A",
        model_config_dict={},
        source_path=tmp_path / "workdocs" / ".panoptica-run.json",
    )


def test_env_and_marker_agree(tmp_path: Path):
    env = {"RALPH_RUN_ID": "ral-1", "RALPH_ROLE": "coder", "RALPH_TASK_ID": "plan-task-5"}
    tag = classify_session(session_id="s1", cwd=tmp_path, env=env, marker=_marker(tmp_path))
    assert tag == SessionTag(run_id="ral-1", role=Role.CODER, task_id="plan-task-5", is_orchestrator=False)


def test_env_only_still_tags(tmp_path: Path):
    env = {"RALPH_RUN_ID": "ral-2", "RALPH_ROLE": "designer"}
    tag = classify_session(session_id="s1", cwd=tmp_path, env=env, marker=None)
    assert tag.run_id == "ral-2"
    assert tag.role == Role.DESIGNER
    assert tag.is_orchestrator is False


def test_marker_only_tags_as_orchestrator(tmp_path: Path):
    tag = classify_session(session_id="orc-1", cwd=tmp_path, env={}, marker=_marker(tmp_path))
    assert tag.run_id == "ral-1"
    assert tag.role is None
    assert tag.is_orchestrator is True


def test_neither_returns_none(tmp_path: Path):
    assert classify_session(session_id="s1", cwd=tmp_path, env={}, marker=None) is None


def test_env_marker_run_id_mismatch_prefers_env_logs_warning(tmp_path: Path, caplog):
    env = {"RALPH_RUN_ID": "ral-MISMATCH", "RALPH_ROLE": "coder"}
    marker = _marker(tmp_path, run_id="ral-1")
    tag = classify_session(session_id="s1", cwd=tmp_path, env=env, marker=marker)
    assert tag.run_id == "ral-MISMATCH"
    assert any("mismatch" in r.message.lower() for r in caplog.records)


def test_unknown_role_returns_none_role(tmp_path: Path):
    env = {"RALPH_RUN_ID": "ral-1", "RALPH_ROLE": "nonsense"}
    tag = classify_session(session_id="s1", cwd=tmp_path, env=env, marker=None)
    assert tag.run_id == "ral-1"
    assert tag.role is None
```

- [ ] **Step 2: Run — verify fail**

Run: `cd backend && uv run pytest tests/test_session_tagger.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement module**

```python
# backend/app/core/session_tagger.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

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
                "Ralph env/marker run_id mismatch for session %s: env=%s marker=%s (preferring env)",
                session_id, env_run_id, marker.run_id,
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
```

- [ ] **Step 4: Run — verify pass**

Run: `cd backend && uv run pytest tests/test_session_tagger.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/session_tagger.py backend/tests/test_session_tagger.py
git commit -m "feat(tagger): classify sessions by Ralph env + marker"
```

---

## Task 7: Run aggregator

Holds Run objects in memory; membership, phase, end. No I/O; driven by explicit calls.

**Files:**
- Create: `backend/app/core/run_aggregator.py`
- Test:   `backend/tests/test_run_aggregator.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_run_aggregator.py
from datetime import datetime, UTC
from pathlib import Path

from app.core.marker_file import MarkerFile
from app.core.run_aggregator import RunAggregator
from app.models.runs import Role, RunOutcome, RunPhase


def _marker(run_id="ral-1", phase="A", ended_at=None) -> MarkerFile:
    return MarkerFile(
        run_id=run_id,
        orchestrator_session_id="orc-1",
        primary_repo="/repo",
        workdocs_dir="/repo/workdocs",
        started_at=datetime(2026, 4, 18, tzinfo=UTC),
        ended_at=ended_at,
        phase=phase,
        model_config_dict={"coder": "claude-sonnet-4-6"},
        source_path=Path("/repo/workdocs/.panoptica-run.json"),
    )


def test_upsert_from_marker_creates_run():
    agg = RunAggregator()
    diff = agg.upsert_from_marker(_marker())
    assert diff.created is True
    run = agg.get("ral-1")
    assert run is not None
    assert run.phase == RunPhase.A
    assert run.outcome == RunOutcome.IN_PROGRESS


def test_upsert_detects_phase_change():
    agg = RunAggregator()
    agg.upsert_from_marker(_marker(phase="A"))
    diff = agg.upsert_from_marker(_marker(phase="B"))
    assert diff.created is False
    assert diff.phase_changed == ("A", "B")


def test_upsert_detects_end():
    agg = RunAggregator()
    agg.upsert_from_marker(_marker())
    ended = _marker(ended_at=datetime(2026, 4, 18, 16, tzinfo=UTC))
    diff = agg.upsert_from_marker(ended)
    assert diff.ended is True
    run = agg.get("ral-1")
    assert run.outcome == RunOutcome.COMPLETED
    assert run.ended_at is not None


def test_add_member_session_and_leave():
    agg = RunAggregator()
    agg.upsert_from_marker(_marker())
    agg.add_member("ral-1", session_id="s1", role=Role.CODER, task_id="plan-task-5", is_orchestrator=False)
    run = agg.get("ral-1")
    assert "s1" in run.member_session_ids
    agg.remove_member("ral-1", session_id="s1")
    run = agg.get("ral-1")
    assert "s1" not in run.member_session_ids


def test_add_orchestrator_sets_orchestrator_session_id():
    agg = RunAggregator()
    agg.upsert_from_marker(_marker())
    agg.add_member("ral-1", session_id="orc-1", role=None, task_id=None, is_orchestrator=True)
    assert agg.get("ral-1").orchestrator_session_id == "orc-1"


def test_end_by_orchestrator_stop():
    agg = RunAggregator()
    agg.upsert_from_marker(_marker())
    agg.add_member("ral-1", session_id="orc-1", role=None, task_id=None, is_orchestrator=True)
    diff = agg.end_if_orchestrator_stopped("orc-1")
    assert diff is not None
    assert diff.ended is True
    # Second trigger is a no-op
    assert agg.end_if_orchestrator_stopped("orc-1") is None


def test_list_active_runs():
    agg = RunAggregator()
    agg.upsert_from_marker(_marker("ral-1"))
    agg.upsert_from_marker(_marker("ral-2"))
    assert {r.run_id for r in agg.list_active()} == {"ral-1", "ral-2"}
```

- [ ] **Step 2: Run — verify fail**

Run: `cd backend && uv run pytest tests/test_run_aggregator.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement module**

```python
# backend/app/core/run_aggregator.py
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
                outcome=(
                    RunOutcome.COMPLETED if marker.ended_at else RunOutcome.IN_PROGRESS
                ),
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
            return
        run.member_session_ids.discard(session_id)

    def end_if_orchestrator_stopped(self, session_id: str) -> RunDiff | None:
        for run in self._runs.values():
            if run.orchestrator_session_id == session_id and run.ended_at is None:
                run.ended_at = datetime.now(UTC)
                run.outcome = RunOutcome.COMPLETED
                return RunDiff(run_id=run.run_id, ended=True)
        return None
```

- [ ] **Step 4: Run — verify pass**

Run: `cd backend && uv run pytest tests/test_run_aggregator.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/run_aggregator.py backend/tests/test_run_aggregator.py
git commit -m "feat(runs): in-memory RunAggregator with membership + phase + end"
```

---

## Task 8: Marker-file watcher

Polls a set of marker-file paths, synthesizes `run_start` / `run_phase_change` / `run_end` events.

**Files:**
- Create: `backend/app/core/marker_watcher.py`
- Test:   `backend/tests/test_marker_watcher.py`

Modeled on `beads_poller.py`: registered paths, asyncio poll loop, hash-based change detection, first-failure WARNING then DEBUG, callback-based publishing of synthetic events.

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_marker_watcher.py
import asyncio
import json
from datetime import datetime, UTC
from pathlib import Path

import pytest

from app.core.marker_watcher import MarkerWatcher


def _write(tmp: Path, phase: str, ended_at: str | None = None, run_id: str = "ral-1") -> Path:
    wd = tmp / "workdocs"
    wd.mkdir(exist_ok=True)
    p = wd / ".panoptica-run.json"
    p.write_text(json.dumps({
        "run_id": run_id,
        "orchestrator_session_id": "orc-1",
        "primary_repo": str(tmp),
        "workdocs_dir": str(wd),
        "started_at": "2026-04-18T14:32:07Z",
        "ended_at": ended_at,
        "phase": phase,
        "model_config": {"coder": "claude-sonnet-4-6"},
    }))
    return p


@pytest.mark.asyncio
async def test_watcher_emits_run_start(tmp_path, monkeypatch):
    monkeypatch.setenv("PANOPTICA_MARKER_POLL_INTERVAL", "0.05")
    events: list[tuple[str, dict]] = []

    async def cb(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    w = MarkerWatcher(on_event=cb)
    _write(tmp_path, phase="A")
    w.register(tmp_path)
    await w.start()
    await asyncio.sleep(0.2)
    await w.stop()
    assert any(t == "run_start" for t, _ in events)


@pytest.mark.asyncio
async def test_watcher_emits_phase_change_and_end(tmp_path, monkeypatch):
    monkeypatch.setenv("PANOPTICA_MARKER_POLL_INTERVAL", "0.05")
    events: list[tuple[str, dict]] = []

    async def cb(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    w = MarkerWatcher(on_event=cb)
    _write(tmp_path, phase="A")
    w.register(tmp_path)
    await w.start()
    await asyncio.sleep(0.15)
    _write(tmp_path, phase="B")
    await asyncio.sleep(0.15)
    _write(tmp_path, phase="B", ended_at="2026-04-18T16:00:00Z")
    await asyncio.sleep(0.15)
    await w.stop()

    types = [t for t, _ in events]
    assert "run_start" in types
    assert "run_phase_change" in types
    assert "run_end" in types


@pytest.mark.asyncio
async def test_watcher_ignores_missing_file(tmp_path, monkeypatch):
    monkeypatch.setenv("PANOPTICA_MARKER_POLL_INTERVAL", "0.05")
    events: list[tuple[str, dict]] = []

    async def cb(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    w = MarkerWatcher(on_event=cb)
    w.register(tmp_path)  # no marker file written
    await w.start()
    await asyncio.sleep(0.15)
    await w.stop()
    assert events == []
```

(`pytest-asyncio` is likely already a dev dep — if not, `uv add --dev pytest-asyncio` and `pytest.ini` `asyncio_mode = "auto"`. Check `backend/pyproject.toml` first.)

- [ ] **Step 2: Run — verify fail**

Run: `cd backend && uv run pytest tests/test_marker_watcher.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement module**

```python
# backend/app/core/marker_watcher.py
from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.core.marker_file import (
    MarkerFile, MarkerFileReadError, marker_path_for_cwd, read_marker,
)

logger = logging.getLogger(__name__)

DEFAULT_POLL_INTERVAL_SECONDS = 1.0

EventCallback = Callable[[str, dict[str, Any]], Awaitable[None]]


def _get_interval() -> float:
    try:
        return float(os.environ.get("PANOPTICA_MARKER_POLL_INTERVAL", str(DEFAULT_POLL_INTERVAL_SECONDS)))
    except ValueError:
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
    run_id: str | None = None
    announced: bool = False  # did we emit run_start?


class MarkerWatcher:
    def __init__(self, on_event: EventCallback) -> None:
        self._paths: dict[Path, _WatchedPath] = {}
        self._on_event = on_event
        self._task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()
        self._stopped = False

    def register(self, cwd: Path) -> None:
        cwd = Path(cwd).resolve()
        if cwd in self._paths:
            return
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
        path = marker_path_for_cwd(state.cwd)
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
        state.run_id = marker.run_id

        payload = {
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
```

- [ ] **Step 4: Run — verify pass**

Run: `cd backend && uv run pytest tests/test_marker_watcher.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/marker_watcher.py backend/tests/test_marker_watcher.py
git commit -m "feat(runs): marker-file watcher emits synthetic run_* events"
```

---

## Task 9: PLAN.md watcher

Polls `{workdocs_dir}/PLAN.md` for every active run; updates `Run.plan_tasks` via a callback when content changes.

**Files:**
- Create: `backend/app/core/plan_watcher.py`
- Test:   `backend/tests/test_plan_watcher.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_plan_watcher.py
import asyncio
from pathlib import Path

import pytest

from app.core.plan_watcher import PlanWatcher
from app.models.runs import PlanTaskStatus


@pytest.mark.asyncio
async def test_plan_watcher_fires_on_change(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("PANOPTICA_PLAN_POLL_INTERVAL", "0.05")
    plan = tmp_path / "PLAN.md"
    plan.write_text("- [ ] plan-task-1: first\n")

    updates: list[tuple[str, list]] = []

    async def cb(run_id: str, tasks) -> None:
        updates.append((run_id, list(tasks)))

    w = PlanWatcher(on_update=cb)
    w.register("ral-1", plan)
    await w.start()
    await asyncio.sleep(0.15)
    assert updates, "expected first update"
    assert updates[0][0] == "ral-1"
    assert updates[0][1][0].status == PlanTaskStatus.TODO

    plan.write_text("- [x] plan-task-1: first\n")
    await asyncio.sleep(0.2)
    await w.stop()

    statuses = [u[1][0].status for u in updates]
    assert PlanTaskStatus.DONE in statuses


@pytest.mark.asyncio
async def test_plan_watcher_no_file_is_noop(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("PANOPTICA_PLAN_POLL_INTERVAL", "0.05")
    updates: list = []

    async def cb(run_id: str, tasks) -> None:
        updates.append((run_id, tasks))

    w = PlanWatcher(on_update=cb)
    w.register("ral-1", tmp_path / "PLAN.md")
    await w.start()
    await asyncio.sleep(0.15)
    await w.stop()
    assert updates == []
```

- [ ] **Step 2: Run — verify fail**

Run: `cd backend && uv run pytest tests/test_plan_watcher.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement module**

```python
# backend/app/core/plan_watcher.py
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

PlanCallback = Callable[[str, list[PlanTask]], Awaitable[None]]


def _get_interval() -> float:
    try:
        return float(os.environ.get("PANOPTICA_PLAN_POLL_INTERVAL", str(DEFAULT_POLL_INTERVAL_SECONDS)))
    except ValueError:
        return DEFAULT_POLL_INTERVAL_SECONDS


@dataclass
class _PlanState:
    run_id: str
    path: Path
    last_hash: str = ""


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
            return
        try:
            content = state.path.read_text()
        except OSError as e:
            logger.debug("plan read failed for %s: %s", state.path, e)
            return
        h = hashlib.sha256(content.encode()).hexdigest()
        if h == state.last_hash:
            return
        state.last_hash = h
        tasks = parse_plan_md(content)
        try:
            await self._cb(state.run_id, tasks)
        except Exception:
            logger.exception("plan_watcher callback error for %s", state.run_id)
```

- [ ] **Step 4: Run — verify pass**

Run: `cd backend && uv run pytest tests/test_plan_watcher.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/plan_watcher.py backend/tests/test_plan_watcher.py
git commit -m "feat(runs): PLAN.md watcher publishes parsed tasks per run"
```

---

## Task 10: Wire tagger + aggregator into session_start / session_end

**Files:**
- Modify: `backend/app/core/handlers/session_handler.py`
- Modify: `backend/app/core/event_processor.py` (only the single line that wires the aggregator singleton — see below)
- Test:   `backend/tests/test_session_handler_ralph.py`

The handler already has the pattern of taking callbacks injected by the `EventProcessor`. Keep that pattern — do not import the aggregator at module scope.

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_session_handler_ralph.py
import json
from datetime import datetime, UTC
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.handlers.session_handler import handle_session_start
from app.core.run_aggregator import RunAggregator
from app.models.events import Event, EventData, EventType
from app.models.runs import Role


def _marker_at(cwd: Path) -> None:
    wd = cwd / "workdocs"
    wd.mkdir(exist_ok=True)
    (wd / ".panoptica-run.json").write_text(json.dumps({
        "run_id": "ral-1",
        "orchestrator_session_id": None,
        "primary_repo": str(cwd),
        "workdocs_dir": str(wd),
        "started_at": "2026-04-18T14:32:07Z",
        "ended_at": None,
        "phase": "A",
        "model_config": {"coder": "claude-sonnet-4-6"},
    }))


@pytest.mark.asyncio
async def test_handle_session_start_tags_session_from_env_and_marker(tmp_path, monkeypatch):
    _marker_at(tmp_path)
    agg = RunAggregator()
    sm = SimpleNamespace(session=SimpleNamespace(id="s1", run_id=None, role=None, task_id=None))

    event = Event(
        event_type=EventType.SESSION_START,
        session_id="s1",
        timestamp=datetime.now(UTC),
        data=EventData(
            project_dir=str(tmp_path),
            # Simulate env being forwarded on SESSION_START payload (see hook plan Task 12).
            run_id="ral-1",
            ralph_role="coder",
            ralph_task_id="plan-task-5",
        ),
    )

    await handle_session_start(
        sm=sm,
        event=event,
        ensure_task_file_poller_fn=lambda: None,
        run_aggregator=agg,
    )

    assert sm.session.run_id == "ral-1"
    assert sm.session.role == Role.CODER
    assert sm.session.task_id == "plan-task-5"
    assert "s1" in agg.get("ral-1").member_session_ids
```

The existing `handle_session_start` does not accept a `run_aggregator` kwarg — that's what drives the failure.

- [ ] **Step 2: Run — verify fail**

Run: `cd backend && uv run pytest tests/test_session_handler_ralph.py -v`
Expected: FAIL.

- [ ] **Step 3: Edit `session_handler.py`**

Add the new kwarg and tagging logic. New signature for `handle_session_start`:

```python
from pathlib import Path

from app.core.marker_file import read_marker, marker_path_for_cwd
from app.core.run_aggregator import RunAggregator
from app.core.session_tagger import classify_session
from app.models.runs import Role


async def handle_session_start(
    sm: StateMachine,
    event: Event,
    ensure_task_file_poller_fn: EnsurePollFn,
    run_aggregator: RunAggregator | None = None,
) -> None:
    ensure_task_file_poller_fn()
    task_poller = get_task_file_poller()
    if task_poller:
        task_list_id = event.data.task_list_id if event.data else None
        await task_poller.start_polling(event.session_id, task_list_id=task_list_id)

    if run_aggregator is not None and event.data is not None:
        await _tag_and_register_run_member(sm, event, run_aggregator)

    await broadcast_state(event.session_id, sm)


async def _tag_and_register_run_member(
    sm: StateMachine,
    event: Event,
    aggregator: RunAggregator,
) -> None:
    data = event.data
    cwd = Path(data.project_dir or data.working_dir or ".").resolve()

    env = {}
    if data.run_id:
        env["RALPH_RUN_ID"] = data.run_id
    if data.ralph_role:
        env["RALPH_ROLE"] = data.ralph_role
    if data.ralph_task_id:
        env["RALPH_TASK_ID"] = data.ralph_task_id

    try:
        marker = read_marker(marker_path_for_cwd(cwd))
    except Exception as e:  # MarkerFileReadError or OSError
        logger.debug("session_start marker read failed for %s: %s", cwd, e)
        marker = None

    tag = classify_session(session_id=event.session_id, cwd=cwd, env=env, marker=marker)
    if tag is None:
        return

    # Apply tag to session object. Attribute access matches existing state machine style.
    session = getattr(sm, "session", None)
    if session is not None:
        session.run_id = tag.run_id
        session.role = tag.role
        session.task_id = tag.task_id

    if aggregator.get(tag.run_id) is None and marker is not None:
        aggregator.upsert_from_marker(marker)

    aggregator.add_member(
        tag.run_id,
        session_id=event.session_id,
        role=tag.role,
        task_id=tag.task_id,
        is_orchestrator=tag.is_orchestrator,
    )
```

Update `handle_session_end` similarly:

```python
async def handle_session_end(
    sm: StateMachine,
    event: Event,
    run_aggregator: RunAggregator | None = None,
) -> None:
    task_poller = get_task_file_poller()
    if task_poller:
        await task_poller.stop_polling(event.session_id)

    if run_aggregator is not None:
        session = getattr(sm, "session", None)
        run_id = getattr(session, "run_id", None)
        if run_id:
            run_aggregator.remove_member(run_id, session_id=event.session_id)
        run_aggregator.end_if_orchestrator_stopped(event.session_id)

    await broadcast_state(event.session_id, sm)
```

- [ ] **Step 4: Wire aggregator singleton in EventProcessor**

In `backend/app/core/event_processor.py`, instantiate one `RunAggregator` alongside the existing pollers and pass it to the handlers. This is a single construct-and-pass edit — no logic. Open the file, find where `handle_session_start` is awaited, and pass `run_aggregator=self._run_aggregator`. Initialize `self._run_aggregator = RunAggregator()` in `__init__`. Expose via a `get_run_aggregator()` getter symmetric to `get_beads_poller()` for the watchers to import.

- [ ] **Step 5: Run — verify pass**

Run: `cd backend && uv run pytest tests/test_session_handler_ralph.py -v && uv run pytest tests/ -q`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/handlers/session_handler.py backend/app/core/event_processor.py backend/tests/test_session_handler_ralph.py
git commit -m "feat(handlers): tag session_start with Ralph run + register member"
```

---

## Task 11: Wire marker-watcher + plan-watcher into app lifecycle

**Files:**
- Modify: `backend/app/core/event_processor.py` (or wherever the FastAPI startup wires pollers — same place `init_beads_poller` is called)

- [ ] **Step 1: Locate the startup wiring**

Run: `grep -rn "init_beads_poller\|start_polling" backend/app --include='*.py'`

Identify the lifespan function / processor init that owns poller lifecycle.

- [ ] **Step 2: Add the two watchers there**

```python
from app.core.marker_watcher import MarkerWatcher
from app.core.plan_watcher import PlanWatcher
from app.core.run_aggregator import RunAggregator

# on startup:
run_aggregator = RunAggregator()

async def on_marker_event(event_type: str, payload: dict) -> None:
    # Synthesize Event, feed through the normal event bus so state_machine +
    # websocket broadcast both see it. Reuse the existing `process_event` entrypoint.
    ev = Event(
        event_type=EventType(event_type),
        session_id=payload.get("orchestrator_session_id") or f"_run:{payload['run_id']}",
        data=EventData(
            run_id=payload["run_id"],
            orchestrator_session_id=payload.get("orchestrator_session_id"),
            primary_repo=payload.get("primary_repo"),
            workdocs_dir=payload.get("workdocs_dir"),
            to_phase=payload.get("phase"),
            from_phase=payload.get("from_phase"),
            model_config_dict=payload.get("model_config"),
        ),
    )
    await event_processor.process_event(ev)

async def on_plan_update(run_id: str, tasks: list[PlanTask]) -> None:
    run = run_aggregator.get(run_id)
    if run is not None:
        run.plan_tasks = list(tasks)
    await broadcast_run_state(run_id)

marker_watcher = MarkerWatcher(on_event=on_marker_event)
plan_watcher = PlanWatcher(on_update=on_plan_update)
await marker_watcher.start()
await plan_watcher.start()
```

(If there is no single `broadcast_run_state` yet, add a thin helper in `broadcast_service.py` that broadcasts `{"type": "run_state", "run": run.model_dump(by_alias=True)}` on the WebSocket channel. Frontend work in Plan 2 will subscribe; for now Plan 1 just needs the message to leave the backend.)

- [ ] **Step 3: Register runs with plan_watcher when marker watcher creates them**

In `on_marker_event`, after `run_aggregator.upsert_from_marker(...)`, also call:

```python
plan_watcher.register(run_id, Path(payload["workdocs_dir"]) / "PLAN.md")
```

And on `run_end` → `plan_watcher.unregister(run_id)`.

- [ ] **Step 4: Register cwd with marker_watcher on every session_start**

In `handle_session_start`, if we read a marker successfully, call the singleton marker_watcher's `register(cwd)`. Expose marker_watcher through a module-level getter like `get_marker_watcher()` symmetric to `get_beads_poller()`.

- [ ] **Step 5: Run checkall**

Run: `cd backend && uv run pytest tests/ -q && make checkall`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/event_processor.py backend/app/core/handlers/session_handler.py backend/app/core/broadcast_service.py
git commit -m "feat(runs): wire marker + plan watchers into app lifecycle"
```

---

## Task 12: Hooks forward RALPH_* env on session_start

**Files:**
- Modify: `hooks/src/claude_office_hooks/*.py` — find where SESSION_START payload is built
- Test:   add a unit test if a hook test file exists; otherwise a small one in `hooks/tests/`

Current hooks emit `project_dir` and `working_dir` but do not forward arbitrary env. We need the three Ralph env vars on the SESSION_START payload so the backend tagger can read them without shelling out to `/proc`.

- [ ] **Step 1: Locate the SESSION_START builder**

Run: `grep -rn "session_start\|SESSION_START" hooks/src`

Find the dict/payload that gets POSTed.

- [ ] **Step 2: Add env pass-through**

In the payload construction:

```python
import os

for key in ("RALPH_RUN_ID", "RALPH_ROLE", "RALPH_TASK_ID", "RALPH_PRIMARY_REPO"):
    value = os.environ.get(key)
    if value:
        data_key = {
            "RALPH_RUN_ID": "run_id",
            "RALPH_ROLE": "ralph_role",
            "RALPH_TASK_ID": "ralph_task_id",
            "RALPH_PRIMARY_REPO": "primary_repo",
        }[key]
        payload["data"][data_key] = value
```

- [ ] **Step 3: Run hooks tests**

Run: `cd hooks && uv run pytest -q`
Expected: green (or add a small test that sets the env vars and asserts they appear in payload).

- [ ] **Step 4: Commit**

```bash
git add hooks/
git commit -m "feat(hooks): forward RALPH_* env on SESSION_START for run tagging"
```

---

## Task 13: Integration smoke test

End-to-end through the backend pipeline with stubbed inputs — no real Claude, no real Ralph. Replays a canned event sequence that matches Success Criterion #1–#4 of the spec.

**Files:**
- Create: `backend/tests/test_ralph_pipeline_smoke.py`

- [ ] **Step 1: Write the test**

```python
# backend/tests/test_ralph_pipeline_smoke.py
import asyncio
import json
from datetime import datetime, UTC
from pathlib import Path

import pytest

from app.core.marker_watcher import MarkerWatcher
from app.core.plan_watcher import PlanWatcher
from app.core.run_aggregator import RunAggregator
from app.core.session_tagger import classify_session
from app.core.marker_file import read_marker, marker_path_for_cwd
from app.models.runs import Role, PlanTaskStatus, RunPhase


def _write_marker(cwd: Path, phase: str = "A", ended_at: str | None = None) -> None:
    wd = cwd / "workdocs"
    wd.mkdir(exist_ok=True)
    (wd / ".panoptica-run.json").write_text(json.dumps({
        "run_id": "ral-smoke",
        "orchestrator_session_id": "orc-1",
        "primary_repo": str(cwd),
        "workdocs_dir": str(wd),
        "started_at": "2026-04-18T14:32:07Z",
        "ended_at": ended_at,
        "phase": phase,
        "model_config": {"coder": "claude-sonnet-4-6", "designer": "claude-opus-4-7"},
    }))


def _write_plan(cwd: Path, *lines: str) -> None:
    (cwd / "workdocs" / "PLAN.md").write_text("\n".join(lines) + "\n")


@pytest.mark.asyncio
async def test_ralph_smoke_end_to_end(tmp_path, monkeypatch):
    monkeypatch.setenv("PANOPTICA_MARKER_POLL_INTERVAL", "0.05")
    monkeypatch.setenv("PANOPTICA_PLAN_POLL_INTERVAL", "0.05")

    agg = RunAggregator()
    received_events: list[tuple[str, dict]] = []

    async def on_marker_event(etype: str, payload: dict) -> None:
        received_events.append((etype, payload))
        if etype == "run_start":
            # Simulate lifecycle wiring: aggregator + plan_watcher.register
            marker = read_marker(marker_path_for_cwd(Path(payload["primary_repo"])))
            assert marker is not None
            agg.upsert_from_marker(marker)
            plan_watcher.register("ral-smoke", Path(payload["workdocs_dir"]) / "PLAN.md")
        elif etype == "run_phase_change":
            marker = read_marker(marker_path_for_cwd(Path(payload["primary_repo"])))
            assert marker is not None
            agg.upsert_from_marker(marker)

    async def on_plan_update(run_id: str, tasks):
        run = agg.get(run_id)
        if run is not None:
            run.plan_tasks = list(tasks)

    marker_watcher = MarkerWatcher(on_event=on_marker_event)
    plan_watcher = PlanWatcher(on_update=on_plan_update)

    # Step 1: Orchestrator writes marker + PLAN.md
    _write_marker(tmp_path, phase="A")
    _write_plan(tmp_path, "- [ ] plan-task-1: scaffold", "- [ ] plan-task-2: tests")

    marker_watcher.register(tmp_path)
    await marker_watcher.start()
    await plan_watcher.start()
    await asyncio.sleep(0.2)

    run = agg.get("ral-smoke")
    assert run is not None, "run_start should have populated aggregator"
    assert run.phase == RunPhase.A

    # Step 2: Orchestrator session joins (marker-only → orchestrator)
    tag = classify_session(
        session_id="orc-1",
        cwd=tmp_path,
        env={},
        marker=read_marker(marker_path_for_cwd(tmp_path)),
    )
    assert tag is not None and tag.is_orchestrator
    agg.add_member("ral-smoke", session_id="orc-1", role=None, task_id=None, is_orchestrator=True)

    # Step 3: Phase A designer session joins (env + marker)
    tag = classify_session(
        session_id="designer-1",
        cwd=tmp_path,
        env={"RALPH_RUN_ID": "ral-smoke", "RALPH_ROLE": "designer"},
        marker=read_marker(marker_path_for_cwd(tmp_path)),
    )
    assert tag is not None and tag.role == Role.DESIGNER
    agg.add_member("ral-smoke", session_id="designer-1", role=Role.DESIGNER, task_id=None, is_orchestrator=False)

    # Step 4: Phase transitions A → B
    _write_marker(tmp_path, phase="B")
    await asyncio.sleep(0.15)
    assert agg.get("ral-smoke").phase == RunPhase.B
    assert any(t == "run_phase_change" for t, _ in received_events)

    # Step 5: PLAN.md progresses
    _write_plan(tmp_path, "- [x] plan-task-1: scaffold", "- [~] plan-task-2: tests")
    await asyncio.sleep(0.15)
    plan_tasks = agg.get("ral-smoke").plan_tasks
    assert {t.id: t.status for t in plan_tasks} == {
        "plan-task-1": PlanTaskStatus.DONE,
        "plan-task-2": PlanTaskStatus.IN_PROGRESS,
    }

    # Step 6: Ad-hoc session elsewhere is NOT tagged
    ad_hoc_dir = tmp_path.parent / "other"
    ad_hoc_dir.mkdir()
    ad_hoc_tag = classify_session(session_id="ad-1", cwd=ad_hoc_dir, env={}, marker=None)
    assert ad_hoc_tag is None

    # Step 7: Run ends
    _write_marker(tmp_path, phase="B", ended_at="2026-04-18T16:00:00Z")
    await asyncio.sleep(0.15)
    # Orchestrator stop triggers end — idempotent with marker end
    diff = agg.end_if_orchestrator_stopped("orc-1")
    # Either marker-end or orchestrator-stop ended it first; both paths mark outcome
    run = agg.get("ral-smoke")
    assert run.ended_at is not None
    assert any(t == "run_end" for t, _ in received_events)

    await marker_watcher.stop()
    await plan_watcher.stop()
```

- [ ] **Step 2: Run — verify pass**

Run: `cd backend && uv run pytest tests/test_ralph_pipeline_smoke.py -v`
Expected: PASS.

- [ ] **Step 3: Run full suite + checkall**

Run: `cd backend && uv run pytest tests/ -q && cd .. && make checkall`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_ralph_pipeline_smoke.py
git commit -m "test(runs): end-to-end smoke for Ralph run pipeline"
```

---

## Self-review notes

- **Spec coverage:** Each spec item has a task — env+marker tagging (T6/T10), Run aggregation (T7), synthetic events (T3/T8), PLAN.md parsing (T5/T9), Session extension (T2), telemetry seam (T1 token_usage/cost_usd reserved), hooks env forwarding (T12), smoke (T13). Non-goals (replay, token rendering, multi-repo viz) are explicitly not in any task.
- **Type consistency:** `model_config_` (attribute) ↔ `modelConfig` (alias) is the one rename a future reader must track. Called out in T1 step 3. `RunPhase.DONE` exists but isn't set in MVP — that's intentional (ended runs use `outcome`, not phase=done).
- **Known shortcut:** T11 describes wiring into `event_processor.py` in prose instead of with a concrete diff. The file is 34KB and the exact wiring point depends on existing structure. The subagent/executor should read that file first and commit minimal edits; the shape is: one aggregator singleton, two watcher singletons, handlers take them as kwargs. If this task balloons, split it — do aggregator wiring before watcher wiring.
- **Out of this plan:** Frontend (Plan 2). Ralph-side marker/env instrumentation in `tesseron-plugin-marketplace/plugins/ralph` (Plan 3 — small, ~2 file edits).

---

## Execution choice

Plan complete and saved to `docs/superpowers/plans/2026-04-18-ralph-panoptica-backend.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Which approach?
