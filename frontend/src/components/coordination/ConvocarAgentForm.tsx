"use client";

import { useMemo, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { type CoordAgent, createRequest } from "./coordinationApi";

/**
 * Convocação do CEO (#407 / EPIC #395). Grava um pedido na caixa (`requests`) via
 * POST /coordination/requests — produtor que acende o detector de gargalo (hoje
 * cego por falta de produtor). Alvo por FUNÇÃO (to_role, vai pro pool) ou por
 * AGENTE específico (to_agent). from_kind=human/from_ref=ceo (definido no backend).
 */
export function ConvocarAgentForm({
  agents,
  onCreated,
}: {
  agents: CoordAgent[];
  onCreated?: () => void;
}): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"role" | "agent">("role");
  const [role, setRole] = useState("");
  const [agent, setAgent] = useState("");
  const [kind, setKind] = useState<"work" | "question" | "meeting">("work");
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roles = useMemo(
    () => Array.from(new Set(agents.map((a) => a.role))).sort(),
    [agents],
  );

  async function submit(): Promise<void> {
    const target = mode === "role" ? role.trim() : agent.trim();
    if (!target) {
      setError(mode === "role" ? "escolha uma função" : "escolha um agente");
      return;
    }
    setSubmitting(true);
    setError(null);
    setOkMsg(null);
    try {
      const r = await createRequest({
        to_role: mode === "role" ? target : undefined,
        to_agent: mode === "agent" ? target : undefined,
        kind,
        payload: motivo.trim() ? { motivo: motivo.trim() } : undefined,
      });
      setOkMsg(`pedido #${r.request.id} enfileirado`);
      setMotivo("");
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
        className="flex items-center gap-1 px-3 py-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded text-sm font-bold transition-colors"
      >
        <Megaphone size={14} /> Convocar agente
      </button>
    );
  }

  return (
    <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/40 space-y-2 w-full">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-200">Convocar agente</span>
        <button
          onClick={() => setOpen(false)}
          className="text-slate-500 hover:text-slate-300"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "role" | "agent")}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
        >
          <option value="role">por função</option>
          <option value="agent">por agente</option>
        </select>
        {mode === "role" ? (
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm w-56"
          >
            <option value="">— função —</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm w-56"
          >
            <option value="">— agente —</option>
            {agents.map((a) => (
              <option key={a.nome} value={a.nome}>
                {a.nome} ({a.role})
              </option>
            ))}
          </select>
        )}
        <select
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as "work" | "question" | "meeting")
          }
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
        >
          <option value="work">work</option>
          <option value="question">question</option>
          <option value="meeting">meeting</option>
        </select>
        <input
          placeholder="motivo (opcional)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm flex-1 min-w-[12rem]"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => void submit()}
          disabled={submitting}
          className="px-3 py-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded text-sm font-bold transition-colors disabled:opacity-50"
        >
          {submitting ? "Enviando…" : "Enfileirar pedido"}
        </button>
        {okMsg && <span className="text-xs text-emerald-400">{okMsg}</span>}
        {error && <span className="text-xs text-rose-400">{error}</span>}
      </div>
    </div>
  );
}
