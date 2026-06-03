"use client";

import { fetchAgents } from "./coordinationApi";
import { useCoordinationPoll } from "./useCoordinationPoll";

const CRON_ROLES = new Set(["gerente", "triador", "devops", "qa"]);

/**
 * Badge "⏸ <nome> pausado" quando um agente de coordenação (gerente/triador/devops/qa)
 * está com enabled=false. Usa GET /agents (poll lento, sem nova rota).
 */
export function PausedAgentsIndicator(): React.ReactNode {
  const { data } = useCoordinationPoll(fetchAgents, []);

  const paused =
    data?.agents.filter(
      (a) => CRON_ROLES.has(a.role) && a.enabled === false,
    ) ?? [];

  if (paused.length === 0) return null;

  const label =
    paused.length === 1
      ? `⏸ ${paused[0].nome} pausado`
      : `⏸ ${paused.length} agentes pausados`;

  const names = paused.map((a) => a.nome).join(", ");

  return (
    <span
      className="ml-2 px-3 py-1 rounded-full bg-amber-600/80 text-white text-xs font-bold"
      title={`Agentes pausados (enabled=false): ${names}`}
    >
      {label}
    </span>
  );
}
