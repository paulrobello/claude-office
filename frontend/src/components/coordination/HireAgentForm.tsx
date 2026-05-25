"use client";

import { useState } from "react";
import { UserPlus, X } from "lucide-react";
import { createAgent } from "./coordinationApi";

/**
 * Contratar agente (#408 / EPIC #395). Faz upsert no roster (`agents`) via
 * POST /coordination/agents. Caminho do cockpit pra contratação manual pelo CEO —
 * par do hire-executor (lado coletor, que aplica a decisão HITL do detector).
 */
export function HireAgentForm({
  onCreated,
}: {
  onCreated?: () => void;
}): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [role, setRole] = useState("");
  const [projetos, setProjetos] = useState("");
  const [mode, setMode] = useState<"on-demand" | "persistent-24-7">("on-demand");
  const [submitting, setSubmitting] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!nome.trim() || !role.trim()) {
      setError("nome e função obrigatórios");
      return;
    }
    setSubmitting(true);
    setError(null);
    setOkMsg(null);
    try {
      const r = await createAgent({
        nome: nome.trim(),
        role: role.trim(),
        projetos: projetos
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        mode,
      });
      setOkMsg(`${r.agent.nome} no roster (${r.agent.mode})`);
      setNome("");
      setProjetos("");
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-sm font-bold transition-colors"
      >
        <UserPlus size={14} /> Contratar
      </button>
    );
  }

  return (
    <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/40 space-y-2 w-full">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-200">Contratar agente</span>
        <button
          onClick={() => setOpen(false)}
          className="text-slate-500 hover:text-slate-300"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          placeholder="nome (ex.: DEV-FRONT-2)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm w-48"
        />
        <input
          placeholder="função (ex.: dev-front)"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm w-44"
        />
        <input
          placeholder="projetos (vírgula)"
          value={projetos}
          onChange={(e) => setProjetos(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm flex-1 min-w-[12rem]"
        />
        <select
          value={mode}
          onChange={(e) =>
            setMode(e.target.value as "on-demand" | "persistent-24-7")
          }
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
        >
          <option value="on-demand">on-demand</option>
          <option value="persistent-24-7">24/7</option>
        </select>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => void submit()}
          disabled={submitting}
          className="px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-sm font-bold transition-colors disabled:opacity-50"
        >
          {submitting ? "Contratando…" : "Contratar"}
        </button>
        {okMsg && <span className="text-xs text-emerald-400">{okMsg}</span>}
        {error && <span className="text-xs text-rose-400">{error}</span>}
      </div>
    </div>
  );
}
