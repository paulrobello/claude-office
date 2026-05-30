"use client";

import { useMemo, useState } from "react";
import { Clock, Plus, X } from "lucide-react";
import { cronToEditor, timesToCron, intervalToCron } from "@/utils/cron";
import { patchAgent, type CoordAgent } from "./coordinationApi";

const STEPS = [5, 10, 15, 20, 30];

export function AgendaEditor({
  agent,
  duplicateRole,
  onSaved,
}: {
  agent: CoordAgent;
  duplicateRole: boolean;
  onSaved?: () => void;
}): React.ReactNode {
  const initial = useMemo(
    () => cronToEditor(agent.cron_expr ?? ""),
    [agent.cron_expr],
  );
  const [mode, setMode] = useState<"times" | "interval">(
    initial.mode === "interval" ? "interval" : "times",
  );
  const [minute, setMinute] = useState(initial.mode === "times" ? initial.minute : 0);
  const [hours, setHours] = useState<number[]>(
    initial.mode === "times" ? initial.hours : [8, 12, 15, 18, 23],
  );
  const [everyMin, setEveryMin] = useState(initial.mode === "interval" ? initial.everyMin : 15);
  const [startHour, setStartHour] = useState(initial.mode === "interval" ? initial.startHour : 7);
  const [endHour, setEndHour] = useState(initial.mode === "interval" ? initial.endHour : 23);
  const [newTime, setNewTime] = useState("");
  const [enabled, setEnabled] = useState(agent.enabled);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cron =
    mode === "times"
      ? timesToCron(hours.map((h) => `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`))
      : intervalToCron(everyMin, startHour, endHour);

  function addTime(): void {
    const m = newTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return;
    setMinute(Number(m[2]));
    setHours((hs) => Array.from(new Set([...hs, Number(m[1])])).sort((a, b) => a - b));
    setNewTime("");
  }

  async function save(): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      await patchAgent(agent.nome, { cron_expr: cron, enabled });
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium flex items-center gap-2">
          <Clock size={16} /> {agent.nome} <span className="text-neutral-400">({agent.role})</span>
        </span>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          ativo
        </label>
      </div>

      <div className="flex gap-3 text-sm">
        <label><input type="radio" checked={mode === "times"} onChange={() => setMode("times")} /> Horários fixos</label>
        <label><input type="radio" checked={mode === "interval"} onChange={() => setMode("interval")} /> Intervalo</label>
      </div>

      {mode === "times" ? (
        <div className="flex flex-wrap items-center gap-2">
          {hours.map((h) => (
            <span key={h} className="rounded bg-neutral-800 px-2 py-1 text-sm flex items-center gap-1">
              {String(h).padStart(2, "0")}:{String(minute).padStart(2, "0")}
              <button onClick={() => setHours((hs) => hs.filter((x) => x !== h))}><X size={12} /></button>
            </span>
          ))}
          <input
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            placeholder="22:00"
            className="w-20 rounded bg-neutral-900 px-2 py-1 text-sm"
          />
          <button onClick={addTime} className="flex items-center gap-1 text-sm"><Plus size={14} /> adicionar</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          a cada
          <select value={everyMin} onChange={(e) => setEveryMin(Number(e.target.value))} className="bg-neutral-900 rounded px-1">
            {STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          min, das
          <input type="number" min={0} max={23} value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} className="w-14 bg-neutral-900 rounded px-1" />
          às
          <input type="number" min={0} max={23} value={endHour} onChange={(e) => setEndHour(Number(e.target.value))} className="w-14 bg-neutral-900 rounded px-1" />
          h
        </div>
      )}

      <div className="text-xs text-neutral-400 font-mono">cron gerado: {cron}</div>
      {duplicateRole && (
        <div className="text-xs text-amber-400">⚠ outro agente com a mesma função já tem agenda — isso gera uma linha de cron duplicada.</div>
      )}
      {err && <div className="text-xs text-red-400">{err}</div>}
      <button onClick={save} disabled={busy} className="rounded bg-blue-600 px-3 py-1 text-sm disabled:opacity-50">
        {busy ? "salvando…" : "salvar agenda"}
      </button>
    </div>
  );
}
