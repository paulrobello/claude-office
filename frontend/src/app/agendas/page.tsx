"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarClock } from "lucide-react";
import {
  fetchAgents,
  type CoordAgent,
} from "@/components/coordination/coordinationApi";
import { AgendaEditor } from "@/components/coordination/AgendaEditor";
import { AddAgendaRow } from "@/components/coordination/AddAgendaRow";
import { CoordinationNav } from "@/components/coordination/CoordinationNav";
import { partitionAgendas } from "@/utils/agendas";

export default function AgendasPage(): React.ReactNode {
  const [agents, setAgents] = useState<CoordAgent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { agents } = await fetchAgents();
      setAgents(agents);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    }
  }, []);

  useEffect(() => {
    // load() faz setState só após o await (não síncrono no corpo do efeito):
    // fetch-on-mount legítimo, sem cascading render. Padrão do #334.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const { scheduled, eligible } = partitionAgendas(agents);
  const roleCounts = scheduled.reduce<Record<string, number>>((acc, a) => {
    acc[a.role] = (acc[a.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main
      className="min-h-screen text-[#ece9f5] px-6 pb-16 pt-6"
      style={{
        background:
          "radial-gradient(1200px 600px at 15% -10%, rgba(168,85,247,0.18), transparent 60%)," +
          "radial-gradient(900px 500px at 90% 0%, rgba(236,72,153,0.12), transparent 55%)," +
          "#07060d",
      }}
    >
      <header className="flex items-center gap-4 mb-6">
        <div
          className="w-12 h-12 rounded-2xl grid place-items-center shadow-[0_0_24px_rgba(168,85,247,0.6)]"
          style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
        >
          <CalendarClock size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-[#c084fc] to-[#f0abfc] bg-clip-text text-transparent">
            Agendas dos agentes
          </h1>
          <p className="text-[#9a93b3] text-[13px]">
            Liga/desliga e define o horário (cron) de cada agente. Mudanças
            entram no crontab em ~5 min (reconcile).
          </p>
        </div>
      </header>

      <CoordinationNav />

      {error && (
        <div className="p-4 mb-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-sm">
          erro: {error}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3.5 mt-5">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: "#34d399", boxShadow: "0 0 8px #34d399" }}
        />
        <span className="text-[15px] font-bold">Com agenda</span>
      </div>
      <div className="space-y-3">
        {scheduled.map((a) => (
          <AgendaEditor
            key={a.nome}
            agent={a}
            duplicateRole={roleCounts[a.role] > 1}
            onSaved={load}
          />
        ))}
        {scheduled.length === 0 && !error && (
          <div className="text-sm text-[#6b6485]">
            Nenhum agente com agenda ativa.
          </div>
        )}
      </div>

      {eligible.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-2 mb-3.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: "#9a93b3" }}
            />
            <span className="text-[15px] font-bold text-[#9a93b3]">
              Sem agenda
            </span>
          </div>
          <div className="space-y-2">
            {eligible.map((a) => (
              <AddAgendaRow
                key={a.nome}
                agent={a}
                duplicateRole={(roleCounts[a.role] ?? 0) > 0}
                onSaved={load}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
