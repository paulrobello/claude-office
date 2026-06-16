import asyncio
import pytest
from app.services.ops_runner import OpsRunner


class _Dest:
    id = "t"; ssh_alias = "flt"; remote_base = "/root/project"
    compose_file = "docker-compose.alocalizai.yml"
    front_api_url = "https://core.x/v1/"; registry = "ghcr.io/x"; image_tag = "t"


@pytest.mark.asyncio
async def test_lock_rejects_second_run(monkeypatch):
    r = OpsRunner()
    started = asyncio.Event()

    async def fake_stream(step, cmd, cwd=None, env=None):
        started.set()
        await asyncio.sleep(0.2)
        return 0

    monkeypatch.setattr(r, "_stream", fake_stream)
    await r.run(_Dest(), dry_run=True)
    await started.wait()
    assert r.is_running() is True
    with pytest.raises(RuntimeError):
        await r.run(_Dest(), dry_run=True)
    await asyncio.sleep(0.3)
    assert r.is_running() is False


@pytest.mark.asyncio
async def test_dry_run_skips_deploy(monkeypatch):
    r = OpsRunner()
    steps = []

    async def fake_stream(step, cmd, cwd=None, env=None):
        steps.append(step)
        return 0

    monkeypatch.setattr(r, "_stream", fake_stream)
    await r.run(_Dest(), dry_run=True)
    await asyncio.sleep(0.1)
    assert steps == ["build"]


@pytest.mark.asyncio
async def test_build_fail_skips_deploy(monkeypatch):
    r = OpsRunner()
    steps = []

    async def fake_stream(step, cmd, cwd=None, env=None):
        steps.append(step)
        return 1 if step == "build" else 0

    monkeypatch.setattr(r, "_stream", fake_stream)
    await r.run(_Dest(), dry_run=False)
    await asyncio.sleep(0.1)
    assert steps == ["build"]
    assert r.status()["step"] == "failed"
