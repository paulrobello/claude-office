"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCoordinationPoll } from "@/components/coordination/useCoordinationPoll";
import {
  fetchAgents,
  fetchDashboard,
  type CoordAgent,
  type CoordDashboard,
} from "@/components/coordination/coordinationApi";
import { OfficeMap } from "@/components/coordination/OfficeMap";

// ── Camada 3, slice 1: shell do console de operações (3 painéis), tokens do
// design (Agents-Office mockup). O painel esquerdo (mapa pixel-art PixiJS) entra
// no slice 2; aqui é placeholder. Painéis do meio/direita já mostram dados reais
// (roster + dashboard de coordenação).

const STATUS_DOT: Record<string, string> = {
  busy: "text-[#4ade80]", // LIVE
  idle: "text-[#38bdf8]",
  offline: "text-[#6b7280]",
};

interface Room {
  role: string;
  total: number;
  busy: number;
  queued: number;
  status: "LIVE" | "PROC" | "IDLE";
}

function buildRooms(agents: CoordAgent[]): Room[] {
  const byRole = new Map<string, CoordAgent[]>();
  for (const a of agents) {
    const list = byRole.get(a.role) ?? [];
    list.push(a);
    byRole.set(a.role, list);
  }
  return [...byRole.entries()]
    .map(([role, list]) => {
      const busy = list.filter((a) => a.status === "busy").length;
      const queued = list.reduce((s, a) => s + a.queued_requests, 0);
      const status: Room["status"] = busy > 0 ? "LIVE" : queued > 0 ? "PROC" : "IDLE";
      return { role, total: list.length, busy, queued, status };
    })
    .sort((a, b) => a.role.localeCompare(b.role));
}

const ROOM_STATUS_COLOR: Record<Room["status"], string> = {
  LIVE: "text-[#4ade80] border-[#4ade80]/40",
  PROC: "text-[#fbbf24] border-[#fbbf24]/30",
  IDLE: "text-[#6b7280] border-[#2e3653]",
};

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-[#131826] border border-[#232a40] rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-[#7e89a3] font-mono">
        {label}
      </div>
      <div className="text-2xl font-bold text-[#f1f5fb] mt-1">{value}</div>
      {hint && <div className="text-[10px] text-[#4b5573] mt-0.5">{hint}</div>}
    </div>
  );
}

export default function ConsolePage(): React.ReactNode {
  const { data: agentsData, refetch } = useCoordinationPoll(() => fetchAgents(), []);
  const { data: dash } = useCoordinationPoll<CoordDashboard>(() => fetchDashboard(), []);

  const agents = useMemo(() => agentsData?.agents ?? [], [agentsData]);
  const rooms = useMemo(() => buildRooms(agents), [agents]);
  const total = agents.length;
  const active = agents.filter((a) => a.status === "busy").length;

  return (
    <main className="h-screen flex flex-col bg-[#07090f] text-[#c7d0e0] font-[var(--font-ui)]">
      {/* ── TOP BAR ── */}
      <header className="h-10 flex items-center gap-3 px-3 border-b border-[#232a40] bg-[#0a0e1a] shrink-0">
        <span className="font-bold text-[#f1f5fb] tracking-wide text-sm">
          AGENTS<span className="text-[#fb923c]">·</span>OFFICE
        </span>
        <span className="h-4 w-px bg-[#232a40]" />
        <span className="flex items-center gap-1.5 text-xs text-[#7e89a3]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80] inline-block" />
          ALL SYSTEMS NOMINAL · {active}/{total} AGENTS
        </span>
        <div className="flex-1" />
        <button
          onClick={() => void refetch()}
          className="flex items-center gap-1 text-xs text-[#7e89a3] hover:text-[#c7d0e0]"
        >
          <RefreshCw size={13} />
        </button>
        <span className="flex items-center gap-2 px-2 py-1 rounded bg-[#131826] border border-[#232a40] text-xs">
          <span className="h-5 w-5 rounded-full bg-[#a78bfa]/20 text-[#a78bfa] grid place-items-center font-bold text-[10px]">
            CEO
          </span>
          <span className="text-[#c7d0e0]">CEO</span>
          <span className="text-[#4b5573]">(Humano)</span>
        </span>
        <Link href="/" className="text-xs text-[#4b5573] hover:text-[#c7d0e0] flex items-center gap-1">
          <ArrowLeft size={13} /> escritório
        </Link>
      </header>

      {/* ── 3 PAINÉIS (portrait → coluna, p/ monitor 27" vertical) ── */}
      <div className="flex-1 flex min-h-0 portrait:flex-col">
        {/* CENTRAL OFFICE (40%) — mapa pixel-art entra no slice 2 */}
        <section className="basis-2/5 border-r border-[#232a40] flex flex-col min-h-0 portrait:basis-1/2 portrait:border-r-0 portrait:border-b">
          <PanelHead title="CENTRAL OFFICE" right={`${rooms.length} salas`} />
          <div className="flex gap-2 px-3 py-2 text-[11px] font-mono">
            <Chip>{total} agentes</Chip>
            <Chip tone="mint">{active} ativos</Chip>
            <Chip tone="amber">
              {rooms.reduce((s, r) => s + r.queued, 0)} na fila
            </Chip>
          </div>
          <div className="flex-1 m-3 mt-0 rounded-lg border border-[#232a40] bg-[#0a0e1a] overflow-hidden">
            <OfficeMap agents={agents} />
          </div>
        </section>

        {/* COLLABORATIVE ROOMS (35%) — salas = roles do roster */}
        <section className="basis-[35%] border-r border-[#232a40] flex flex-col min-h-0 portrait:basis-auto portrait:flex-1 portrait:border-r-0">
          <PanelHead title="COLLABORATIVE ROOMS" right={`${rooms.filter((r) => r.status !== "IDLE").length} ativas`} />
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2 content-start">
            {rooms.map((r) => (
              <div
                key={r.role}
                className={`rounded-lg border bg-[#131826] p-3 ${ROOM_STATUS_COLOR[r.status]}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#f1f5fb] text-sm truncate">{r.role}</span>
                  <span className="text-[10px] font-mono">● {r.status}</span>
                </div>
                <div className="text-[11px] text-[#7e89a3] mt-2 font-mono">
                  {r.busy}/{r.total} ocupados
                  {r.queued > 0 && <span className="text-[#fbbf24]"> · {r.queued} fila</span>}
                </div>
                <div className="mt-2 h-1.5 rounded bg-[#0a0e1a] overflow-hidden">
                  <div
                    className="h-full bg-[#4ade80]"
                    style={{ width: `${r.total ? (r.busy / r.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
            {rooms.length === 0 && (
              <p className="text-[#4b5573] text-sm col-span-2">Roster vazio.</p>
            )}
          </div>
        </section>

        {/* CEO DASHBOARD (25%) */}
        <section className="basis-1/4 flex flex-col min-h-0 portrait:basis-auto portrait:flex-1 portrait:border-t portrait:border-[#232a40]">
          <PanelHead title="CEO DASHBOARD" right={dash ? "live" : "—"} />
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Kpi label="Issues abertas" value={dash ? String(dash.github.open) : "—"} />
              <Kpi label="Agentes ativos" value={`${active}/${total}`} />
              <Kpi label="Claims ativos" value={dash ? String(dash.database.activeClaims) : "—"} />
              <Kpi
                label="Runs erro"
                value={dash ? String(dash.database.runsByStatus.error ?? 0) : "—"}
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#7e89a3] font-mono mb-1">
                Agent status
              </div>
              <div className="space-y-1">
                {agents.map((a) => (
                  <div
                    key={a.nome}
                    className="flex items-center justify-between text-xs bg-[#131826] border border-[#232a40] rounded px-2 py-1.5"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={STATUS_DOT[a.status] ?? "text-[#6b7280]"}>●</span>
                      <span className="text-[#c7d0e0] font-mono truncate">{a.nome}</span>
                    </span>
                    <span className="text-[#4b5573] shrink-0">{a.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── BOTTOM STRIP ── */}
      <footer className="h-7 flex items-center gap-3 px-3 border-t border-[#232a40] bg-[#0a0e1a] text-[10px] font-mono text-[#4b5573] shrink-0">
        <span className="text-[#4ade80]">OK</span>
        <span>{new Date().toLocaleTimeString()}</span>
        <span>cockpit interno · Camada 3 (shell)</span>
        <div className="flex-1" />
        <span>{total} agentes · {active} ativos</span>
      </footer>
    </main>
  );
}

function PanelHead({ title, right }: { title: string; right?: string }) {
  return (
    <div className="flex items-center justify-between px-3 h-9 border-b border-[#232a40] shrink-0">
      <span className="text-[11px] font-mono uppercase tracking-wider text-[#7e89a3] font-bold">
        {title}
      </span>
      {right && <span className="text-[10px] font-mono text-[#4b5573]">{right}</span>}
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "mint" | "amber" }) {
  const c =
    tone === "mint"
      ? "text-[#4ade80] border-[#4ade80]/30"
      : tone === "amber"
        ? "text-[#fbbf24] border-[#fbbf24]/30"
        : "text-[#7e89a3] border-[#232a40]";
  return (
    <span className={`px-2 py-0.5 rounded border bg-[#131826] ${c}`}>{children}</span>
  );
}
