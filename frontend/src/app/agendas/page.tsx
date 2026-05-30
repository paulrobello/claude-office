"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchAgents, type CoordAgent } from "@/components/coordination/coordinationApi";
import { AgendaEditor } from "@/components/coordination/AgendaEditor";
import { AddAgendaRow } from "@/components/coordination/AddAgendaRow";
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

  useEffect(() => { void load(); }, [load]);

  const { scheduled, eligible } = partitionAgendas(agents);
  const roleCounts = scheduled.reduce<Record<string, number>>((acc, a) => {
    acc[a.role] = (acc[a.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <h1 className="text-xl font-semibold">Agendas dos agentes</h1>
      <p className="text-sm text-neutral-400">
        Edita os horários de execução (cron). As mudanças entram no crontab em até ~5 min (reconcile).
      </p>
      {error && <div className="text-sm text-red-400">erro: {error}</div>}

      {scheduled.map((a) => (
        <AgendaEditor key={a.nome} agent={a} duplicateRole={roleCounts[a.role] > 1} onSaved={load} />
      ))}
      {scheduled.length === 0 && !error && (
        <div className="text-sm text-neutral-500">Nenhum agente com agenda ativa.</div>
      )}

      {eligible.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="text-base font-semibold text-neutral-400">Sem agenda</h2>
          {eligible.map((a) => (
            <AddAgendaRow
              key={a.nome}
              agent={a}
              duplicateRole={(roleCounts[a.role] ?? 0) > 0}
              onSaved={load}
            />
          ))}
        </section>
      )}
    </main>
  );
}
