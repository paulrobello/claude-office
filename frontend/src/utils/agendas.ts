import type { CoordAgent } from "@/components/coordination/coordinationApi";

/** Papéis fixos que têm loop-script (cron-capable) — espelha ROLE_LOOP_SCRIPT do backend. */
export const CRON_ROLES = [
  "office-manager",
  "triador",
  "qa",
  "devops",
] as const;

/** Role tem loop-script no backend? Espelha ROLE_LOOP_SCRIPT: os fixos acima MAIS
 *  qualquer role `dev-*` (dev-front/dev-api/dev-trackers/dev-alert — Fase 1 dos
 *  dev-loops por projeto). Sem isto, os agentes dev não apareciam na tela de
 *  Agendas e não dava pra ligá-los. */
export function isCronCapableRole(role: string): boolean {
  return (
    (CRON_ROLES as readonly string[]).includes(role) || role.startsWith("dev-")
  );
}

export interface AgendaPartition {
  scheduled: CoordAgent[]; // cron-capable COM cron_expr
  eligible: CoordAgent[]; // cron-capable SEM cron_expr (podem ganhar agenda)
}

/** Separa os agentes cron-capable em "já agendados" e "elegíveis a criar agenda".
 *  Agentes de papéis sem loop ficam fora dos dois. (Arquivados nem chegam aqui:
 *  o GET default já os exclui.) */
export function partitionAgendas(agents: CoordAgent[]): AgendaPartition {
  const cron = agents.filter((a) => isCronCapableRole(a.role));
  return {
    scheduled: cron.filter((a) => a.cron_expr),
    eligible: cron.filter((a) => !a.cron_expr),
  };
}
