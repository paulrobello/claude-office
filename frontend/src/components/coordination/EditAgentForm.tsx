"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { patchAgent, type CoordAgent } from "./coordinationApi";

const MODEL_OPTIONS = [
  { value: "", label: "Default" },
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

const EFFORT_OPTIONS = [
  { value: "", label: "Effort: default" },
  { value: "low", label: "low (mín)" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "xhigh (Opus)" },
  { value: "max", label: "max (Opus)" },
];

export function EditAgentForm({
  agent,
  onSaved,
}: {
  agent: CoordAgent;
  onSaved?: () => void;
}): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(agent.role);
  const [projetos, setProjetos] = useState(agent.projetos.join(", "));
  const [mode, setMode] = useState<"on-demand" | "persistent-24-7">(
    agent.mode === "persistent-24-7" ? "persistent-24-7" : "on-demand",
  );
  const [model, setModel] = useState(agent.model ?? "");
  const [effort, setEffort] = useState(agent.effort_level ?? "");
  const [thinking, setThinking] = useState(agent.thinking_enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      await patchAgent(agent.nome, {
        role: role.trim(),
        projetos: projetos
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        mode,
        model: model || null,
        effort_level: effort || null,
        thinking_enabled: thinking,
      });
      setOpen(false);
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "erro");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm flex items-center gap-1"
      >
        <Pencil size={14} /> editar
      </button>
    );
  }
  return (
    <div className="rounded border border-neutral-700 p-3 space-y-2">
      <div className="flex justify-between">
        <span className="font-medium">{agent.nome}</span>
        <button onClick={() => setOpen(false)}>
          <X size={14} />
        </button>
      </div>
      <input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="função"
        className="w-full bg-neutral-900 rounded px-2 py-1 text-sm"
      />
      <input
        value={projetos}
        onChange={(e) => setProjetos(e.target.value)}
        placeholder="projetos (vírgula)"
        className="w-full bg-neutral-900 rounded px-2 py-1 text-sm"
      />
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as typeof mode)}
        className="bg-neutral-900 rounded px-2 py-1 text-sm"
      >
        <option value="on-demand">on-demand</option>
        <option value="persistent-24-7">persistent-24-7</option>
      </select>
      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="bg-neutral-900 rounded px-2 py-1 text-sm"
      >
        {MODEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={effort}
        onChange={(e) => setEffort(e.target.value)}
        className="bg-neutral-900 rounded px-2 py-1 text-sm"
      >
        {EFFORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={thinking}
          onChange={(e) => setThinking(e.target.checked)}
        />
        thinking
      </label>
      <p className="text-[11px] text-neutral-500">xhigh/max só Opus.</p>
      {err && <div className="text-xs text-red-400">{err}</div>}
      <button
        onClick={save}
        disabled={busy}
        className="rounded bg-blue-600 px-3 py-1 text-sm disabled:opacity-50"
      >
        salvar
      </button>
    </div>
  );
}
