# Agent Functions Modal + Progress Ribbon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao clicar no nome de um agente na tabela `/agents`, abre um modal com funções executáveis fixas; clicar "Executar" dispara background job e exibe fita de progresso no rodapé até conclusão.

**Architecture:** Registry estático TS mapeia `agent.nome → AgentFunction[]`. O frontend chama `POST /api/v1/coordination/agent-functions/exec`, recebe `job_id` e faz poll a cada 2 s via `GET /api/v1/coordination/agent-functions/jobs/{job_id}`. O Zustand `jobStore` mantém o estado do job ativo e alimenta o `JobProgressRibbon` fixo no rodapé do layout.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind 4 / Zustand 5 · FastAPI / asyncio / pymssql / subprocess

## Global Constraints

- Prefixo da API: `/api/v1/coordination/` (padrão do projeto)
- Tailwind classes: `bg-slate-900`, `border-slate-800`, `text-slate-200` (dark theme do office)
- Ícones: somente `lucide-react` (já instalado)
- Sem nova tabela no PostgreSQL — jobs em dict em memória no backend
- Apenas um job ativo por vez no `jobStore`
- Caminho do `.env` banco: `{AGENTS_REPO_DIR}/BANCO-DADOS/.env` (usa `get_settings().AGENTS_REPO_DIR` já existente no backend)
- SSH ao servidor via `ubuntu@186.232.81.161` (chave em `~/.ssh/`, passwordless sudo confirmado)

---

## Mapa de Arquivos

| Ação | Path | Responsabilidade |
|---|---|---|
| Criar | `frontend/src/lib/agentFunctions.ts` | Registry estático de funções por agente |
| Criar | `backend/app/api/routes/agent_functions.py` | Endpoints `/exec` + `/jobs/{id}` + lógica de backup |
| Modificar | `backend/app/main.py` | Registrar novo router |
| Modificar | `frontend/src/components/coordination/coordinationApi.ts` | `execAgentFunction` + `getAgentJob` |
| Criar | `frontend/src/stores/jobStore.ts` | Zustand: job ativo + polling |
| Criar | `frontend/src/components/coordination/AgentFunctionsModal.tsx` | Modal com lista de funções |
| Criar | `frontend/src/components/layout/JobProgressRibbon.tsx` | Fita de progresso no rodapé |
| Modificar | `frontend/src/app/layout.tsx` | Montar `<JobProgressRibbon />` |
| Modificar | `frontend/src/app/agents/page.tsx` | Nome → button + abrir modal |

---

## Task 1: Backend — rota agent_functions

**Files:**
- Create: `backend/app/api/routes/agent_functions.py`
- Modify: `backend/app/main.py` (linha ~194: adicionar import + include_router)
- Test: `backend/tests/test_agent_functions.py`

**Interfaces:**
- Produz:
  - `POST /api/v1/coordination/agent-functions/exec` → `{ job_id: str }`
  - `GET /api/v1/coordination/agent-functions/jobs/{job_id}` → `JobOut`

- [ ] **Step 1: Escrever o teste que falha**

```python
# backend/tests/test_agent_functions.py
"""Testes das rotas de execução de funções de agente.

Usa TestClient(app) sem context manager — mesmo padrão de test_coordination_routes.py.
O backup real NÃO é executado: a task asyncio é mockada.
"""
from __future__ import annotations
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_exec_unknown_agent_returns_400():
    resp = client.post(
        "/api/v1/coordination/agent-functions/exec",
        json={"agent_nome": "agente-inexistente", "function_id": "backup-hmtrack"},
    )
    assert resp.status_code == 400


def test_exec_unknown_function_returns_400():
    resp = client.post(
        "/api/v1/coordination/agent-functions/exec",
        json={"agent_nome": "banco-dados", "function_id": "funcao-inexistente"},
    )
    assert resp.status_code == 400


def test_exec_valid_returns_job_id():
    with patch(
        "app.api.routes.agent_functions._run_backup_hmtrack",
        new_callable=AsyncMock,
    ):
        resp = client.post(
            "/api/v1/coordination/agent-functions/exec",
            json={"agent_nome": "banco-dados", "function_id": "backup-hmtrack"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data
    assert isinstance(data["job_id"], str)


def test_get_job_not_found_returns_404():
    resp = client.get("/api/v1/coordination/agent-functions/jobs/nao-existe")
    assert resp.status_code == 404


def test_get_job_running_after_exec():
    with patch(
        "app.api.routes.agent_functions._run_backup_hmtrack",
        new_callable=AsyncMock,
    ):
        resp = client.post(
            "/api/v1/coordination/agent-functions/exec",
            json={"agent_nome": "banco-dados", "function_id": "backup-hmtrack"},
        )
    job_id = resp.json()["job_id"]
    resp2 = client.get(f"/api/v1/coordination/agent-functions/jobs/{job_id}")
    assert resp2.status_code == 200
    data = resp2.json()
    assert data["job_id"] == job_id
    assert data["status"] in ("running", "done", "failed")
    assert isinstance(data["progress"], int)
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
cd /home/isakiel/projects/tools/claude-office/backend
python -m pytest tests/test_agent_functions.py -v 2>&1 | head -20
```
Esperado: `ModuleNotFoundError` ou `ImportError` — rota não existe ainda.

- [ ] **Step 3: Criar `backend/app/api/routes/agent_functions.py`**

```python
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
```

- [ ] **Step 4: Registrar o router em `backend/app/main.py`**

Encontrar a linha (≈194):
```python
from app.api.routes import coordination, events, floors, ops, preferences, sessions
```
Alterar para:
```python
from app.api.routes import agent_functions, coordination, events, floors, ops, preferences, sessions
```

Encontrar o bloco de `include_router` e adicionar após `coordination.router`:
```python
app.include_router(agent_functions.router, prefix=f"{settings.API_V1_STR}")
```

- [ ] **Step 5: Rodar os testes**

```bash
cd /home/isakiel/projects/tools/claude-office/backend
python -m pytest tests/test_agent_functions.py -v
```
Esperado: todos os 5 testes PASSAM.

- [ ] **Step 6: Commit**

```bash
cd /home/isakiel/projects/tools/claude-office
git add backend/app/api/routes/agent_functions.py backend/app/main.py backend/tests/test_agent_functions.py
git commit -m "feat(backend): rota agent-functions exec+jobs — backup HMTrackDB em background"
```

---

## Task 2: Frontend — registry + client API

**Files:**
- Create: `frontend/src/lib/agentFunctions.ts`
- Modify: `frontend/src/components/coordination/coordinationApi.ts` (adicionar 2 funções no final)

**Interfaces:**
- Produz:
  - `AGENT_FUNCTIONS_REGISTRY: Record<string, AgentFunction[]>`
  - `AgentFunction { id: string; label: string; description: string }`
  - `execAgentFunction(agentNome: string, functionId: string): Promise<{ job_id: string }>`
  - `getAgentJob(jobId: string): Promise<AgentJobStatus>`
  - `AgentJobStatus { job_id: string; agent_nome: string; function_id: string; status: "running"|"done"|"failed"; progress: number; message: string; error?: string }`

- [ ] **Step 1: Criar `frontend/src/lib/agentFunctions.ts`**

```typescript
export interface AgentFunction {
  id: string
  label: string
  description: string
}

export const AGENT_FUNCTIONS_REGISTRY: Record<string, AgentFunction[]> = {
  'banco-dados': [
    {
      id: 'backup-hmtrack',
      label: 'Fazer cópia do servidor HMTrack',
      description: 'Backup completo do HMTrackDB em .bak comprimido (~1.6 GB, ~34s no servidor + transferência)',
    },
  ],
}
```

- [ ] **Step 2: Adicionar funções no final de `coordinationApi.ts`**

Abrir `frontend/src/components/coordination/coordinationApi.ts` e adicionar no final do arquivo:

```typescript
// ── Agent Functions ───────────────────────────────────────────────────────────

export interface AgentJobStatus {
  job_id: string
  agent_nome: string
  function_id: string
  status: 'running' | 'done' | 'failed'
  progress: number
  message: string
  error?: string
}

export async function execAgentFunction(
  agentNome: string,
  functionId: string,
): Promise<{ job_id: string }> {
  const resp = await fetch('/api/v1/coordination/agent-functions/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_nome: agentNome, function_id: functionId }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail ?? `HTTP ${resp.status}`)
  }
  return resp.json()
}

export async function getAgentJob(jobId: string): Promise<AgentJobStatus> {
  const resp = await fetch(`/api/v1/coordination/agent-functions/jobs/${jobId}`)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}
```

- [ ] **Step 3: Verificar que o TypeScript compila**

```bash
cd /home/isakiel/projects/tools/claude-office/frontend
bun run tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
cd /home/isakiel/projects/tools/claude-office
git add frontend/src/lib/agentFunctions.ts frontend/src/components/coordination/coordinationApi.ts
git commit -m "feat(frontend): registry de funções de agente + client API exec/jobs"
```

---

## Task 3: Frontend — jobStore (Zustand)

**Files:**
- Create: `frontend/src/stores/jobStore.ts`

**Interfaces:**
- Consome: `getAgentJob` de `coordinationApi.ts`
- Produz:
  - `useJobStore()` → `{ job, startJob, clearJob }`
  - `job: ActiveJob | null`
  - `ActiveJob { jobId: string; agentNome: string; functionLabel: string; status: "running"|"done"|"failed"; progress: number; message: string; error?: string }`
  - `startJob(jobId: string, agentNome: string, functionLabel: string): void`
  - `clearJob(): void`

- [ ] **Step 1: Criar `frontend/src/stores/jobStore.ts`**

```typescript
"use client";

import { create } from "zustand";
import { getAgentJob } from "@/components/coordination/coordinationApi";

export interface ActiveJob {
  jobId: string;
  agentNome: string;
  functionLabel: string;
  status: "running" | "done" | "failed";
  progress: number;
  message: string;
  error?: string;
}

interface JobStoreState {
  job: ActiveJob | null;
  _pollInterval: ReturnType<typeof setInterval> | null;
  startJob: (jobId: string, agentNome: string, functionLabel: string) => void;
  clearJob: () => void;
  _updateFromApi: (jobId: string) => Promise<void>;
}

export const useJobStore = create<JobStoreState>((set, get) => ({
  job: null,
  _pollInterval: null,

  startJob(jobId, agentNome, functionLabel) {
    // limpa job anterior se houver
    const prev = get()._pollInterval;
    if (prev) clearInterval(prev);

    set({
      job: {
        jobId,
        agentNome,
        functionLabel,
        status: "running",
        progress: 0,
        message: "Iniciando...",
      },
    });

    // polling a cada 2s
    const interval = setInterval(async () => {
      await get()._updateFromApi(jobId);
      // para quando terminar
      const current = get().job;
      if (current && current.status !== "running") {
        clearInterval(get()._pollInterval!);
        set({ _pollInterval: null });
      }
    }, 2000);

    set({ _pollInterval: interval });
  },

  clearJob() {
    const interval = get()._pollInterval;
    if (interval) clearInterval(interval);
    set({ job: null, _pollInterval: null });
  },

  async _updateFromApi(jobId) {
    try {
      const data = await getAgentJob(jobId);
      set((state) => ({
        job: state.job
          ? {
              ...state.job,
              status: data.status,
              progress: data.progress,
              message: data.message,
              error: data.error,
            }
          : null,
      }));
    } catch {
      // falha de rede: mantém estado atual, tenta de novo no próximo ciclo
    }
  },
}));
```

- [ ] **Step 2: Verificar que compila**

```bash
cd /home/isakiel/projects/tools/claude-office/frontend
bun run tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
cd /home/isakiel/projects/tools/claude-office
git add frontend/src/stores/jobStore.ts
git commit -m "feat(frontend): jobStore — polling de job ativo com Zustand"
```

---

## Task 4: Frontend — AgentFunctionsModal

**Files:**
- Create: `frontend/src/components/coordination/AgentFunctionsModal.tsx`

**Interfaces:**
- Consome:
  - `Modal` de `@/components/overlay/Modal`
  - `CoordAgent` de `./coordinationApi`
  - `AGENT_FUNCTIONS_REGISTRY, AgentFunction` de `@/lib/agentFunctions`
  - `execAgentFunction` de `./coordinationApi`
  - `useJobStore` de `@/stores/jobStore`
- Produz: `AgentFunctionsModal({ agent, onClose }: { agent: CoordAgent; onClose: () => void })`

- [ ] **Step 1: Criar `frontend/src/components/coordination/AgentFunctionsModal.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import Modal from "@/components/overlay/Modal";
import { type CoordAgent, execAgentFunction } from "./coordinationApi";
import { AGENT_FUNCTIONS_REGISTRY, type AgentFunction } from "@/lib/agentFunctions";
import { useJobStore } from "@/stores/jobStore";

export function AgentFunctionsModal({
  agent,
  onClose,
}: {
  agent: CoordAgent;
  onClose: () => void;
}): React.ReactNode {
  const functions: AgentFunction[] = AGENT_FUNCTIONS_REGISTRY[agent.nome] ?? [];
  const startJob = useJobStore((s) => s.startJob);
  const [executing, setExecuting] = useState<string | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  async function handleExecute(fn: AgentFunction) {
    setExecuting(fn.id);
    setExecError(null);
    try {
      const { job_id } = await execAgentFunction(agent.nome, fn.id);
      startJob(job_id, agent.nome, fn.label);
      onClose();
    } catch (err) {
      setExecError(err instanceof Error ? err.message : "Erro desconhecido");
      setExecuting(null);
    }
  }

  return (
    <Modal isOpen title={`Funções — ${agent.nome}`} onClose={onClose}>
      {functions.length === 0 ? (
        <p className="text-slate-500 text-sm">
          Nenhuma função disponível para este agente.
        </p>
      ) : (
        <ul className="space-y-3">
          {functions.map((fn) => (
            <li
              key={fn.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950 p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-100">{fn.label}</p>
                <p className="mt-1 text-xs text-slate-500">{fn.description}</p>
              </div>
              <button
                onClick={() => handleExecute(fn)}
                disabled={executing === fn.id}
                className="flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <Play size={12} />
                {executing === fn.id ? "Iniciando..." : "Executar"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {execError && (
        <p className="mt-3 text-xs text-rose-400">Erro: {execError}</p>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd /home/isakiel/projects/tools/claude-office/frontend
bun run tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
cd /home/isakiel/projects/tools/claude-office
git add frontend/src/components/coordination/AgentFunctionsModal.tsx
git commit -m "feat(frontend): AgentFunctionsModal — lista e execução de funções por agente"
```

---

## Task 5: Frontend — JobProgressRibbon + layout

**Files:**
- Create: `frontend/src/components/layout/JobProgressRibbon.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consome: `useJobStore` de `@/stores/jobStore`
- Não produz interface pública — componente visual global

- [ ] **Step 1: Criar `frontend/src/components/layout/JobProgressRibbon.tsx`**

```typescript
"use client";

import { CheckCircle, Loader2, X, XCircle } from "lucide-react";
import { useJobStore } from "@/stores/jobStore";

export function JobProgressRibbon(): React.ReactNode {
  const job = useJobStore((s) => s.job);
  const clearJob = useJobStore((s) => s.clearJob);

  if (!job) return null;

  const isDone = job.status === "done";
  const isFailed = job.status === "failed";
  const isRunning = job.status === "running";

  const barColor = isDone
    ? "bg-emerald-500"
    : isFailed
      ? "bg-neutral-700"
      : "bg-slate-500";

  const icon = isDone ? (
    <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
  ) : isFailed ? (
    <XCircle size={14} className="text-red-400 flex-shrink-0" />
  ) : (
    <Loader2 size={14} className="text-slate-400 animate-spin flex-shrink-0" />
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-neutral-950">
      {/* barra de progresso */}
      <div className="h-0.5 w-full bg-slate-800">
        <div
          className={`h-full transition-all duration-300 ease-out ${barColor}`}
          style={{ width: `${job.progress}%` }}
        />
      </div>

      {/* conteúdo */}
      <div className="flex items-center gap-3 px-4 py-2">
        {icon}

        <div className="flex-1 min-w-0">
          <span className="text-xs text-slate-400 truncate">
            <span className="font-medium text-slate-300">{job.agentNome}</span>
            {" · "}
            {job.functionLabel}
          </span>
          <span className="ml-2 text-xs text-slate-500">{job.message}</span>
        </div>

        {isRunning && (
          <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">
            {job.progress}%
          </span>
        )}

        {(isDone || isFailed) && (
          <span className={`text-xs flex-shrink-0 font-medium ${isDone ? "text-emerald-400" : "text-red-400"}`}>
            {isDone ? "Completo" : "Falhou"}
          </span>
        )}

        {(isDone || isFailed) && (
          <button
            onClick={clearJob}
            aria-label="Fechar"
            className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Adicionar wrapper client em `frontend/src/app/layout.tsx`**

O `layout.tsx` é Server Component — não pode usar Zustand diretamente. A solução é importar `JobProgressRibbon` (que é `"use client"`) diretamente; Next.js suporta Client Components dentro de Server Layouts.

Abrir `frontend/src/app/layout.tsx` e alterar:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { JobProgressRibbon } from "@/components/layout/JobProgressRibbon";
```

E no `return`:
```tsx
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
        <JobProgressRibbon />
      </body>
```

- [ ] **Step 3: Verificar que compila**

```bash
cd /home/isakiel/projects/tools/claude-office/frontend
bun run tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
cd /home/isakiel/projects/tools/claude-office
git add frontend/src/components/layout/JobProgressRibbon.tsx frontend/src/app/layout.tsx
git commit -m "feat(frontend): JobProgressRibbon no rodapé global — progresso, completo, falha"
```

---

## Task 6: Wire — agents/page.tsx (nome clicável + modal)

**Files:**
- Modify: `frontend/src/app/agents/page.tsx`

**Interfaces:**
- Consome:
  - `AgentFunctionsModal` de `@/components/coordination/AgentFunctionsModal`
  - `CoordAgent` já importado na página
- Produz: comportamento final — clicar no nome abre o modal

- [ ] **Step 1: Adicionar estado e modal no `agents/page.tsx`**

Abrir `frontend/src/app/agents/page.tsx`.

**1a. Adicionar import no topo** (junto aos imports existentes de coordination):
```typescript
import { AgentFunctionsModal } from "@/components/coordination/AgentFunctionsModal";
```

**1b. Adicionar estado local** (junto a `timelineAgent` que já existe, linha ~44):
```typescript
const [functionsAgent, setFunctionsAgent] = useState<CoordAgent | null>(null);
```

**1c. Na célula de nome do agente na tabela**, encontrar onde `a.nome` é renderizado como texto e substituir por:
```tsx
<button
  onClick={() => setFunctionsAgent(a)}
  className="text-slate-200 hover:text-white underline underline-offset-2 cursor-pointer bg-transparent border-0 p-0 font-inherit text-left"
>
  {a.nome}
</button>
```

**1d. Montar o modal** — logo antes do `return` final ou junto ao `AgentTimelineModal` existente:
```tsx
{functionsAgent && (
  <AgentFunctionsModal
    agent={functionsAgent}
    onClose={() => setFunctionsAgent(null)}
  />
)}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd /home/isakiel/projects/tools/claude-office/frontend
bun run tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
cd /home/isakiel/projects/tools/claude-office
git add frontend/src/app/agents/page.tsx
git commit -m "feat(frontend): nome do agente clicável abre modal de funções"
```

---

## Teste end-to-end manual

Após todos os tasks:

- [ ] Subir o backend: `cd backend && uvicorn app.main:app --reload --port 8000`
- [ ] Subir o frontend: `cd frontend && bun dev`
- [ ] Abrir `http://localhost:3000/agents`
- [ ] Clicar no nome `banco-dados` → modal abre com "Fazer cópia do servidor HMTrack"
- [ ] Clicar "Executar" → modal fecha → ribbon aparece no rodapé com barra cinza animando
- [ ] Aguardar ~34s + SCP → barra fica verde, texto "Completo"
- [ ] Clicar X → ribbon desaparece
- [ ] Clicar em agente sem funções (ex: `hmtrack-front`) → modal exibe "Nenhuma função disponível"
