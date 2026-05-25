"""Poller do feed de coordenação (:5433) → broadcast WS para o cockpit (#412).

Substitui o poll de 15s POR-CLIENTE do cockpit por UM poll server-side que faz
broadcast quando algo muda (roster / requests / claims / hitl / issues). N clientes
viram 1 poll. Só consulta o DB quando há cliente conectado no feed; degrade gracioso
(:5433 fora loga e tenta de novo, não derruba o app).
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text

from app.api.websocket import manager
from app.db.coordination import get_coordination_session_factory

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 3.0

# "Versão" barata e sensível a mudança: counts + maiores timestamps das tabelas que
# o cockpit exibe. Muda sempre que qualquer linha relevante é inserida/atualizada.
_VERSION_SQL = text("""
SELECT
  (SELECT count(*) FROM agents),
  (SELECT max(last_active_at) FROM agents),
  (SELECT count(*) FROM requests),
  (SELECT max(coalesce(served_at, queued_at)) FROM requests),
  (SELECT count(*) FROM work_claims WHERE status IN ('claimed','in_progress')),
  (SELECT max(coalesce(heartbeat_at, released_at, claimed_at)) FROM work_claims),
  (SELECT count(*) FROM hitl_prompts WHERE status = 'pending'),
  (SELECT max(coalesce(answered_at, created_at)) FROM hitl_prompts),
  (SELECT count(*) FROM issues WHERE state = 'OPEN'),
  (SELECT max(synced_at) FROM issues)
""")


async def current_version() -> str | None:
    """String que muda quando o estado de coordenação muda; None se o DB falhar."""
    factory = get_coordination_session_factory()
    async with factory() as session:
        row = (await session.execute(_VERSION_SQL)).first()
    if row is None:
        return None
    return "|".join("" if v is None else str(v) for v in row)


async def coordination_poller_loop(interval: float = POLL_INTERVAL_SECONDS) -> None:
    """Loop: a cada `interval`, se há cliente no feed e a versão mudou, broadcast."""
    last: str | None = None
    while True:
        try:
            if manager.coordination_client_count() > 0:
                version = await current_version()
                if version is not None and version != last:
                    last = version
                    await manager.broadcast_coordination(
                        {"type": "coordination_update", "version": version}
                    )
        except asyncio.CancelledError:
            raise
        except Exception as e:  # :5433 fora / erro transitório — não derruba o loop
            logger.warning("coordination poller: %s", e)
        await asyncio.sleep(interval)
