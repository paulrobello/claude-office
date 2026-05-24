"""Rotas read-only do DB de coordenação (:5433): /tasks, /agent-runs, /dashboard.

Isolado em coordination.* para não colidir com o conceito interno "task" do office.
Degrade gracioso: qualquer falha de conexão vira HTTP 503 com payload claro.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.coordination import get_coordination_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/coordination", tags=["coordination"])

_DOWN_DETAIL = {
    "error": "coordination_db_unavailable",
    "message": "DB de coordenação (:5433) indisponível.",
}


def _row_dicts(result: Any) -> list[dict[str, Any]]:
    return [dict(m) for m in result.mappings().all()]


# ── /tasks ───────────────────────────────────────────────────────────────────
# issues + claim ativo (active_work) + último run (agent_runs).
_TASKS_SQL = text("""
WITH last_run AS (
    SELECT DISTINCT ON (source_ref)
           source_ref, status AS run_status, started_at AS run_started_at,
           ended_at AS run_ended_at, agent AS run_agent
    FROM agent_runs
    WHERE source_ref IS NOT NULL
    ORDER BY source_ref, started_at DESC
)
SELECT i.number, i.title, i.state, i.labels, i.project, i.url,
       i.source_ref, i.source_updated_at,
       aw.status  AS claim_status,
       aw.agent   AS claim_agent,
       aw.mechanism AS claim_mechanism,
       aw.claimed_at,
       lr.run_status, lr.run_started_at, lr.run_ended_at, lr.run_agent
FROM issues i
LEFT JOIN active_work aw ON aw.source_ref = i.source_ref
LEFT JOIN last_run   lr ON lr.source_ref = i.source_ref
WHERE (CAST(:state AS text)   IS NULL OR i.state   = CAST(:state AS text))
  AND (CAST(:project AS text) IS NULL OR i.project = CAST(:project AS text))
  AND (CAST(:label AS text)   IS NULL OR CAST(:label AS text) = ANY(i.labels))
ORDER BY (aw.status IS NOT NULL) DESC, i.source_updated_at DESC NULLS LAST,
         i.number DESC
LIMIT :limit OFFSET :offset
""")


@router.get("/tasks")
async def list_tasks(
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
    state: str | None = Query(None, pattern="^(OPEN|CLOSED)$"),
    project: str | None = None,
    label: str | None = None,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    try:
        result = await db.execute(
            _TASKS_SQL,
            {
                "state": state,
                "project": project,
                "label": label,
                "limit": limit,
                "offset": offset,
            },
        )
        return {"tasks": _row_dicts(result)}
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination /tasks unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


# ── /agent-runs ───────────────────────────────────────────────────────────────
_RUNS_SQL = text("""
SELECT r.id, r.source_ref, r.project, r.agent, r.session_id, r.mechanism,
       r.status, r.started_at, r.ended_at, r.exit_code, r.error_text, r.log_path,
       EXTRACT(EPOCH FROM (COALESCE(r.ended_at, now()) - r.started_at)) AS duration_seconds,
       i.url AS issue_url, i.title AS issue_title
FROM agent_runs r
LEFT JOIN issues i ON i.source_ref = r.source_ref
WHERE (CAST(:status AS text)    IS NULL OR r.status    = CAST(:status AS text))
  AND (CAST(:project AS text)   IS NULL OR r.project   = CAST(:project AS text))
  AND (CAST(:mechanism AS text) IS NULL OR r.mechanism = CAST(:mechanism AS text))
  AND (CAST(:since AS timestamptz) IS NULL OR r.started_at >= CAST(:since AS timestamptz))
  AND (CAST(:until AS timestamptz) IS NULL OR r.started_at <  CAST(:until AS timestamptz))
ORDER BY r.started_at DESC
LIMIT :limit OFFSET :offset
""")


@router.get("/agent-runs")
async def list_agent_runs(
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
    status: str | None = Query(None, pattern="^(running|success|error|timeout)$"),
    project: str | None = None,
    mechanism: str | None = Query(None, pattern="^(cron|interativo)$"),
    since: str | None = None,
    until: str | None = None,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    try:
        result = await db.execute(
            _RUNS_SQL,
            {
                "status": status,
                "project": project,
                "mechanism": mechanism,
                "since": since,
                "until": until,
                "limit": limit,
                "offset": offset,
            },
        )
        return {"runs": _row_dicts(result)}
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination /agent-runs unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


# ── /dashboard ────────────────────────────────────────────────────────────────
_DASH_ISSUES_SQL = text("""
SELECT
  COUNT(*) FILTER (WHERE state = 'OPEN')   AS issues_open,
  COUNT(*) FILTER (WHERE state = 'CLOSED') AS issues_closed,
  COUNT(*)                                 AS issues_total
FROM issues
""")

_DASH_CLAIMS_SQL = text("SELECT COUNT(*) AS active_claims FROM active_work")

_DASH_RUNS_SQL = text("SELECT status, COUNT(*) AS n FROM agent_runs GROUP BY status")

# Fechadas por período. Usa closed_at (F5); fallback p/ source_updated_at enquanto
# a coluna não popula. date_trunc no timezone passado (default UTC).
_DASH_CLOSED_BY_PERIOD_SQL = text("""
SELECT date_trunc(:bucket, COALESCE(closed_at, source_updated_at) AT TIME ZONE :tz) AS period,
       COUNT(*) AS n
FROM issues
WHERE state = 'CLOSED'
  AND COALESCE(closed_at, source_updated_at) IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC
LIMIT :buckets
""")

_DASH_OPEN_BY_PROJECT_SQL = text("""
SELECT COALESCE(project, '(sem projeto)') AS project, COUNT(*) AS n
FROM issues
WHERE state = 'OPEN'
GROUP BY 1
ORDER BY n DESC
""")

_DASH_HEALTH_SQL = text("SELECT component, status, last_run, min_ago, error_text FROM health")


@router.get("/dashboard")
async def dashboard(
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
    period: str = Query("day", pattern="^(day|week|month)$"),
    tz: str = "UTC",
    buckets: int = Query(12, ge=1, le=60),
) -> dict[str, Any]:
    try:
        issues = (await db.execute(_DASH_ISSUES_SQL)).mappings().one()
        claims = (await db.execute(_DASH_CLAIMS_SQL)).mappings().one()
        runs_rows = _row_dicts(await db.execute(_DASH_RUNS_SQL))
        closed = _row_dicts(
            await db.execute(
                _DASH_CLOSED_BY_PERIOD_SQL,
                {"bucket": period, "tz": tz, "buckets": buckets},
            )
        )
        open_by_project = _row_dicts(await db.execute(_DASH_OPEN_BY_PROJECT_SQL))
        health = _row_dicts(await db.execute(_DASH_HEALTH_SQL))

        runs_by_status = {r["status"]: r["n"] for r in runs_rows}
        return {
            "github": {
                "open": issues["issues_open"],
                "closed": issues["issues_closed"],
                "total": issues["issues_total"],
            },
            "database": {
                "activeClaims": claims["active_claims"],
                "runsByStatus": runs_by_status,
            },
            "closedByPeriod": {"period": period, "tz": tz, "buckets": closed},
            "openByProject": open_by_project,
            "health": health,
        }
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination /dashboard unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


# ── /hitl ─────────────────────────────────────────────────────────────────────
# Prompts HITL (human-in-the-loop) pendentes + join issues (title/url) p/ contexto.
_HITL_LIST_SQL = text("""
SELECT h.id, h.source_ref, h.session_id, h.agent, h.project,
       h.question, h.context, h.kind, h.options, h.status, h.answer,
       h.created_at, h.expires_at,
       i.title AS issue_title, i.url AS issue_url
FROM hitl_prompts h
LEFT JOIN issues i ON i.source_ref = h.source_ref
WHERE (CAST(:status AS text) IS NULL OR h.status = CAST(:status AS text))
ORDER BY h.created_at DESC
LIMIT :limit OFFSET :offset
""")


@router.get("/hitl")
async def list_hitl(
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
    status: str | None = Query("pending", pattern="^(pending|answered|expired)$"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    try:
        result = await db.execute(
            _HITL_LIST_SQL,
            {"status": status, "limit": limit, "offset": offset},
        )
        return {"prompts": _row_dicts(result)}
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination /hitl unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


class HitlAnswerBody(BaseModel):
    answer: bool | str | list[str]
    answered_by: str = "web"


# UPDATE pontual e escopado: a engine de coordenação é read-only POR CONVENÇÃO
# (nenhuma outra rota emite DML); este é o ÚNICO write, restrito a hitl_prompts e
# idempotente pelo WHERE status='pending'. Não relaxa o read-only do resto.
_HITL_FETCH_SQL = text("SELECT kind, options, status FROM hitl_prompts WHERE id = :id")
_HITL_ANSWER_SQL = text("""
UPDATE hitl_prompts
   SET status='answered', answer = CAST(:answer AS jsonb),
       answered_at = now(), answered_by = :answered_by
 WHERE id = :id AND status = 'pending'
 RETURNING id
""")


def _validate_answer(
    kind: str, options: Any, answer: bool | str | list[str]
) -> str | None:
    """Retorna mensagem de erro se a resposta não casa com o kind/options; None se ok."""
    opt_list = cast("list[dict[str, str]]", options) if isinstance(options, list) else []
    keys = {o["key"] for o in opt_list}
    if kind == "yesno":
        ok = isinstance(answer, bool)
    elif kind == "text":
        ok = isinstance(answer, str)
    elif kind == "choice":
        ok = isinstance(answer, str) and answer in keys
    elif kind == "multi":
        ok = isinstance(answer, list) and len(answer) > 0 and set(answer) <= keys
    else:
        ok = True
    return None if ok else f"resposta inválida para kind={kind}"


@router.post("/hitl/{prompt_id}/answer")
async def answer_hitl(
    prompt_id: int,
    body: HitlAnswerBody,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    try:
        row = (await db.execute(_HITL_FETCH_SQL, {"id": prompt_id})).mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": "hitl_not_found"})
        if row["status"] != "pending":
            raise HTTPException(
                status_code=409,
                detail={"error": "hitl_already_resolved", "status": row["status"]},
            )
        err = _validate_answer(row["kind"], row["options"], body.answer)
        if err:
            raise HTTPException(
                status_code=422, detail={"error": "invalid_answer", "message": err}
            )

        result = await db.execute(
            _HITL_ANSWER_SQL,
            {
                "id": prompt_id,
                "answer": json.dumps(body.answer),
                "answered_by": body.answered_by,
            },
        )
        updated = result.first()
        await db.commit()
        if updated is None:  # corrida entre fetch e update
            raise HTTPException(status_code=409, detail={"error": "hitl_already_resolved"})
        return {"id": prompt_id, "status": "answered"}
    except HTTPException:
        raise
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination /hitl answer unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc
