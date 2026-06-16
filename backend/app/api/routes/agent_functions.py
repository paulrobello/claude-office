"""Execução de funções de agente em background.

Endpoints:
  POST /coordination/agent-functions/exec        — inicia job, retorna job_id
  GET  /coordination/agent-functions/jobs/{id}   — poll de status/progresso

Jobs em dict em memória: sem persistência (reinício limpa). Suficiente para
jobs de minutos. Um job por (agent_nome, function_id) não é limitado — múltiplos
podem coexistir; o frontend rastreia apenas o mais recente no jobStore.
"""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/coordination/agent-functions", tags=["agent-functions"])

# ── Whitelist de funções permitidas ────────────────────────────────────────────
ALLOWED_FUNCTIONS: dict[str, list[str]] = {
    "banco-dados": ["backup-hmtrack"],
}

# ── Jobs em memória ────────────────────────────────────────────────────────────
class JobState:
    def __init__(self, agent_nome: str, function_id: str) -> None:
        self.job_id = str(uuid.uuid4())
        self.agent_nome = agent_nome
        self.function_id = function_id
        self.status = "running"   # running | done | failed
        self.progress = 0         # 0–100
        self.message = "Iniciando..."
        self.error: str | None = None
        self.started_at = datetime.utcnow().isoformat()
        self.ended_at: str | None = None

JOBS: dict[str, JobState] = {}


# ── Schemas ────────────────────────────────────────────────────────────────────
class ExecBody(BaseModel):
    agent_nome: str
    function_id: str


class JobOut(BaseModel):
    job_id: str
    agent_nome: str
    function_id: str
    status: str
    progress: int
    message: str
    error: str | None = None
    started_at: str
    ended_at: str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.post("/exec")
async def exec_function(body: ExecBody) -> dict[str, str]:
    allowed = ALLOWED_FUNCTIONS.get(body.agent_nome, [])
    if not allowed:
        raise HTTPException(status_code=400, detail=f"Agente '{body.agent_nome}' não tem funções registradas.")
    if body.function_id not in allowed:
        raise HTTPException(status_code=400, detail=f"Função '{body.function_id}' não permitida para '{body.agent_nome}'.")

    job = JobState(body.agent_nome, body.function_id)
    JOBS[job.job_id] = job

    asyncio.create_task(_dispatch(job))
    return {"job_id": job.job_id}


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: str) -> JobOut:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado.")
    return JobOut(
        job_id=job.job_id,
        agent_nome=job.agent_nome,
        function_id=job.function_id,
        status=job.status,
        progress=job.progress,
        message=job.message,
        error=job.error,
        started_at=job.started_at,
        ended_at=job.ended_at,
    )


# ── Dispatch interno ───────────────────────────────────────────────────────────
async def _dispatch(job: JobState) -> None:
    try:
        if job.function_id == "backup-hmtrack":
            await _run_backup_hmtrack(job)
        else:
            raise ValueError(f"function_id desconhecido: {job.function_id}")
    except Exception as exc:
        logger.exception("Job %s falhou", job.job_id)
        job.status = "failed"
        job.error = str(exc)
        job.message = "Falhou"
        job.ended_at = datetime.utcnow().isoformat()


# ── Backup HMTrackDB ───────────────────────────────────────────────────────────
async def _run_backup_hmtrack(job: JobState) -> None:
    """Faz BACKUP DATABASE HMTrackDB no servidor de produção e copia o .bak localmente."""
    import re
    from dotenv import load_dotenv

    settings = get_settings()
    env_path = Path(settings.AGENTS_REPO_DIR) / "BANCO-DADOS" / ".env"
    load_dotenv(env_path, override=False)

    host = os.getenv("PROD_DB_HOST", "db.zartoo.com.br")
    port = int(os.getenv("PROD_DB_PORT", "1706"))
    db   = os.getenv("PROD_DB_NAME", "HMTrackDB")
    user = os.getenv("PROD_DB_USER", "sa")
    pwd  = os.getenv("PROD_DB_PASSWORD")

    if not pwd:
        raise RuntimeError("PROD_DB_PASSWORD não encontrado no .env")

    date_str = datetime.utcnow().strftime("%Y%m%d")
    remote_bak = f"/var/opt/mssql/backup/HMTrackDB_full_{date_str}.bak"
    local_dir  = Path(settings.AGENTS_REPO_DIR) / "BANCO-DADOS" / "BACKUPS" / f"producao_{date_str}"
    local_bak  = local_dir / f"HMTrackDB_full_{date_str}.bak"
    local_dir.mkdir(parents=True, exist_ok=True)

    sql = f"""
BACKUP DATABASE {db}
TO DISK = '{remote_bak}'
WITH COMPRESSION, STATS = 10, FORMAT, INIT
"""

    job.message = "Conectando ao banco de produção..."

    import pymssql  # type: ignore
    loop = asyncio.get_running_loop()

    def _run_sql() -> None:
        conn = pymssql.connect(
            server=host, port=port, user=user, password=pwd,
            database=db, tds_version="7.0", autocommit=True,
            login_timeout=30, timeout=600,
        )
        msgs: list[tuple[int, str]] = []

        def _handler(state: Any, severity: int, srvname: Any, procname: Any, line: Any, msgtext: bytes) -> None:  # noqa: ANN401
            text = msgtext.decode() if isinstance(msgtext, bytes) else str(msgtext)
            msgs.append((severity, text))
            m = re.search(r"(\d+) percent processed", text)
            if m:
                job.progress = int(m.group(1))
                job.message = f"{job.progress}% processado..."

        try:
            conn._conn.set_msghandler(_handler)
        except Exception:
            pass

        cur = conn.cursor()
        cur.execute(sql)
        conn.close()

    job.message = "Iniciando backup no servidor..."
    await loop.run_in_executor(None, _run_sql)

    # copia do servidor para local
    job.progress = 100
    job.message = "Copiando .bak para máquina local..."

    server_ip = "186.232.81.161"

    def _scp_bak() -> None:
        # garante leitura pelo ubuntu
        subprocess.run(
            ["ssh", f"ubuntu@{server_ip}",
             f"sudo cp {remote_bak} /tmp/HMTrackDB_full_{date_str}.bak && sudo chmod 644 /tmp/HMTrackDB_full_{date_str}.bak"],
            check=True, capture_output=True, text=True,
        )
        subprocess.run(
            ["scp", f"ubuntu@{server_ip}:/tmp/HMTrackDB_full_{date_str}.bak", str(local_bak)],
            check=True, capture_output=True, text=True,
        )
        # limpa /tmp remoto
        subprocess.run(
            ["ssh", f"ubuntu@{server_ip}", f"sudo rm -f /tmp/HMTrackDB_full_{date_str}.bak"],
            check=True, capture_output=True, text=True,
        )

    await loop.run_in_executor(None, _scp_bak)

    size_mb = round(local_bak.stat().st_size / 1024 / 1024)
    job.status = "done"
    job.progress = 100
    job.message = f"Backup salvo em BACKUPS/producao_{date_str}/ ({size_mb} MB)"
    job.ended_at = datetime.utcnow().isoformat()
