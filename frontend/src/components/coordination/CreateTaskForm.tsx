"use client";

import { useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import { createTask } from "./coordinationApi";

/**
 * Form de criação de task (#383) — estilo "abrir issue no GitHub".
 * Cria uma issue REAL no agents-ia via backend (`gh issue create`). As LABELS
 * dirigem o fluxo autônomo (disposição + área obrigatórias), então o form as
 * estrutura em vez de texto livre. createTask já aceita labels[] — zero backend.
 */

type Disposicao = "afk" | "hitl" | "epic" | "";

const DISPOSICAO_OPTIONS: { value: Exclude<Disposicao, "">; hint: string }[] = [
  { value: "afk", hint: "autônomo, zero decisão" },
  { value: "hitl", hint: "precisa decisão humana" },
  { value: "epic", hint: "umbrella, não executa" },
];

// área (label) → projeto (prefixo do título [projeto], via backend `agent`)
const AREA_OPTIONS: { value: string; project: string; label: string }[] = [
  { value: "area:api", project: "hmtrack-api-py", label: "API Python/FastAPI" },
  { value: "area:front", project: "hmtrack-front", label: "Frontend Angular" },
  {
    value: "area:trackers",
    project: "hmtrack-trackers",
    label: "Rastreadores GPS",
  },
  {
    value: "area:alert-system",
    project: "hmtrack-alert-system",
    label: "Workers de alertas",
  },
  { value: "area:db", project: "banco-dados", label: "Schema SQL Server" },
  { value: "area:mobile", project: "HMTrackApp", label: "App React Native" },
  {
    value: "area:office",
    project: "claude-office",
    label: "claude-office (cockpit)",
  },
  { value: "area:coordination", project: "gerente", label: "Infra de agentes" },
  {
    value: "area:whatsapp",
    project: "hmtrack-whatsapp",
    label: "hmtrack-whatsapp",
  },
];

const EXTRA_LABELS: { value: string; cls: string; hint?: string }[] = [
  { value: "bug", cls: "border-rose-500/50 text-rose-400 bg-rose-500/10" },
  {
    value: "security",
    cls: "border-amber-500/50 text-amber-400 bg-amber-500/10",
  },
  {
    value: "fila:topo",
    cls: "border-sky-500/50 text-sky-300 bg-sky-500/10",
    hint: "fura a fila",
  },
  {
    value: "fila:fim",
    cls: "border-slate-500/50 text-slate-400 bg-slate-500/10",
    hint: "despriorizada",
  },
];

export function CreateTaskForm({
  onCreated,
}: {
  onCreated?: () => void;
}): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [disposicao, setDisposicao] = useState<Disposicao>("");
  const [areas, setAreas] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const builtLabels = [
    disposicao,
    ...Array.from(areas),
    ...Array.from(extras),
  ].filter(Boolean);
  const canSubmit =
    Boolean(title.trim()) && Boolean(disposicao) && areas.size > 0;
  // afk multi-área: cada dev-loop daquela área puxa a MESMA issue → colisão.
  const afkMulti = disposicao === "afk" && areas.size > 1;

  function toggleArea(val: string): void {
    setAreas((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  }

  function toggleExtra(val: string): void {
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(val)) {
        next.delete(val);
        return next;
      }
      if (val === "fila:topo") next.delete("fila:fim");
      if (val === "fila:fim") next.delete("fila:topo");
      next.add(val);
      return next;
    });
  }

  async function submit(): Promise<void> {
    if (!title.trim()) {
      setError("título obrigatório");
      return;
    }
    if (!disposicao) {
      setError("selecione uma disposição (afk / hitl / epic)");
      return;
    }
    if (areas.size === 0) {
      setError("selecione ao menos uma área");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // prefixo [projeto] derivado da 1ª área (multi: usa a primeira como dona).
      const firstArea = Array.from(areas)[0];
      const project = AREA_OPTIONS.find((a) => a.value === firstArea)?.project;
      const r = await createTask({
        title: title.trim(),
        agent: project, // backend prefixa o título com [project]
        labels: builtLabels,
        body: body.trim(),
      });
      setCreatedUrl(r.url);
      setTitle("");
      setBody("");
      setDisposicao("");
      setAreas(new Set());
      setExtras(new Set());
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
        <Plus size={14} /> Nova task
      </button>
    );
  }

  return (
    <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/40 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-200">
          Nova task (issue)
        </span>
        <button
          onClick={() => setOpen(false)}
          className="text-slate-500 hover:text-slate-300"
        >
          <X size={16} />
        </button>
      </div>

      <input
        placeholder="Título — ex.: 'CRUD /v1/alertas por rastreador'"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm w-full"
      />

      {/* Disposição (obrigatória) */}
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
          Disposição <span className="text-rose-400">*</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {DISPOSICAO_OPTIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDisposicao(d.value)}
              className={`px-3 py-1 rounded text-sm font-bold border transition-colors ${
                disposicao === d.value
                  ? "border-emerald-500 text-emerald-300 bg-emerald-500/15"
                  : "border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
              title={d.hint}
            >
              {d.value}
            </button>
          ))}
        </div>
        <div className="text-xs text-amber-400 mt-1">
          ⚠ Qualquer decisão pendente (A vs B, &quot;escolher abordagem&quot;) →
          use <b>hitl</b>. Na dúvida, hitl.
        </div>
      </div>

      {/* Área / Projeto (obrigatória, pode ser MAIS DE UMA) */}
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
          Área / Projeto <span className="text-rose-400">*</span>{" "}
          <span className="text-slate-600 normal-case">
            (pode selecionar mais de uma)
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {AREA_OPTIONS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => toggleArea(a.value)}
              title={a.label}
              className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors ${
                areas.has(a.value)
                  ? "border-sky-500 text-sky-300 bg-sky-500/15"
                  : "border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              {a.value}
            </button>
          ))}
        </div>
        {afkMulti && (
          <div className="text-xs text-amber-400 mt-1">
            ⚠ <b>afk com mais de uma área</b>: o dev-loop de CADA área vai puxar
            esta issue (trabalho duplicado). Prefira <b>1 área</b>, ou marque{" "}
            <b>epic</b> se for guarda-chuva.
          </div>
        )}
      </div>

      {/* Labels extras */}
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
          Labels extras
        </div>
        <div className="flex gap-2 flex-wrap">
          {EXTRA_LABELS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => toggleExtra(l.value)}
              title={l.hint}
              className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors ${
                extras.has(l.value)
                  ? l.cls
                  : "border-slate-700 text-slate-500 hover:border-slate-500"
              }`}
            >
              {l.value}
            </button>
          ))}
        </div>
      </div>

      <textarea
        placeholder="Descrição / contexto / critérios de aceite"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm w-full"
      />

      {/* Preview da label string final */}
      <div className="text-xs text-slate-400 font-mono">
        Labels:{" "}
        {builtLabels.length
          ? builtLabels.join(", ")
          : "(selecione disposição + área)"}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void submit()}
          disabled={submitting || !canSubmit}
          className="px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-sm font-bold transition-colors disabled:opacity-40"
        >
          {submitting ? "Criando…" : "Criar issue"}
        </button>
        {createdUrl && (
          <a
            href={createdUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
          >
            criada <ExternalLink size={11} />
          </a>
        )}
        {error && <span className="text-xs text-rose-400">{error}</span>}
      </div>
    </div>
  );
}
