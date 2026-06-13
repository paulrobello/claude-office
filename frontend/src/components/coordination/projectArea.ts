/**
 * Mapa canônico Projeto (roster `agent.projetos`) → área (#826).
 *
 * Fonte ÚNICA espelhando o mapa de áreas do dev-loop. Antes existia duplicado
 * no dashboard (formato `area:front`) e nos filtros do /tasks (formato `front`),
 * e adicionar/renomear um projeto exigia editar os dois em formatos divergentes
 * → drift silencioso. Aqui o curto é a fonte e o prefixado é derivado dele.
 */

/** Projeto → área CURTA (`front`, sem prefixo `area:`). */
export const PROJECT_TO_AREA_SHORT: Record<string, string> = {
  "hmtrack-front": "front",
  "hmtrack-api-py": "api",
  "hmtrack-trackers": "trackers",
  "hmtrack-alert-system": "alert-system",
  "hmtrack-app": "mobile",
  HMTrackApp: "mobile",
  "banco-dados": "db",
  "hmtrack-documentacao": "db",
  "hmtrack-whatsapp": "whatsapp",
  "claude-office": "office",
};

/** Projeto → label `area:*` (formato das labels das tasks), derivado do curto. */
export const PROJECT_TO_AREA_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(PROJECT_TO_AREA_SHORT).map(([proj, short]) => [
    proj,
    `area:${short}`,
  ]),
);
