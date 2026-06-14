"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { AgendaEditor } from "./AgendaEditor";
import type { CoordAgent } from "./coordinationApi";

/** Linha de um agente cron-capable SEM agenda: botão que revela o AgendaEditor
 *  (com default). Ao salvar, o AgendaEditor faz patchAgent(cron_expr) e chama onSaved. */
export function AddAgendaRow({
  agent,
  duplicateRole,
  onSaved,
}: {
  agent: CoordAgent;
  duplicateRole: boolean;
  onSaved?: () => void;
}): React.ReactNode {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-dashed border-[rgba(168,85,247,0.3)] bg-[rgba(20,14,38,0.4)] px-4 py-2.5 text-sm">
        <span className="text-[#ece9f5]">
          {agent.nome} <span className="text-[#9a93b3]">({agent.role})</span> —
          sem agenda
        </span>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-[#38bdf8] hover:text-[#7dd3fc] font-semibold"
        >
          <CalendarPlus size={14} /> criar agenda
        </button>
      </div>
    );
  }
  return (
    <AgendaEditor
      agent={agent}
      duplicateRole={duplicateRole}
      onSaved={onSaved}
    />
  );
}
