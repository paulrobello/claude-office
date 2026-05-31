"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { CoordinationNav } from "@/components/coordination/CoordinationNav";
import { ConvocarAgentForm } from "@/components/coordination/ConvocarAgentForm";
import { HireAgentForm } from "@/components/coordination/HireAgentForm";
import { EditAgentForm } from "@/components/coordination/EditAgentForm";
import { useCoordinationPoll } from "@/components/coordination/useCoordinationPoll";
import {
  fetchAgents,
  archiveAgent,
  restoreAgent,
  deleteAgent,
  type CoordAgent,
} from "@/components/coordination/coordinationApi";

// status derivado pelo backend (busy = tem claim ativo; senão idle/offline do roster)
const STATUS_COLORS: Record<string, string> = {
  busy: "text-emerald-400",
  idle: "text-sky-400",
  offline: "text-slate-500",
};

function fmtTime(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function AgentsPage(): React.ReactNode {
  const [role, setRole] = useState("");
  const [archived, setArchived] = useState<CoordAgent[]>([]);
  const [archivedErr, setArchivedErr] = useState<string | null>(null);

  const qs = useMemo(
    () => (role ? `?role=${encodeURIComponent(role)}` : ""),
    [role],
  );

  const { data, loading, unavailable, error, refetch } = useCoordinationPoll(
    () => fetchAgents(qs),
    [qs],
  );

  const loadArchived = useCallback(async () => {
    try {
      const res = await fetchAgents("?include_archived=true");
      setArchived(res.agents.filter((a) => a.archived_at !== null));
      setArchivedErr(null);
    } catch (e) {
      setArchivedErr(e instanceof Error ? e.message : "erro");
    }
  }, []);

  useEffect(() => {
    // loadArchived() faz setState só após o await (não síncrono no corpo do efeito):
    // fetch-on-mount legítimo, sem cascading render. Padrão do #334.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadArchived();
  }, [loadArchived]);

  async function reload(): Promise<void> {
    await Promise.all([refetch(), loadArchived()]);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="text-orange-500">Claude</span> Coordenação
        </h1>
        <Link
          href="/"
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft size={14} /> Voltar ao escritório
        </Link>
      </div>

      <CoordinationNav />

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input
          placeholder="role (ex.: dev-front)"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm w-56"
        />
        <button
          onClick={() => void refetch()}
          className="flex items-center gap-1 px-3 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded text-sm font-bold transition-colors"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
        {data && (
          <span className="text-xs text-slate-500">
            {data.agents.length} agentes ·{" "}
            {data.agents.filter((a) => a.status === "busy").length} ocupados
          </span>
        )}
      </div>

      {data && !unavailable && (
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <ConvocarAgentForm
              agents={data.agents}
              onCreated={() => void refetch()}
            />
            <HireAgentForm onCreated={() => void refetch()} />
          </div>
        </div>
      )}

      {unavailable && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded text-sm">
          DB de coordenação (:5433) indisponível.
        </div>
      )}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded text-sm">
          Erro ao carregar: {error}
        </div>
      )}
      {loading && !data && (
        <p className="text-slate-500 text-sm">Carregando…</p>
      )}

      {data && !unavailable && (
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-left bg-slate-900/50">
              <tr>
                <th className="px-3 py-2 font-bold">Agente</th>
                <th className="px-3 py-2 font-bold">Função</th>
                <th className="px-3 py-2 font-bold">Modo</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold">Claims</th>
                <th className="px-3 py-2 font-bold">Fila</th>
                <th className="px-3 py-2 font-bold">Projetos</th>
                <th className="px-3 py-2 font-bold">Último ativo</th>
                <th className="px-3 py-2 font-bold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.agents.map((a) => (
                <tr
                  key={a.nome}
                  className="border-t border-slate-900 hover:bg-slate-900/40"
                >
                  <td className="px-3 py-2 font-mono text-slate-200">
                    {a.nome}
                    {a.model && (
                      <span className="ml-2 rounded bg-indigo-900 px-1.5 py-0.5 text-xs">
                        {a.model}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{a.role}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        a.mode === "persistent-24-7"
                          ? "text-amber-400"
                          : "text-slate-500"
                      }
                    >
                      {a.mode === "persistent-24-7" ? "24/7" : "on-demand"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={STATUS_COLORS[a.status] ?? "text-slate-300"}
                    >
                      ● {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-400">
                    {a.active_claims}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-400">
                    {a.queued_requests > 0 ? (
                      <span className="text-amber-400">
                        {a.queued_requests}
                      </span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {a.projetos.length ? a.projetos.join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                    {fmtTime(a.last_active_at)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <EditAgentForm agent={a} onSaved={() => void reload()} />
                      <button
                        className="text-sm text-amber-400 text-left"
                        onClick={async () => {
                          if (!confirm(`Arquivar ${a.nome}?`)) return;
                          try {
                            await archiveAgent(a.nome);
                            void reload();
                          } catch (e) {
                            alert(e instanceof Error ? e.message : "erro");
                          }
                        }}
                      >
                        arquivar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.agents.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-6 text-center text-slate-600"
                  >
                    Roster vazio — contrate agentes (INSERT em agents).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {/* ── Arquivados ── */}
      {(archived.length > 0 || archivedErr) && (
        <div className="mt-6">
          <h2 className="text-base font-semibold text-slate-400 mb-2">
            Arquivados
          </h2>
          {archivedErr && (
            <div className="text-sm text-rose-400 mb-2">
              Erro ao carregar arquivados: {archivedErr}
            </div>
          )}
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-left bg-slate-900/50">
                <tr>
                  <th className="px-3 py-2 font-bold">Agente</th>
                  <th className="px-3 py-2 font-bold">Função</th>
                  <th className="px-3 py-2 font-bold">Modo</th>
                  <th className="px-3 py-2 font-bold">Projetos</th>
                  <th className="px-3 py-2 font-bold">Arquivado em</th>
                  <th className="px-3 py-2 font-bold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {archived.map((a) => (
                  <tr
                    key={a.nome}
                    className="border-t border-slate-900 opacity-60 hover:opacity-100"
                  >
                    <td className="px-3 py-2 font-mono text-slate-400">
                      {a.nome}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{a.role}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {a.mode === "persistent-24-7" ? "24/7" : "on-demand"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {a.projetos.length ? a.projetos.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                      {fmtTime(a.archived_at)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          className="text-sm text-emerald-400"
                          onClick={async () => {
                            try {
                              await restoreAgent(a.nome);
                              void reload();
                            } catch (e) {
                              alert(e instanceof Error ? e.message : "erro");
                            }
                          }}
                        >
                          reativar
                        </button>
                        <button
                          className="text-sm text-red-400"
                          onClick={async () => {
                            if (
                              !confirm(
                                `Excluir DEFINITIVAMENTE ${a.nome}? Irreversível.`,
                              )
                            )
                              return;
                            try {
                              await deleteAgent(a.nome);
                              void reload();
                            } catch (e) {
                              alert(e instanceof Error ? e.message : "erro");
                            }
                          }}
                        >
                          excluir de vez
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
