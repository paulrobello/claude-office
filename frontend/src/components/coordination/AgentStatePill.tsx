import type React from "react";

/** Pill canônico de estado do agente no cockpit: Pausado / Ocupado / Livre.
 *  Extraído do board (#839) pra ser reusado em todos os pontos de Play do agente
 *  (board, AgendaEditor, modal de PR) — assim o sucesso do Play reflete 'Em
 *  execução' (Ocupado) com o MESMO badge, em vez de uma label 'iniciado' avulsa. */
export function AgentStatePill({
  enabled,
  busy,
}: {
  enabled: boolean;
  busy: boolean;
}): React.ReactNode {
  const pill = !enabled
    ? {
        label: "Pausado",
        color: "#ec4899",
        tip: "desativado na Agenda (enabled=false)",
      }
    : busy
      ? { label: "Ocupado", color: "#fbbf24", tip: "tem claim/dispatch ativo" }
      : { label: "Livre", color: "#34d399", tip: "ativo e ocioso" };
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md"
      style={{ color: pill.color, background: `${pill.color}1f` }}
      title={pill.tip}
    >
      {pill.label}
    </span>
  );
}
