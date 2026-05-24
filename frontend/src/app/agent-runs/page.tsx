"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { CoordinationNav } from "@/components/coordination/CoordinationNav";
import { useCoordinationPoll } from "@/components/coordination/useCoordinationPoll";
import { fetchRuns } from "@/components/coordination/coordinationApi";

const STATUS_COLORS: Record<string, string> = {
  running: "text-sky-400",
  success: "text-emerald-400",
  error: "text-rose-400",
  timeout: "text-amber-400",
};

function fmtTime(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function fmtDuration(sec: number | null): string {
  if (sec === null) return "—";
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export default function AgentRunsPage(): React.ReactNode {
  const [status, setStatus] = useState("");
  const [project, setProject] = useState("");
  const [mechanism, setMechanism] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (project) p.set("project", project);
    if (mechanism) p.set("mechanism", mechanism);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [status, project, mechanism]);

  const { data, loading, unavailable, error, refetch } = useCoordinationPoll(
    () => fetchRuns(qs),
    [qs],
  );

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
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
        >
          <option value="">Todos status</option>
          <option value="running">running</option>
          <option value="success">success</option>
          <option value="error">error</option>
          <option value="timeout">timeout</option>
        </select>
        <select
          value={mechanism}
          onChange={(e) => setMechanism(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
        >
          <option value="">Todos mecanismos</option>
          <option value="cron">cron</option>
          <option value="interativo">interativo</option>
        </select>
        <input
          placeholder="project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm w-48"
        />
        <button
          onClick={() => void refetch()}
          className="flex items-center gap-1 px-3 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded text-sm font-bold transition-colors"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
        {data && (
          <span className="text-xs text-slate-500">{data.runs.length} runs</span>
        )}
      </div>

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
      {loading && !data && <p className="text-slate-500 text-sm">Carregando…</p>}

      {data && !unavailable && (
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-left bg-slate-900/50">
              <tr>
                <th className="px-3 py-2 font-bold">Issue</th>
                <th className="px-3 py-2 font-bold">Project</th>
                <th className="px-3 py-2 font-bold">Agente</th>
                <th className="px-3 py-2 font-bold">Mec.</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold">Início</th>
                <th className="px-3 py-2 font-bold">Duração</th>
                <th className="px-3 py-2 font-bold">Exit</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-900 hover:bg-slate-900/40"
                >
                  <td className="px-3 py-2 font-mono">
                    {r.source_ref ? (
                      r.issue_url ? (
                        <a
                          href={r.issue_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-300 hover:text-sky-400 flex items-center gap-1"
                        >
                          {r.source_ref} <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="text-slate-400">{r.source_ref}</span>
                      )
                    ) : (
                      <span className="text-slate-600">sem issue</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{r.project ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-400">{r.agent ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{r.mechanism ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={STATUS_COLORS[r.status] ?? "text-slate-300"}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                    {fmtTime(r.started_at)}
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    {fmtDuration(r.duration_seconds)}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-500">
                    {r.exit_code ?? "—"}
                  </td>
                </tr>
              ))}
              {data.runs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-600">
                    Nenhum run encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
