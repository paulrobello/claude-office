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
      <div className="flex items-center justify-between rounded-lg border border-dashed border-neutral-700 px-4 py-2 text-sm">
        <span className="text-neutral-300">
          {agent.nome} <span className="text-neutral-500">({agent.role})</span> — sem agenda
        </span>
        <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-blue-400">
          <CalendarPlus size={14} /> criar agenda
        </button>
      </div>
    );
  }
  return <AgendaEditor agent={agent} duplicateRole={duplicateRole} onSaved={onSaved} />;
}
