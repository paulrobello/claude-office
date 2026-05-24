"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { CoordinationNav } from "@/components/coordination/CoordinationNav";
import { useCoordinationPoll } from "@/components/coordination/useCoordinationPoll";
import { fetchDashboard } from "@/components/coordination/coordinationApi";

type Period = "day" | "week" | "month";

const RUN_COLORS: Record<string, string> = {
  running: "text-sky-400",
  success: "text-emerald-400",
  error: "text-rose-400",
  timeout: "text-amber-400",
};

function MetricCard({
  label,
  value,
  accent = "text-white",
}: {
  label: string;
  value: number | string;
  accent?: string;
}): React.ReactNode {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function fmtBucket(iso: string, period: Period): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (period === "month")
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  return d.toLocaleDateString();
}

export default function DashboardPage(): React.ReactNode {
  const [period, setPeriod] = useState<Period>("day");

  const qs = useMemo(() => `?period=${period}`, [period]);

  const { data, loading, unavailable, error, refetch } = useCoordinationPoll(
    () => fetchDashboard(qs),
    [qs],
  );

  const maxBucket = useMemo(
    () =>
      data
        ? Math.max(1, ...data.closedByPeriod.buckets.map((b) => b.n))
        : 1,
    [data],
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

      <div className="flex items-center gap-2 mb-4">
        <div className="flex rounded border border-slate-700 overflow-hidden">
          {(["day", "week", "month"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-bold transition-colors ${
                period === p
                  ? "bg-sky-500/20 text-sky-400"
                  : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              {p === "day" ? "Dia" : p === "week" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
        <button
          onClick={() => void refetch()}
          className="flex items-center gap-1 px-3 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded text-sm font-bold transition-colors"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
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
        <div className="flex flex-col gap-6">
          {/* GitHub vs banco */}
          <section>
            <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-2">
              GitHub (issues)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MetricCard
                label="Abertas"
                value={data.github.open}
                accent="text-emerald-400"
              />
              <MetricCard label="Fechadas" value={data.github.closed} />
              <MetricCard label="Total" value={data.github.total} />
            </div>
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-2">
              Banco (execução dos agentes)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <MetricCard
                label="Claims ativos"
                value={data.database.activeClaims}
                accent="text-amber-400"
              />
              {(["success", "error", "timeout", "running"] as const).map((st) => (
                <MetricCard
                  key={st}
                  label={`runs ${st}`}
                  value={data.database.runsByStatus[st] ?? 0}
                  accent={RUN_COLORS[st]}
                />
              ))}
            </div>
          </section>

          {/* Fechadas por período */}
          <section>
            <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-2">
              Fechadas por período
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col gap-1.5">
              {data.closedByPeriod.buckets.length === 0 && (
                <span className="text-slate-600 text-sm">Sem dados.</span>
              )}
              {data.closedByPeriod.buckets.map((b) => (
                <div key={b.period} className="flex items-center gap-2 text-xs">
                  <span className="w-28 text-slate-400 shrink-0">
                    {fmtBucket(b.period, period)}
                  </span>
                  <div className="flex-grow bg-slate-800 rounded h-4 overflow-hidden">
                    <div
                      className="bg-sky-500/60 h-full"
                      style={{ width: `${(b.n / maxBucket) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-slate-300">{b.n}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Em aberto por project + saúde */}
          <div className="grid md:grid-cols-2 gap-6">
            <section>
              <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-2">
                Em aberto por project
              </h2>
              <div className="bg-slate-900 border border-slate-800 rounded-lg divide-y divide-slate-800">
                {data.openByProject.map((p) => (
                  <div
                    key={p.project}
                    className="flex justify-between px-3 py-1.5 text-sm"
                  >
                    <span className="text-slate-300">{p.project}</span>
                    <span className="text-slate-500 font-mono">{p.n}</span>
                  </div>
                ))}
                {data.openByProject.length === 0 && (
                  <div className="px-3 py-2 text-slate-600 text-sm">Sem dados.</div>
                )}
              </div>
            </section>

            <section>
              <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-2">
                Saúde (coletor / cron)
              </h2>
              <div className="bg-slate-900 border border-slate-800 rounded-lg divide-y divide-slate-800">
                {data.health.map((h) => (
                  <div
                    key={h.component}
                    className="flex justify-between items-center px-3 py-1.5 text-sm"
                  >
                    <span className="text-slate-300">{h.component}</span>
                    <span className="flex items-center gap-2">
                      <span
                        className={
                          h.status === "success"
                            ? "text-emerald-400"
                            : h.status === "error"
                              ? "text-rose-400"
                              : "text-amber-400"
                        }
                      >
                        {h.status}
                      </span>
                      {h.min_ago !== null && (
                        <span className="text-slate-600 text-xs">
                          {h.min_ago}min atrás
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                {data.health.length === 0 && (
                  <div className="px-3 py-2 text-slate-600 text-sm">Sem dados.</div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
