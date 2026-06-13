"""Rotas read-only do DB de coordenação (:5433): /tasks, /agent-runs, /dashboard.

Isolado em coordination.* para não colidir com o conceito interno "task" do office.
Degrade gracioso: qualquer falha de conexão vira HTTP 503 com payload claro.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from collections import deque
from datetime import datetime, timedelta
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Text, bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.coordination import get_coordination_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/coordination", tags=["coordination"])

_DOWN_DETAIL = {
    "error": "coordination_db_unavailable",
    "message": "DB de coordenação (:5433) indisponível.",
}

# ── #413: rate-limit nos writes de coordenação ─────────────────────────────────
# Sliding-window in-memory (mesmo modelo do events.py), adequado ao deploy
# single-process localhost. Protege os POSTs (requests/agents/tasks/hitl-answer)
# contra rajada acidental (loop de UI, retry agressivo). Configurável via env.
_WRITE_RATE_LIMIT = int(os.environ.get("COORDINATION_WRITE_RATE_LIMIT", "60"))
_WRITE_WINDOW = 60.0  # segundos
_write_times: deque[float] = deque()


def reset_write_rate_limiter() -> None:
    """Limpa o estado do limiter (uso entre testes)."""
    _write_times.clear()


def enforce_write_rate_limit() -> None:
    """Dependency: levanta HTTP 429 se a taxa de writes exceder o limite."""
    now = time.monotonic()
    cutoff = now - _WRITE_WINDOW
    while _write_times and _write_times[0] < cutoff:
        _write_times.popleft()
    if len(_write_times) >= _WRITE_RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail={"error": "rate_limited", "message": "Muitos writes; tente em instantes."},
        )
    _write_times.append(now)


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
       ca.model   AS claim_model,
       lr.run_status, lr.run_started_at, lr.run_ended_at, lr.run_agent,
       ra.model   AS run_model
FROM issues i
LEFT JOIN active_work aw ON aw.source_ref = i.source_ref
LEFT JOIN last_run   lr ON lr.source_ref = i.source_ref
LEFT JOIN agents     ca ON ca.nome = aw.agent
LEFT JOIN agents     ra ON ra.nome = lr.run_agent
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


# ── POST /tasks (task-write, #383) ─────────────────────────────────────────────
# Cria issue REAL no agents-ia via `gh` (fonte de verdade); o coletor-task
# sincroniza de volta pro :5433. NÃO escreve o read-model direto (§4 SPEC #368).
# Cockpit é localhost-only (middleware) → escrita ao GitHub fica contida.
_AGENTS_IA_REPO = "IsakielSouza/agents-ia"


def _ref_to_issue_number(source_ref: str) -> int | None:
    """'agents-ia#294' -> 294; formatos inesperados -> None."""
    if "#" not in source_ref:
        return None
    tail = source_ref.rsplit("#", 1)[1]
    return int(tail) if tail.isdigit() else None


class PriorityBody(BaseModel):
    rank: str  # "top" | "bottom"


# Skip/Retry do cockpit: aplica label de prioridade que o triador honra ao montar
# a queue.md (fila:topo = topo/Retry; fila:fim = fim/Skip). Sem requests (não
# consumida) nem work_claims (sem grant cockpit_rw); via gh, igual ao POST /tasks.
_PRIORITY_LABELS = {"top": "fila:topo", "bottom": "fila:fim"}


@router.post("/tasks/{source_ref}/priority", dependencies=[Depends(enforce_write_rate_limit)])
async def set_task_priority(source_ref: str, body: PriorityBody) -> dict[str, Any]:
    if body.rank not in _PRIORITY_LABELS:
        raise HTTPException(status_code=422, detail={"error": "rank inválido (top|bottom)"})
    num = _ref_to_issue_number(source_ref)
    if num is None:
        raise HTTPException(status_code=400, detail={"error": "source_ref sem número de issue"})
    add = _PRIORITY_LABELS[body.rank]
    remove = _PRIORITY_LABELS["bottom" if body.rank == "top" else "top"]
    proc = await asyncio.create_subprocess_exec(
        "gh",
        "issue",
        "edit",
        str(num),
        "--repo",
        _AGENTS_IA_REPO,
        "--add-label",
        add,
        "--remove-label",
        remove,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail={"error": "gh falhou", "stderr": err.decode()[:300]},
        )
    return {"source_ref": source_ref, "label": add}


# Aprovar uma pendência que é label `hitl` no GitHub (gate pré-dispatch, sem
# pergunta estruturada): libera pro agente trocando hitl→afk. O triador então
# briefa e o gerente despacha (vira "Aguardando agente"). SPEC §5.
@router.post("/tasks/{source_ref}/approve", dependencies=[Depends(enforce_write_rate_limit)])
async def approve_task(source_ref: str) -> dict[str, Any]:
    num = _ref_to_issue_number(source_ref)
    if num is None:
        raise HTTPException(status_code=400, detail={"error": "source_ref sem número de issue"})
    proc = await asyncio.create_subprocess_exec(
        "gh",
        "issue",
        "edit",
        str(num),
        "--repo",
        _AGENTS_IA_REPO,
        "--remove-label",
        "hitl",
        "--add-label",
        "afk",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail={"error": "gh falhou", "stderr": err.decode()[:300]},
        )
    return {"source_ref": source_ref, "action": "released", "labels": "hitl→afk"}


# Remover da fila: marca a issue com `parked` (o cockpit a exclui dos grupos vivos,
# como faz com CLOSED). NÃO basta tirar `afk` — uma issue com `area:*` continua na
# fila como `todo`/`open` (bug #33). `parked` tira de vez do cockpit; reversível
# (basta remover o label). O triador deve pular `parked` (follow-up, janela).
@router.post("/tasks/{source_ref}/remove", dependencies=[Depends(enforce_write_rate_limit)])
async def remove_from_queue(source_ref: str) -> dict[str, Any]:
    num = _ref_to_issue_number(source_ref)
    if num is None:
        raise HTTPException(status_code=400, detail={"error": "source_ref sem número de issue"})
    proc = await asyncio.create_subprocess_exec(
        "gh",
        "issue",
        "edit",
        str(num),
        "--repo",
        _AGENTS_IA_REPO,
        "--add-label",
        "parked",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail={"error": "gh falhou", "stderr": err.decode()[:300]},
        )
    return {"source_ref": source_ref, "action": "parked"}


# ── Notas do CEO pra uma task (migration 012, canal-agnóstico) ──────────────────
class NoteBody(BaseModel):
    note: str
    created_by: str = "web"


_NOTE_INSERT_SQL = text("""
INSERT INTO task_notes (source_ref, note, created_by)
VALUES (:ref, :note, :by)
RETURNING id, created_at
""")

_NOTES_BY_REF_SQL = text("""
SELECT id, note, created_by, created_at, consumed_at
FROM task_notes WHERE source_ref = :ref
ORDER BY created_at DESC
""")


@router.post("/tasks/{source_ref}/note", dependencies=[Depends(enforce_write_rate_limit)])
async def add_task_note(
    source_ref: str,
    body: NoteBody,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    text_note = body.note.strip()
    if not text_note:
        raise HTTPException(status_code=422, detail={"error": "nota vazia"})
    if _ref_to_issue_number(source_ref) is None:
        raise HTTPException(status_code=400, detail={"error": "source_ref sem número de issue"})
    try:
        row = (
            (
                await db.execute(
                    _NOTE_INSERT_SQL,
                    {"ref": source_ref, "note": text_note, "by": body.created_by},
                )
            )
            .mappings()
            .first()
        )
        await db.commit()
        if row is None:
            raise HTTPException(status_code=503, detail=_DOWN_DETAIL)
        return {"id": row["id"], "source_ref": source_ref, "created_at": row["created_at"]}
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination /note unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


@router.get("/tasks/{source_ref}/detail")
async def task_detail(
    source_ref: str,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    # Corpo da issue: fetch ao vivo via gh (não está no read-model). Best-effort.
    body_text, title, url = "", None, None
    num = _ref_to_issue_number(source_ref)
    if num is not None:
        proc = await asyncio.create_subprocess_exec(
            "gh",
            "issue",
            "view",
            str(num),
            "--repo",
            _AGENTS_IA_REPO,
            "--json",
            "body,title,url",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, _ = await proc.communicate()
        if proc.returncode == 0:
            try:
                d = json.loads(out)
                body_text, title, url = d.get("body") or "", d.get("title"), d.get("url")
            except json.JSONDecodeError:
                pass
    try:
        notes = _row_dicts(await db.execute(_NOTES_BY_REF_SQL, {"ref": source_ref}))
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination /detail unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc
    return {"source_ref": source_ref, "title": title, "url": url, "body": body_text, "notes": notes}


class CreateTaskBody(BaseModel):
    title: str
    body: str = ""
    agent: str | None = None  # vira prefixo "[agent]" no título (padrão do gerente)
    labels: list[str] = []


def _norm_title(s: str) -> str:
    """Normaliza p/ dedup: colapsa espaços + casefold."""
    return " ".join(s.split()).casefold()


def _find_duplicate(existing: list[dict[str, Any]], full_title: str) -> str | None:
    """URL de uma issue ABERTA com título normalizado idêntico, ou None. Dedup
    conservador (match exato normalizado) — não engole tasks distintas (#413)."""
    target = _norm_title(full_title)
    for it in existing:
        if _norm_title(str(it.get("title", ""))) == target:
            return str(it.get("url") or "") or None
    return None


async def _list_open_issues() -> list[dict[str, Any]]:
    """Issues abertas do agents-ia p/ dedup (best-effort: [] se gh falhar)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "gh",
            "issue",
            "list",
            "--repo",
            _AGENTS_IA_REPO,
            "--state",
            "open",
            "--limit",
            "1000",
            "--json",
            "title,url",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, _ = await proc.communicate()
        if proc.returncode != 0:
            return []
        return cast("list[dict[str, Any]]", json.loads(out.decode() or "[]"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []


@router.post("/tasks", dependencies=[Depends(enforce_write_rate_limit)])
async def create_task(body: CreateTaskBody) -> dict[str, Any]:
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail={"error": "title_required"})
    full_title = f"[{body.agent.strip()}] {title}" if body.agent else title
    # Dedup (#413): não recria issue aberta de título idêntico (memory
    # feedback_checar_backlog_antes_de_abrir_issue, agora no nível do cockpit).
    dup = _find_duplicate(await _list_open_issues(), full_title)
    if dup:
        return {"url": dup, "deduped": True}
    args = [
        "gh",
        "issue",
        "create",
        "--repo",
        _AGENTS_IA_REPO,
        "--title",
        full_title,
        "--body",
        body.body.strip() or "(criada pelo cockpit)",
    ]
    for lb in body.labels:
        if lb.strip():
            args += ["--label", lb.strip()]
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await proc.communicate()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=502, detail={"error": "gh_not_found"}) from exc
    if proc.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail={"error": "gh_failed", "message": err.decode()[:500]},
        )
    return {"url": out.decode().strip()}


# ── POST /tasks/{ref}/respond — responder HITL IN-SYSTEM (sem abrir o GitHub) ──
# Para issues com label `hitl` (sem prompt no DB hitl_prompts): o CEO responde no
# cockpit → posta a resposta como COMENTÁRIO + relabela hitl→afk. O dev-loop lê os
# comentários (--comments), então a resposta chega na implementação. Padroniza o
# fluxo de resposta dentro do sistema (decisão CEO 2026-06-12).
class RespondTaskBody(BaseModel):
    response: str
    relabel_afk: bool = True


async def _run_gh(args: list[str]) -> str:
    """Roda `gh <args>`; 502 se gh faltar ou falhar."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "gh",
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await proc.communicate()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=502, detail={"error": "gh_not_found"}) from exc
    if proc.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail={"error": "gh_failed", "message": err.decode()[:500]},
        )
    return out.decode().strip()


@router.post("/tasks/{source_ref}/respond")
async def respond_task(source_ref: str, body: RespondTaskBody) -> dict[str, Any]:
    n = _ref_to_issue_number(source_ref)
    if n is None:
        raise HTTPException(status_code=422, detail={"error": "bad_source_ref"})
    resp = body.response.strip()
    if not resp:
        raise HTTPException(status_code=422, detail={"error": "response_required"})
    await _run_gh(
        [
            "issue",
            "comment",
            str(n),
            "--repo",
            _AGENTS_IA_REPO,
            "--body",
            f"💬 **Resposta do CEO (cockpit):**\n\n{resp}",
        ]
    )
    if body.relabel_afk:
        # volta pro fluxo: hitl→afk (o dev-loop lê o comentário com a resposta)
        await _run_gh(
            [
                "issue",
                "edit",
                str(n),
                "--repo",
                _AGENTS_IA_REPO,
                "--remove-label",
                "hitl",
                "--add-label",
                "afk",
            ]
        )
    return {"ok": True, "issue": n, "relabeled_afk": body.relabel_afk}


# ── POST /requests (produtor da caixa, #407) ───────────────────────────────────
# `requests` é tabela INTERNA de coordenação (a "caixa"/telemetria de demanda) —
# NÃO vem do GitHub como as issues. Por isso o write é DIRETO no :5433 (diferente
# do POST /tasks, que cria issue via gh e deixa o coletor sincronizar de volta).
# Convocação do CEO no cockpit → from_kind=human/from_ref=ceo. Alimenta o detector
# de gargalo (role_load/agent_demand), hoje cego por falta de produtor. (EPIC #395)
_REQUEST_KINDS = ("work", "question", "meeting")


class CreateRequestBody(BaseModel):
    from_kind: str = "human"
    from_ref: str | None = "ceo"
    to_role: str | None = None
    to_agent: str | None = None
    kind: str = "work"
    payload: dict[str, Any] | None = None


_INSERT_REQUEST_SQL = text("""
INSERT INTO requests (from_kind, from_ref, to_role, to_agent, kind, payload, status)
VALUES (:from_kind, :from_ref, :to_role, :to_agent, :kind, CAST(:payload AS jsonb), 'queued')
RETURNING id, from_kind, from_ref, to_role, to_agent, kind, payload, status, queued_at
""")


@router.post("/requests", status_code=201, dependencies=[Depends(enforce_write_rate_limit)])
async def create_request(
    body: CreateRequestBody,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    if body.from_kind not in ("human", "agent"):
        raise HTTPException(status_code=422, detail={"error": "invalid_from_kind"})
    if body.kind not in _REQUEST_KINDS:
        raise HTTPException(
            status_code=422,
            detail={"error": "invalid_kind", "allowed": list(_REQUEST_KINDS)},
        )
    to_role = (body.to_role or "").strip() or None
    to_agent = (body.to_agent or "").strip() or None
    if to_role is None and to_agent is None:
        raise HTTPException(
            status_code=422,
            detail={"error": "target_required", "message": "informe to_role ou to_agent"},
        )
    try:
        result = await db.execute(
            _INSERT_REQUEST_SQL,
            {
                "from_kind": body.from_kind,
                "from_ref": (body.from_ref or "").strip() or None,
                "to_role": to_role,
                "to_agent": to_agent,
                "kind": body.kind,
                "payload": json.dumps(body.payload) if body.payload is not None else None,
            },
        )
        row = result.mappings().one()
        await db.commit()
        return {"request": dict(row)}
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination POST /requests unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


# ── POST /agents (contratar / upsert no roster, #408) ──────────────────────────
# Caminho do cockpit pra contratação manual pelo CEO. Faz upsert por nome
# (ON CONFLICT) no roster `agents`. É a base do botão "Contratar"; o hire-executor
# (agents-ia#417, lado coletor) faz o mesmo via decisão HITL. (EPIC #395)
_AGENT_MODES = ("on-demand", "persistent-24-7")
_VALID_MODELS = {"opus", "sonnet", "haiku"}
_VALID_EFFORTS = {"low", "medium", "high", "xhigh", "max"}


class CreateAgentBody(BaseModel):
    nome: str
    role: str
    projetos: list[str] = []
    mode: str = "on-demand"
    model: str | None = None
    effort_level: str | None = None
    thinking_enabled: bool | None = None


_INSERT_AGENT_SQL = text("""
INSERT INTO agents (nome, role, projetos, mode, model, effort_level, thinking_enabled, status)
VALUES (:nome, :role, :projetos, :mode, :model, :effort_level,
        COALESCE(:thinking_enabled, true), 'offline')
ON CONFLICT (nome) DO UPDATE
   SET role = EXCLUDED.role, projetos = EXCLUDED.projetos, mode = EXCLUDED.mode,
       model = EXCLUDED.model, effort_level = EXCLUDED.effort_level,
       thinking_enabled = EXCLUDED.thinking_enabled
RETURNING nome, role, projetos, mode, model, effort_level, thinking_enabled,
          status, contratado_em, last_active_at
""").bindparams(bindparam("projetos", type_=ARRAY(Text)))


@router.post("/agents", status_code=201, dependencies=[Depends(enforce_write_rate_limit)])
async def create_agent(
    body: CreateAgentBody,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    nome = body.nome.strip()
    role = body.role.strip()
    if not nome or not role:
        raise HTTPException(status_code=422, detail={"error": "nome_and_role_required"})
    if body.mode not in _AGENT_MODES:
        raise HTTPException(
            status_code=422,
            detail={"error": "invalid_mode", "allowed": list(_AGENT_MODES)},
        )
    if body.model and body.model not in _VALID_MODELS:
        raise HTTPException(
            status_code=422,
            detail={"error": "invalid_model", "allowed": list(_VALID_MODELS)},
        )
    if body.effort_level and body.effort_level not in _VALID_EFFORTS:
        raise HTTPException(
            status_code=422,
            detail={"error": "invalid_effort", "allowed": list(_VALID_EFFORTS)},
        )
    projetos = [p.strip() for p in body.projetos if p.strip()]
    try:
        result = await db.execute(
            _INSERT_AGENT_SQL,
            {
                "nome": nome,
                "role": role,
                "projetos": projetos,
                "mode": body.mode,
                "model": body.model or None,
                "effort_level": body.effort_level or None,
                "thinking_enabled": body.thinking_enabled,
            },
        )
        row = result.mappings().one()
        await db.commit()
        return {"agent": dict(row)}
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination POST /agents unavailable: %s", exc)
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


# ── /agents/metrics (#382 passo 2) ─────────────────────────────────────────────
# Métricas de performance derivadas de agent_runs, agregadas POR PROJETO (a ponte
# roster↔runs é o projeto; resolvida no frontend). Conta runs TERMINADOS para
# taxa/duração (exclui 'running', sem ended_at); 'running' só na contagem bruta.
_AGENT_METRICS_SQL = text("""
SELECT
  project,
  COUNT(*)                                          AS total,
  COUNT(*) FILTER (WHERE status = 'success')        AS success,
  COUNT(*) FILTER (WHERE status = 'error')          AS error,
  COUNT(*) FILTER (WHERE status = 'timeout')        AS timeout,
  COUNT(*) FILTER (WHERE status = 'running')        AS running,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'success')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE status IN ('success','error','timeout')), 0),
  4)                                                AS success_rate,
  ROUND(AVG(EXTRACT(EPOCH FROM (ended_at - started_at)))
        FILTER (WHERE ended_at IS NOT NULL))        AS avg_duration_seconds,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (ended_at - started_at)))
        FILTER (WHERE ended_at IS NOT NULL))        AS p50_duration_seconds,
  MAX(started_at)                                   AS last_run_at
FROM agent_runs
WHERE project IS NOT NULL
  AND (CAST(:since AS text) IS NULL OR started_at >= CAST(:since AS text)::timestamptz)
GROUP BY project
ORDER BY total DESC
""")


@router.get("/agents/metrics")
async def agent_metrics(
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
    since: str | None = None,
) -> dict[str, Any]:
    try:
        result = await db.execute(_AGENT_METRICS_SQL, {"since": since})
        return {"metrics": _row_dicts(result)}
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination /agents/metrics unavailable: %s", exc)
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


# ── /flow-health ──────────────────────────────────────────────────────────────
# Saúde do fluxo autônomo nas últimas N horas: vazão (runs), por status, tokens/
# custo totais (cost_usd só preenche quando o dispatch captura — migration 014),
# slots ativos do semáforo, e gasto por agente.
_FLOW_RUNS_SQL = text(
    "SELECT count(*) AS n FROM agent_runs "
    "WHERE started_at >= now() - make_interval(hours => :hours)"
)
_FLOW_STATUS_SQL = text(
    "SELECT status, count(*) AS n FROM agent_runs "
    "WHERE started_at >= now() - make_interval(hours => :hours) GROUP BY status"
)
_FLOW_TOKENS_SQL = text(
    "SELECT COALESCE(sum(input_tokens),0) AS input, "
    "COALESCE(sum(output_tokens),0) AS output, "
    "COALESCE(sum(cost_usd),0) AS cost_usd FROM agent_runs "
    "WHERE started_at >= now() - make_interval(hours => :hours)"
)
_FLOW_SLOTS_SQL = text(
    "SELECT count(*) AS n FROM work_claims "
    "WHERE source='slot' AND status IN ('claimed','in_progress')"
)
_FLOW_BY_AGENT_SQL = text(
    "SELECT agent, count(*) AS runs, COALESCE(sum(cost_usd),0) AS cost_usd "
    "FROM agent_runs WHERE started_at >= now() - make_interval(hours => :hours) "
    "AND agent IS NOT NULL GROUP BY agent "
    "ORDER BY cost_usd DESC NULLS LAST, runs DESC LIMIT 20"
)


@router.get("/flow-health")
async def flow_health(
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
    hours: int = Query(24, ge=1, le=168),
) -> dict[str, Any]:
    try:
        runs = (await db.execute(_FLOW_RUNS_SQL, {"hours": hours})).scalar_one()
        by_status = {
            r["status"]: r["n"]
            for r in _row_dicts(await db.execute(_FLOW_STATUS_SQL, {"hours": hours}))
        }
        tok = (await db.execute(_FLOW_TOKENS_SQL, {"hours": hours})).mappings().one()
        slots = (await db.execute(_FLOW_SLOTS_SQL)).scalar_one()
        by_agent = _row_dicts(await db.execute(_FLOW_BY_AGENT_SQL, {"hours": hours}))
        return {
            "hours": hours,
            "runs": int(runs),
            "by_status": by_status,
            "tokens": {
                "input": int(tok["input"]),
                "output": int(tok["output"]),
                "cost_usd": float(tok["cost_usd"]),
            },
            "slots_active": int(slots),
            "by_agent": [
                {
                    "agent": a["agent"],
                    "runs": int(a["runs"]),
                    "cost_usd": float(a["cost_usd"]),
                }
                for a in by_agent
            ],
        }
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination /flow-health unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


# ── /open-prs ─────────────────────────────────────────────────────────────────
# PRs abertos em TODOS os repos de código do ecossistema (org hmtrack), numa
# única chamada `gh search prs`. NÃO vive no mirror :5433 (PR é estado do GitHub),
# então é fetch ao vivo via gh, com cache curto pra não martelar a API a cada poll
# do dashboard. Degrade gracioso: gh fora → total=0, by_project=[] (nunca 503).
_PR_REPO_TO_PROJECT: dict[str, str] = {
    "hmtrack-front": "front",
    "hmtrack-api-py": "api",
    "hmtrack-trackers": "trackers",
    "hmtrack-alert-system": "alert-system",
    "hmtrack-app": "mobile",
}
_PR_CACHE: dict[str, Any] = {"at": 0.0, "data": None}
_PR_CACHE_TTL = 45.0  # s

# QA reviewers (role='qa') por repo + cron — quem analisa o PR e quando. Lido do
# roster (:5433) a cada refresh (best-effort), pra refletir mudanças de cobertura.
_QA_ROSTER_SQL = text(
    "SELECT nome, projetos, cron_expr FROM agents "
    "WHERE role='qa' AND enabled=true AND archived_at IS NULL"
)


def _next_cron_run(cron: str, now: datetime) -> datetime | None:
    """Próximo disparo de um cron simples (campos minuto/hora; resto '*').

    Suporta os padrões do roster QA/DevOps: 'M[,M...] H[,H...] * * *' com '*'
    em minuto/hora. Varre minuto-a-minuto até 25h à frente. None se não parsear.
    """
    parts = cron.split()
    if len(parts) != 5:
        return None

    def field(spec: str, lo: int, hi: int) -> list[int] | None:
        if spec == "*":
            return list(range(lo, hi + 1))
        try:
            vals = sorted(int(x) for x in spec.split(","))
        except ValueError:
            return None
        return vals if all(lo <= v <= hi for v in vals) else None

    mins = field(parts[0], 0, 59)
    hours = field(parts[1], 0, 23)
    if not mins or not hours:
        return None
    t = now.replace(second=0, microsecond=0) + timedelta(minutes=1)
    for _ in range(60 * 25):
        if t.minute in mins and t.hour in hours:
            return t
        t += timedelta(minutes=1)
    return None


def _pr_group(
    repo: str,
    prs: list[dict[str, Any]],
    qa: dict[str, tuple[str, str]],
    now: datetime,
) -> dict[str, Any]:
    """Monta o grupo por projeto com QA reviewer + previsão da próxima análise."""
    reviewer, cron = qa.get(repo, (None, None))
    nxt = _next_cron_run(cron, now) if cron else None
    return {
        "repo": repo,
        "project": _PR_REPO_TO_PROJECT.get(repo, repo),
        "count": len(prs),
        "reviewer": reviewer,
        "reviewer_cron": cron,
        "next_review_at": nxt.isoformat() if nxt else None,
        "next_review_in_min": (int((nxt - now).total_seconds() // 60) if nxt else None),
        "prs": sorted(prs, key=lambda p: str(p.get("created_at", ""))),
    }


async def _qa_reviewers(db: AsyncSession) -> dict[str, tuple[str, str]]:
    """repo → (agente QA, cron). Best-effort: {} se o roster estiver fora."""
    out: dict[str, tuple[str, str]] = {}
    try:
        res = await db.execute(_QA_ROSTER_SQL)
        for row in res.mappings():
            cron = str(row["cron_expr"] or "")
            nome = str(row["nome"])
            projetos = cast("list[str]", row["projetos"] or [])
            for repo in projetos:
                out[str(repo)] = (nome, cron)
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("open-prs: roster QA indisponível: %s", exc)
    return out


async def _fetch_open_prs(db: AsyncSession) -> dict[str, Any]:
    """gh search prs --owner hmtrack --state open, agrupado por repo→projeto,
    enriquecido com o QA reviewer + previsão da próxima análise (cron)."""
    proc = await asyncio.create_subprocess_exec(
        "gh",
        "search",
        "prs",
        "--owner",
        "hmtrack",
        "--state",
        "open",
        "--limit",
        "100",
        "--json",
        "repository,number,title,url,createdAt",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    if proc.returncode != 0:
        logger.warning("open-prs gh falhou: %s", err.decode()[:200])
        return {"total": 0, "by_project": [], "stale": False, "error": "gh_failed"}
    rows = cast(list[dict[str, Any]], json.loads(out.decode() or "[]"))
    groups: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        repo_field = cast("dict[str, Any] | None", r.get("repository"))
        repo = str(repo_field.get("name", "?")) if repo_field else "?"
        groups.setdefault(repo, []).append(
            {
                "number": r.get("number"),
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "created_at": str(r.get("createdAt", "")),
            }
        )
    qa = await _qa_reviewers(db)
    now = datetime.now()
    ordered = sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    by_project = [_pr_group(repo, prs, qa, now) for repo, prs in ordered]
    return {"total": len(rows), "by_project": by_project, "stale": False}


@router.get("/open-prs")
async def open_prs(
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    now = time.monotonic()
    cached = _PR_CACHE["data"]
    if cached is not None and (now - _PR_CACHE["at"]) < _PR_CACHE_TTL:
        return {**cached, "stale": True}
    try:
        data = await _fetch_open_prs(db)
        _PR_CACHE["data"] = data
        _PR_CACHE["at"] = now
        return data
    except Exception as exc:  # gh ausente, JSON inválido, etc. — nunca derruba o dash
        logger.warning("open-prs falhou: %s", exc)
        if cached is not None:
            return {**cached, "stale": True}
        return {"total": 0, "by_project": [], "stale": False, "error": "unavailable"}


# ── /agents (roster) ──────────────────────────────────────────────────────────
# Roster (Camada 1) + status derivado de active_work + carga (requests na fila).
# NB: o join active_work.agent = agents.nome depende da padronização do nome de
# mesa (follow-up); claim com nome divergente não conta como 'busy'.
_AGENTS_SQL = text("""
SELECT a.nome, a.role, a.projetos, a.mode, a.model, a.effort_level, a.thinking_enabled,
       a.contratado_em, a.last_active_at,
       a.cron_expr, a.enabled, a.archived_at,
       CASE WHEN COALESCE(aw.cnt, 0) > 0 THEN 'busy'
            WHEN a.status = 'busy'       THEN 'idle'
            ELSE a.status END                AS status,
       COALESCE(aw.cnt, 0)   AS active_claims,
       COALESCE(q.queued, 0) AS queued_requests,
       cur.source_ref        AS current_ref,
       cur.title             AS current_title,
       COALESCE(rd.recent, '[]'::json) AS recent_done
FROM agents a
LEFT JOIN (SELECT agent, COUNT(*) AS cnt FROM active_work GROUP BY agent) aw
       ON aw.agent = a.nome
LEFT JOIN (SELECT to_agent, COUNT(*) AS queued FROM requests
           WHERE status = 'queued' GROUP BY to_agent) q
       ON q.to_agent = a.nome
LEFT JOIN LATERAL (
    SELECT source_ref, title FROM active_work
    WHERE agent = a.nome ORDER BY claimed_at DESC LIMIT 1
) cur ON TRUE
LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('ref', source_ref, 'at', released_at)) AS recent
    FROM (
        SELECT source_ref, released_at FROM work_claims
        WHERE agent = a.nome AND status = 'done'
        ORDER BY released_at DESC LIMIT 3
    ) d
) rd ON TRUE
WHERE (CAST(:role AS text) IS NULL OR a.role = CAST(:role AS text))
  AND (CAST(:include_archived AS boolean) IS TRUE OR a.archived_at IS NULL)
ORDER BY a.role, a.nome
""")


@router.get("/agents")
async def list_agents(
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
    role: str | None = None,
    include_archived: bool = False,
) -> dict[str, Any]:
    try:
        result = await db.execute(_AGENTS_SQL, {"role": role, "include_archived": include_archived})
        return {"agents": _row_dicts(result)}
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination /agents unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


# ── PATCH /agents/{nome} ──────────────────────────────────────────────────────
_CRON_FIELD_RE = re.compile(r"^(\*|\d+)(-\d+)?(/\d+)?(,(\*|\d+)(-\d+)?(/\d+)?)*$")


def _valid_cron(expr: str) -> bool:
    parts = expr.split()
    return len(parts) == 5 and all(_CRON_FIELD_RE.match(p) for p in parts)


class PatchAgentBody(BaseModel):
    role: str | None = None
    projetos: list[str] | None = None
    mode: str | None = None
    cron_expr: str | None = None
    enabled: bool | None = None
    model: str | None = None
    effort_level: str | None = None
    thinking_enabled: bool | None = None


@router.patch("/agents/{nome}", dependencies=[Depends(enforce_write_rate_limit)])
async def patch_agent(
    nome: str,
    body: PatchAgentBody,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    sets: list[str] = []
    params: dict[str, Any] = {"nome": nome}
    if body.role is not None:
        sets.append("role = :role")
        params["role"] = body.role.strip()
    if body.projetos is not None:
        sets.append("projetos = :projetos")
        params["projetos"] = [p.strip() for p in body.projetos if p.strip()]
    if body.mode is not None:
        if body.mode not in _AGENT_MODES:
            raise HTTPException(
                status_code=422, detail={"error": "invalid_mode", "allowed": list(_AGENT_MODES)}
            )
        sets.append("mode = :mode")
        params["mode"] = body.mode
    if body.cron_expr is not None:
        if body.cron_expr and not _valid_cron(body.cron_expr):
            raise HTTPException(status_code=422, detail={"error": "invalid_cron_expr"})
        sets.append("cron_expr = :cron_expr")
        params["cron_expr"] = body.cron_expr or None
    if body.enabled is not None:
        sets.append("enabled = :enabled")
        params["enabled"] = body.enabled
    if "model" in body.model_fields_set:
        if body.model is not None and body.model != "" and body.model not in _VALID_MODELS:
            raise HTTPException(
                status_code=422, detail={"error": "invalid_model", "allowed": list(_VALID_MODELS)}
            )
        sets.append("model = :model")
        params["model"] = body.model or None
    if "effort_level" in body.model_fields_set:
        if body.effort_level and body.effort_level not in _VALID_EFFORTS:
            raise HTTPException(
                status_code=422, detail={"error": "invalid_effort", "allowed": list(_VALID_EFFORTS)}
            )
        sets.append("effort_level = :effort_level")
        params["effort_level"] = body.effort_level or None
    if body.thinking_enabled is not None:
        sets.append("thinking_enabled = :thinking_enabled")
        params["thinking_enabled"] = body.thinking_enabled
    if not sets:
        raise HTTPException(status_code=422, detail={"error": "empty_patch"})
    if body.projetos is not None:
        sql = text(
            f"UPDATE agents SET {', '.join(sets)} WHERE nome = :nome "
            "RETURNING nome, role, projetos, mode, model, effort_level, thinking_enabled, "
            "status, cron_expr, enabled, archived_at, contratado_em, last_active_at"
        ).bindparams(bindparam("projetos", type_=ARRAY(Text)))
    else:
        sql = text(
            f"UPDATE agents SET {', '.join(sets)} WHERE nome = :nome "
            "RETURNING nome, role, projetos, mode, model, effort_level, thinking_enabled, "
            "status, cron_expr, enabled, archived_at, contratado_em, last_active_at"
        )
    try:
        result = await db.execute(sql, params)
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": "agent_not_found"})
        await db.commit()
        return {"agent": dict(row)}
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination PATCH /agents unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


# ── archive / restore ─────────────────────────────────────────────────────────
_ARCHIVE_RETURN = (
    "RETURNING nome, role, projetos, mode, model, status, cron_expr, "
    "enabled, archived_at, contratado_em, last_active_at"
)


@router.post("/agents/{nome}/archive", dependencies=[Depends(enforce_write_rate_limit)])
async def archive_agent(
    nome: str,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    try:
        claims = await db.execute(
            text("SELECT COUNT(*) FROM active_work WHERE agent = :n"), {"n": nome}
        )
        if (claims.scalar() or 0) > 0:
            raise HTTPException(status_code=409, detail={"error": "active_claim"})
        result = await db.execute(
            text(f"UPDATE agents SET archived_at = now() WHERE nome = :n {_ARCHIVE_RETURN}"),
            {"n": nome},
        )
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": "agent_not_found"})
        await db.commit()
        return {"agent": dict(row)}
    except HTTPException:
        raise
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination archive unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


@router.post("/agents/{nome}/restore", dependencies=[Depends(enforce_write_rate_limit)])
async def restore_agent(
    nome: str,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    try:
        result = await db.execute(
            text(f"UPDATE agents SET archived_at = NULL WHERE nome = :n {_ARCHIVE_RETURN}"),
            {"n": nome},
        )
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": "agent_not_found"})
        await db.commit()
        return {"agent": dict(row)}
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination restore unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


# ── DELETE /agents/{nome} (purge só de arquivado) ─────────────────────────────
@router.delete("/agents/{nome}", status_code=204, dependencies=[Depends(enforce_write_rate_limit)])
async def delete_agent(
    nome: str,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> None:
    try:
        chk = await db.execute(text("SELECT archived_at FROM agents WHERE nome = :n"), {"n": nome})
        row = chk.first()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": "agent_not_found"})
        if row[0] is None:
            raise HTTPException(status_code=409, detail={"error": "archive_first"})
        await db.execute(text("DELETE FROM agents WHERE nome = :n"), {"n": nome})
        await db.commit()
    except HTTPException:
        raise
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination delete unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


# ── /hitl ─────────────────────────────────────────────────────────────────────
# Prompts HITL (human-in-the-loop) pendentes + join issues (title/url) p/ contexto.
_HITL_LIST_SQL = text("""
SELECT h.id, h.source_ref, h.session_id, h.agent, h.project,
       h.question, h.context, h.kind, h.options, h.recommended_key,
       h.status, h.answer,
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


def _validate_answer(kind: str, options: Any, answer: bool | str | list[str]) -> str | None:
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


@router.post("/hitl/{prompt_id}/answer", dependencies=[Depends(enforce_write_rate_limit)])
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
            raise HTTPException(status_code=422, detail={"error": "invalid_answer", "message": err})

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


# ── GET /hitl/{id} ──────────────────────────────────────────────────────────────
# Poll de um prompt específico — o cockpit acompanha uma reunião (CEO→agente) até
# o agente responder (status pending→answered). Mesmo shape do /hitl (list).
_HITL_ONE_SQL = text("""
SELECT h.id, h.source_ref, h.session_id, h.agent, h.project,
       h.question, h.context, h.kind, h.options, h.recommended_key,
       h.status, h.answer,
       h.created_at, h.expires_at, h.answered_at, h.answered_by,
       i.title AS issue_title, i.url AS issue_url
FROM hitl_prompts h
LEFT JOIN issues i ON i.source_ref = h.source_ref
WHERE h.id = :id
""")


@router.get("/hitl/{prompt_id}")
async def get_hitl(
    prompt_id: int,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    try:
        row = (await db.execute(_HITL_ONE_SQL, {"id": prompt_id})).mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": "hitl_not_found"})
        return {"prompt": dict(row)}
    except HTTPException:
        raise
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination GET /hitl/{id} unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


# ── POST /meeting (reunião CEO→agente, agents-ia#547) ───────────────────────────
# O CEO clica num agente no mapa do cockpit → cria um hitl_prompt DIRECIONADO a esse
# agente (kind=text, marcador session_id='cockpit-meeting', expiry 24h). O agente lê
# no início do próximo ciclo (`hitl.py inbox --agent <mesa>`) e responde FOREGROUND
# (`hitl.py reply`); a resposta (status=answered) volta ao cockpit via GET /hitl/{id}.
# É o ÚNICO caminho do cockpit que INSERTa em hitl_prompts (migration 015 deu USAGE
# em hitl_prompts_id_seq ao cockpit_rw). Reusa a ponte HITL — decisão CEO "Opção B".
MEETING_SESSION = "cockpit-meeting"


class CreateMeetingBody(BaseModel):
    agent: str
    message: str
    project: str | None = None


_INSERT_MEETING_SQL = text("""
INSERT INTO hitl_prompts (session_id, agent, project, question, kind, status, expires_at)
VALUES (:session_id, :agent, :project, :question, 'text', 'pending', now() + interval '24 hours')
RETURNING id, source_ref, session_id, agent, project, question, context, kind,
          options, recommended_key, status, answer, created_at, expires_at
""")


@router.post("/meeting", status_code=201, dependencies=[Depends(enforce_write_rate_limit)])
async def create_meeting(
    body: CreateMeetingBody,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    agent = body.agent.strip()
    message = body.message.strip()
    if not agent:
        raise HTTPException(status_code=422, detail={"error": "agent_required"})
    if not message:
        raise HTTPException(status_code=422, detail={"error": "message_required"})
    try:
        result = await db.execute(
            _INSERT_MEETING_SQL,
            {
                "session_id": MEETING_SESSION,
                "agent": agent,
                "project": (body.project or "").strip() or None,
                "question": message,
            },
        )
        row = result.mappings().one()
        await db.commit()
        return {"prompt": dict(row)}
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination POST /meeting unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc


# ── Botão Play (#833): dispara agente/issue NA HORA, sem esperar o cron ─────────
# Aditivo ao cron (o agendamento segue). Dois caminhos, ambos detached (não
# bloqueiam o request) e SEM shell (argv como lista — nunca interpola input cru):
#   POST /agents/{nome}/run     → roda 1 ciclo do loop do agente
#   POST /issues/{n}/dispatch   → despacha aquela issue agora (custa tokens)
# A concorrência NÃO é burlada: reusamos as mesmas barreiras dos scripts —
# loop-claim/file-lock (already_running) e DISPATCH_CAP/claim (cap_full). Os
# pré-checks aqui são best-effort p/ feedback; o script re-checa de forma
# autoritativa e PULA se preciso (idempotente).

# Loop-script + venv do coordination.py vivem no repo de coordenação. A montagem
# do comando por role fica no coordination.py (loop-command) — fonte única com o
# gen_crontab; o backend não duplica o mapa ROLE_LOOP_SCRIPT.
_AGENTS_DIR = f"{get_settings().AGENTS_REPO_DIR}/Agents"
_COORD_PY = f"{_AGENTS_DIR}/coletor-task/.venv/bin/python"
_COORD_SCRIPT = f"{_AGENTS_DIR}/coletor-task/coordination.py"
_DISPATCH_SCRIPT = f"{_AGENTS_DIR}/gerente/automation/dispatch-agent.sh"


def _coord_cli_dsn(url: str) -> str:
    """Converte a URL SQLAlchemy async (postgresql+asyncpg://...) na DSN libpq
    síncrona que o coordination.py (psycopg) entende — remove o sufixo de driver
    (+asyncpg) do scheme. Idempotente p/ DSNs já síncronas. Como só mexe no scheme,
    funciona com OU sem senha/porta no userinfo. O backend conecta via asyncpg
    (settings.COORDINATION_DATABASE_URL); o subprocess do coordination.py NÃO herda
    COORD_DB_DSN, então precisa receber a DSN explícita via --dsn (#835)."""
    scheme, sep, rest = url.partition("://")
    if not sep:
        return url
    return f"{scheme.split('+', 1)[0]}{sep}{rest}"


# DSN síncrona (psycopg) derivada da URL async do backend — passada via --dsn aos
# subprocessos do coordination.py, que não herdam COORD_DB_DSN do ambiente (#835).
_COORD_DSN = _coord_cli_dsn(get_settings().COORDINATION_DATABASE_URL)

# Nome de agente do roster: letras/dígitos/espaço e ()._- (cobre 'QA-FRONT (1)').
_AGENT_NAME_RE = re.compile(r"^[A-Za-z0-9 ()._-]{1,64}$")

# area:<short> → nome de projeto que dispatch-agent.sh/dev-loop entendem (reverso
# EXATO do mapa de áreas do dev-loop.sh). Resolve o projeto pela label, não pela
# coluna issues.project (que guarda lixo de prefixo de título tipo 'EPIC 1.1').
_AREA_TO_PROJECT = {
    "front": "hmtrack-front",
    "api": "hmtrack-api-py",
    "trackers": "hmtrack-trackers",
    "alert-system": "hmtrack-alert-system",
    "db": "banco-dados",
    "mobile": "HMTrackApp",
    "office": "claude-office",
    "whatsapp": "hmtrack-whatsapp",
}

# Loop-claim VIVO no DB (lease 1800s = default do loop_claim): se existe, o loop do
# agente já está rodando → already_running (não força 2º).
_LOOP_ACTIVE_SQL = text("""
SELECT 1 FROM work_claims
WHERE source = 'loop' AND source_ref = :key
  AND status IN ('claimed', 'in_progress')
  AND COALESCE(heartbeat_at, claimed_at) > now() - interval '1800 seconds'
LIMIT 1
""")

_ISSUE_ROW_SQL = text("SELECT state, labels FROM issues WHERE source_ref = :ref")

# Claim ATIVO da issue (active_work já filtra status) → dispatch em andamento.
_ISSUE_CLAIM_SQL = text("SELECT 1 FROM active_work WHERE source_ref = :ref LIMIT 1")

# Cap global — MESMA contagem do dispatch-agent.sh (active_work, todos os sources).
_ACTIVE_COUNT_SQL = text(
    "SELECT count(*) FROM active_work WHERE status IN ('claimed', 'in_progress')"
)

# Agente do roster pro projeto — espelha a resolução do dispatch-agent.sh (--as-agent).
_ROSTER_AGENT_SQL = text("""
SELECT nome FROM agents
WHERE :project = ANY(projetos) AND status <> 'busy' AND archived_at IS NULL
ORDER BY mode DESC, last_active_at ASC NULLS FIRST
LIMIT 1
""")


async def _spawn_detached(argv: list[str]) -> int:
    """Lança argv desacoplado do request (nova sessão de processo, stdio
    descartado). Os scripts cuidam dos próprios logs/claim/cap. Retorna o pid."""
    proc = await asyncio.create_subprocess_exec(
        *argv,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
        start_new_session=True,
    )
    return proc.pid


def _project_from_labels(labels: list[str] | None) -> str | None:
    """Resolve o projeto de dispatch pela 1ª label area:* conhecida."""
    for lbl in labels or []:
        if lbl.startswith("area:"):
            return _AREA_TO_PROJECT.get(lbl[len("area:") :])
    return None


def _dispatch_briefing(n: int, project: str) -> str:
    """Briefing auto-gerado (espelha o do dev-loop) com a instrução de
    decisão-no-corpo, pra dispatches manuais do cockpit."""
    return (
        "MODO UNATTENDED (execute inline até abrir o PR, NÃO faça perguntas "
        "interativas).\n\n"
        f"Implemente a issue agents-ia#{n} no projeto {project}.\n"
        f"- Leia a issue E OS COMENTÁRIOS: gh issue view {n} "
        "--repo IsakielSouza/agents-ia --comments\n"
        "- ⚠️ DECISÃO JÁ TOMADA: se o CORPO listar opções A/B/C ou disser "
        "'Decisão necessária'/'Aguardando direcionamento', a escolha JÁ foi feita "
        "— procure '✅ DECIDIDO' no corpo OU 'Decisão HITL (CEO)' no comentário "
        "mais recente, e IMPLEMENTE essa opção. NUNCA encerre re-perguntando a "
        "decisão. Se realmente não houver decisão em lugar nenhum, aí sim pare e "
        "reporte.\n"
        "- Trabalhe e commite SOMENTE no seu worktree (cwd). Crie um branch "
        "nomeado (não detached). NUNCA git checkout no repo principal.\n"
        f"- Abra um PR com 'Closes #{n}' no corpo.\n"
        "- Se tocar arquivos em hmtrack-documentacao/, os commits ficam LOCAIS "
        "(este repo não tem remote de código) — NUNCA git push de dentro dele.\n"
        "- Finalize o relatório com uma seção '## Brechas mapeadas'."
    )


@router.post(
    "/agents/{nome}/run",
    status_code=202,
    dependencies=[Depends(enforce_write_rate_limit)],
)
async def run_agent_now(
    nome: str,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    """Roda 1 ciclo do loop do agente AGORA (#833). Reusa loop-command do
    coordination.py p/ montar o comando (ROLE_LOOP_SCRIPT/gen_crontab) e respeita
    o loop-claim (already_running). Spawn detached."""
    nome = nome.strip()
    if not _AGENT_NAME_RE.match(nome):
        raise HTTPException(status_code=422, detail={"error": "nome_invalido"})

    # 1. Resolve o comando do loop via coordination.py (fonte única; sem shell).
    try:
        proc = await asyncio.create_subprocess_exec(
            _COORD_PY,
            _COORD_SCRIPT,
            "--dsn",
            _COORD_DSN,
            "loop-command",
            "--agent",
            nome,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await proc.communicate()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=502, detail={"error": "coordination_unavailable"}) from exc
    rc = proc.returncode
    if rc == 3:
        raise HTTPException(status_code=404, detail={"error": "agent_not_in_roster", "nome": nome})
    if rc == 4:
        raise HTTPException(
            status_code=422,
            detail={"error": "role_sem_loop_script", "message": err.decode()[:200]},
        )
    if rc != 0:
        raise HTTPException(
            status_code=502,
            detail={"error": "loop_command_failed", "message": err.decode()[:300]},
        )
    try:
        info = json.loads(out.decode())
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail={"error": "loop_command_bad_output"}) from exc
    argv = cast("list[str]", info.get("argv") or [])
    claim_key = info.get("claim_key")
    if not argv:
        raise HTTPException(status_code=422, detail={"error": "role_sem_loop_script", "nome": nome})

    # 2. already_running? (loop-claim vivo) — não força 2º loop.
    if claim_key:
        try:
            active = (await db.execute(_LOOP_ACTIVE_SQL, {"key": claim_key})).scalar()
        except (OperationalError, InterfaceError, DBAPIError) as exc:
            logger.warning("coordination /agents/run unavailable: %s", exc)
            raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc
        if active:
            return {
                "status": "already_running",
                "agent": nome,
                "claim_key": claim_key,
            }

    # 3. Spawn detached.
    try:
        pid = await _spawn_detached(argv)
    except (FileNotFoundError, PermissionError) as exc:
        raise HTTPException(
            status_code=502, detail={"error": "spawn_failed", "message": str(exc)[:200]}
        ) from exc
    return {"status": "started", "agent": nome, "pid": pid, "claim_key": claim_key}


@router.post(
    "/issues/{n}/dispatch",
    status_code=202,
    dependencies=[Depends(enforce_write_rate_limit)],
)
async def dispatch_issue_now(
    n: int,
    db: Annotated[AsyncSession, Depends(get_coordination_db)],
) -> dict[str, Any]:
    """Despacha a issue #n AGORA via dispatch-agent.sh (#833). Resolve o projeto
    pela label area:*, respeita claim (already_running) e DISPATCH_CAP (cap_full).
    Spawn detached. Custa tokens — o frontend confirma antes."""
    if n <= 0:
        raise HTTPException(status_code=422, detail={"error": "issue_invalida"})
    ref = f"agents-ia#{n}"

    # 1. Estado + labels do mirror (resolve projeto pela area:*).
    try:
        row = (await db.execute(_ISSUE_ROW_SQL, {"ref": ref})).mappings().first()
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination /issues/dispatch unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc
    if not row:
        raise HTTPException(status_code=404, detail={"error": "issue_not_found", "issue": n})
    if (row["state"] or "").upper() == "CLOSED":
        return {"status": "closed", "issue": n}
    project = _project_from_labels(row["labels"])
    if not project:
        raise HTTPException(
            status_code=422,
            detail={"error": "sem_projeto", "message": "issue sem label area:* conhecida"},
        )

    # 2. already_running? (claim ativo da issue).
    try:
        if (await db.execute(_ISSUE_CLAIM_SQL, {"ref": ref})).scalar():
            return {"status": "already_running", "issue": n, "project": project}
        # 3. cap cheio? (mesma contagem do dispatch-agent.sh).
        cap = get_settings().DISPATCH_CAP
        active = (await db.execute(_ACTIVE_COUNT_SQL)).scalar() or 0
        if active >= cap:
            return {"status": "cap_full", "issue": n, "active": active, "cap": cap}
        # 4. agente do roster (best-effort; o script resolve se vier vazio).
        agent = (await db.execute(_ROSTER_AGENT_SQL, {"project": project})).scalar()
    except (OperationalError, InterfaceError, DBAPIError) as exc:
        logger.warning("coordination /issues/dispatch unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=_DOWN_DETAIL) from exc

    # 5. Spawn detached (argv como lista — sem shell, sem injeção).
    argv = [_DISPATCH_SCRIPT]
    if agent:
        argv += ["--as-agent", agent]
    argv += [project, str(n), _dispatch_briefing(n, project)]
    try:
        pid = await _spawn_detached(argv)
    except (FileNotFoundError, PermissionError) as exc:
        raise HTTPException(
            status_code=502, detail={"error": "spawn_failed", "message": str(exc)[:200]}
        ) from exc
    return {
        "status": "started",
        "issue": n,
        "project": project,
        "agent": agent,
        "pid": pid,
    }
