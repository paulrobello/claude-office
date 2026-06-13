"use client";

import { useMemo, useState } from "react";
import { Clock, Play, Plus, X } from "lucide-react";
import {
  cronToEditor,
  timesToCron,
  intervalToCron,
  DEFAULT_BUSINESS_HOURS,
  enterTimesHours,
} from "@/utils/cron";
import { patchAgent, type CoordAgent } from "./coordinationApi";
import { useRunAgentNow } from "./useRunAgentNow";
import { AgentStatePill } from "./AgentStatePill";

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
  const [minute, setMinute] = useState(
    initial.mode === "times" ? initial.minute : 0,
  );
  const [hours, setHours] = useState<number[]>(
    initial.mode === "times" ? initial.hours : DEFAULT_BUSINESS_HOURS,
  );
  const [everyMin, setEveryMin] = useState(
    initial.mode === "interval" ? initial.everyMin : 15,
  );
  const [startHour, setStartHour] = useState(
    initial.mode === "interval" ? initial.startHour : 7,
  );
  const [endHour, setEndHour] = useState(
    initial.mode === "interval" ? initial.endHour : 23,
  );
  const [h24, setH24] = useState(
    initial.mode === "interval" ? initial.h24 === true : false,
  );
  const [newTime, setNewTime] = useState("");
  const [enabled, setEnabled] = useState(agent.enabled);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // ▶ Play (#833): roda o loop do agente agora, sem esperar o cron. Sucesso
  // (#839) reflete como 'Ocupado' (pill canônico), não uma label 'iniciado'.
  const {
    running,
    busy: claimActive,
    msg: runMsg,
    runNow,
  } = useRunAgentNow(agent);

  const cron =
    mode === "times"
      ? timesToCron(
          hours.map(
            (h) =>
              `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
          ),
        )
      : h24
        ? intervalToCron(everyMin, 0, 23)
        : intervalToCron(everyMin, startHour, endHour);

  // Entrar em "horários fixos": lista vazia (vindo de interval/raw) pré-popula
  // com horário comercial; horas já presentes são preservadas.
  function selectTimes(): void {
    setMode("times");
    setHours((hs) => enterTimesHours(hs));
  }

  function addTime(): void {
    const m = newTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return;
    setMinute(Number(m[2]));
    setHours((hs) =>
      Array.from(new Set([...hs, Number(m[1])])).sort((a, b) => a - b),
    );
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
    <div
      className="rounded-2xl border p-4 space-y-3 backdrop-blur-md bg-[rgba(20,14,38,0.6)]"
      style={{
        borderColor: enabled ? "rgba(52,211,153,0.4)" : "rgba(168,85,247,0.25)",
        borderLeft: `3px solid ${enabled ? "#34d399" : "#6b6485"}`,
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="font-semibold flex items-center gap-2">
          <Clock size={16} className="text-[#a855f7]" /> {agent.nome}{" "}
          <span className="text-[#9a93b3] text-sm">({agent.role})</span>
        </span>
        {/* Toggle ligado/desligado — controla agent.enabled (liga/desliga o cron) */}
        <div className="flex items-center gap-2">
          {/* ▶ Play (#833): roda o loop agora, aditivo ao cron */}
          <button
            type="button"
            onClick={() => void runNow()}
            disabled={running || claimActive}
            title={
              claimActive
                ? "agente já tem claim/loop ativo"
                : "rodar o loop deste agente agora (não espera o cron)"
            }
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-[#34d399] border border-[rgba(52,211,153,0.35)] bg-[rgba(52,211,153,0.08)] hover:bg-[rgba(52,211,153,0.16)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Play size={12} className={running ? "animate-pulse" : ""} />
            {running ? "iniciando…" : (runMsg ?? "Play")}
          </button>
          {/* Sucesso do Play reflete 'Em execução' (Ocupado) com o pill canônico. */}
          {claimActive && <AgentStatePill enabled={enabled} busy />}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
            style={{
              background: enabled ? "#34d399" : "rgba(255,255,255,0.1)",
              boxShadow: enabled ? "0 0 12px rgba(52,211,153,0.5)" : undefined,
            }}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
              style={{
                transform: enabled ? "translateX(24px)" : "translateX(4px)",
              }}
            />
          </button>
          <span
            className="text-sm font-semibold w-16"
            style={{ color: enabled ? "#34d399" : "#9a93b3" }}
          >
            {enabled ? "ligado" : "desligado"}
          </span>
        </div>
      </div>

      <div className="flex gap-4 text-sm text-[#9a93b3]">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            checked={mode === "times"}
            onChange={selectTimes}
            className="accent-[#a855f7]"
          />{" "}
          Horários fixos
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            checked={mode === "interval"}
            onChange={() => setMode("interval")}
            className="accent-[#a855f7]"
          />{" "}
          Intervalo
        </label>
      </div>

      {mode === "times" ? (
        <div className="flex flex-wrap items-center gap-2">
          {hours.map((h) => (
            <span
              key={h}
              className="rounded-lg border border-[rgba(168,85,247,0.25)] bg-white/5 px-2.5 py-1 text-sm flex items-center gap-1.5"
            >
              {String(h).padStart(2, "0")}:{String(minute).padStart(2, "0")}
              <button
                onClick={() => setHours((hs) => hs.filter((x) => x !== h))}
                className="text-[#9a93b3] hover:text-[#ec4899]"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            placeholder="22:00"
            className="w-20 rounded-lg border border-[rgba(168,85,247,0.25)] bg-white/5 px-2 py-1 text-sm outline-none focus:border-[#a855f7]"
          />
          <button
            onClick={addTime}
            className="flex items-center gap-1 text-sm text-[#38bdf8] hover:text-[#7dd3fc]"
          >
            <Plus size={14} /> adicionar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#9a93b3]">
          a cada
          <select
            value={everyMin}
            onChange={(e) => setEveryMin(Number(e.target.value))}
            className="bg-white/5 border border-[rgba(168,85,247,0.25)] rounded-lg px-1.5 py-1 text-[#ece9f5]"
          >
            {STEPS.map((s) => (
              <option key={s} value={s} className="bg-[#0d0a18]">
                {s}
              </option>
            ))}
          </select>
          min
          {/* 24h: marca → janela 0-23 e some com os inputs de hora início/fim */}
          {!h24 && (
            <>
              , das
              <input
                type="number"
                min={0}
                max={23}
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
                className="w-14 bg-white/5 border border-[rgba(168,85,247,0.25)] rounded-lg px-1.5 py-1"
              />
              às
              <input
                type="number"
                min={0}
                max={23}
                value={endHour}
                onChange={(e) => setEndHour(Number(e.target.value))}
                className="w-14 bg-white/5 border border-[rgba(168,85,247,0.25)] rounded-lg px-1.5 py-1"
              />
              h
            </>
          )}
          <label className="flex items-center gap-1.5 cursor-pointer ml-1">
            <input
              type="checkbox"
              checked={h24}
              onChange={(e) => setH24(e.target.checked)}
              className="accent-[#a855f7]"
            />
            24h
          </label>
        </div>
      )}

      <div className="text-xs text-[#9a93b3] font-mono">
        cron gerado: <span className="text-[#38bdf8]">{cron}</span>
      </div>
      {duplicateRole && (
        <div className="text-xs text-[#fbbf24]">
          ⚠ outro agente com a mesma função já tem agenda — isso gera uma linha
          de cron duplicada.
        </div>
      )}
      {err && <div className="text-xs text-[#ec4899]">{err}</div>}
      <button
        onClick={save}
        disabled={busy}
        className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 shadow-[0_0_18px_rgba(168,85,247,0.4)] transition-shadow hover:shadow-[0_0_26px_rgba(168,85,247,0.65)]"
        style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
      >
        {busy ? "salvando…" : "salvar agenda"}
      </button>
    </div>
  );
}
