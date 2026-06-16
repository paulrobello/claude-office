"""Serviço singleton que roda build-push + deploy de um destino, com streaming."""

import asyncio
import os
from collections import deque
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.api.websocket import manager
from app.config import get_settings


class OpsRunner:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._running = False
        self._buffer: deque[str] = deque(maxlen=500)
        self._state: dict[str, Any] = {
            "running": False, "run_id": None, "dest_id": None, "dry_run": False,
            "step": "idle", "started_at": None, "finished_at": None, "exit_code": None,
        }

    def is_running(self) -> bool:
        return self._running

    def current_dest_id(self) -> str | None:
        return self._state["dest_id"]

    def status(self) -> dict[str, Any]:
        return {**self._state, "log_tail": list(self._buffer)[-200:]}

    async def run(self, dest: Any, dry_run: bool) -> str:
        if self._running:
            raise RuntimeError("já em execução")
        async with self._lock:
            if self._running:
                raise RuntimeError("já em execução")
            self._running = True
        run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        self._buffer.clear()
        self._state.update(running=True, run_id=run_id, dest_id=dest.id, dry_run=dry_run,
                           step="build", started_at=run_id, finished_at=None, exit_code=None)
        asyncio.create_task(self._execute(run_id, dest, dry_run))
        return run_id

    async def _execute(self, run_id: str, dest: Any, dry_run: bool) -> None:
        s = get_settings()
        try:
            env = {
                **os.environ,
                "DRY_RUN": "1" if dry_run else "0",
                "REGISTRY": dest.registry, "TAG": "latest",
                "FRONT_TAG": dest.image_tag, "FRONT_NEW_API_URL": dest.front_api_url,
            }
            await self._broadcast({"type": "ops.step", "run_id": run_id, "step": "build", "status": "started"})
            rc = await self._stream("build", [s.OPS_BUILD_SCRIPT], cwd=s.OPS_ZARTOO_DIR, env=env)
            if rc != 0:
                return await self._finish(run_id, "failed", rc)
            if not dry_run:
                self._state["step"] = "deploy"
                await self._broadcast({"type": "ops.step", "run_id": run_id, "step": "deploy", "status": "started"})
                remote = (f"BASE={dest.remote_base} CF={dest.compose_file} "
                          f"/root/project/deploy-alocalizai.sh all")
                rc = await self._stream("deploy", ["ssh", dest.ssh_alias, remote])
                if rc != 0:
                    return await self._finish(run_id, "failed", rc)
            await self._finish(run_id, "done", 0)
        except Exception as exc:
            self._buffer.append(f"[runner] erro: {exc}")
            await self._finish(run_id, "failed", -1)

    async def _stream(self, step: str, cmd: list[str], cwd: str | None = None,
                      env: dict[str, str] | None = None) -> int:
        s = get_settings()
        Path(s.OPS_LOG_DIR).mkdir(parents=True, exist_ok=True)
        logfile = Path(s.OPS_LOG_DIR) / f"{self._state['run_id']}.log"
        proc = await asyncio.create_subprocess_exec(
            *cmd, cwd=cwd, env=env,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        assert proc.stdout is not None
        with logfile.open("a", encoding="utf-8") as fh:
            fh.write(f"\n===== STEP {step}: {' '.join(cmd)} =====\n")
            async for raw in proc.stdout:
                line = raw.decode(errors="replace").rstrip("\n")
                self._buffer.append(line)
                fh.write(line + "\n")
                fh.flush()
                await self._broadcast({"type": "ops.log", "run_id": self._state["run_id"],
                                       "step": step, "line": line})
        return await proc.wait()

    async def _finish(self, run_id: str, status: str, exit_code: int) -> None:
        self._state.update(running=False, step=status, exit_code=exit_code,
                           finished_at=datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ"))
        self._running = False
        await self._broadcast({"type": "ops.result", "run_id": run_id,
                               "step": status, "exit_code": exit_code, "status": status})

    async def _broadcast(self, msg: dict[str, Any]) -> None:
        try:
            await manager.broadcast_all(msg)
        except Exception:
            pass


ops_runner = OpsRunner()
