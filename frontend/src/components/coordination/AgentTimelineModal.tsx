"use client";

import { useEffect, useState } from "react";
import { fetchRuns, type CoordRun, type CoordAgent } from "./coordinationApi";

function fmtTime(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const DOT: Record<string, string> = {
  running: "bg-sky-400",
  success: "bg-emerald-400",
  error: "bg-rose-400",
  timeout: "bg-amber-400",
};

/** Timeline de runs do(s) projeto(s) de um agente (#382 AC#3). Reusa /agent-runs. */
export function AgentTimelineModal({
  agent,
  onClose,
}: {
  agent: CoordAgent;
  onClose: () => void;
}): React.ReactNode {
  const [runs, setRuns] = useState<CoordRun[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await Promise.all(
          agent.projetos.map((p) =>
            fetchRuns(`?project=${encodeURIComponent(p)}&limit=20`),
          ),
        );
        if (!alive) return;
        const merged = all
          .flatMap((r) => r.runs)
          .sort((a, b) => b.started_at.localeCompare(a.started_at))
          .slice(0, 20);
        setRuns(merged);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "erro");
      }
    })();
    return () => {
      alive = false;
    };
  }, [agent]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-700 bg-neutral-950 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-white">
            Timeline — {agent.nome}{" "}
            <span className="text-xs text-slate-500">
              ({agent.projetos.join(", ") || "sem projeto"})
            </span>
          </h3>
          <button
            className="text-slate-400 hover:text-slate-200"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {err && <p className="text-rose-400 text-sm">Erro: {err}</p>}
        {!err && runs.length === 0 && (
          <p className="text-slate-500 text-sm">Sem runs.</p>
        )}
        <ol className="space-y-2">
          {runs.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-2 border-l border-slate-800 pl-3 text-sm"
            >
              <span
                className={`mt-1 h-2 w-2 rounded-full ${DOT[r.status] ?? "bg-slate-500"}`}
              />
              <div>
                <div className="text-slate-300">
                  {r.status} · {r.source_ref ?? "—"}{" "}
                  {r.issue_title ? (
                    <span className="text-slate-500">— {r.issue_title}</span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500">
                  {fmtTime(r.started_at)} → {fmtTime(r.ended_at)}
                  {r.duration_seconds !== null
                    ? ` (${Math.round(r.duration_seconds)}s)`
                    : ""}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
