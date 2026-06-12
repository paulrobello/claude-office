"use client";

/**
 * Dashboard de coordenação — visão de fluxo dos agentes (tela inicial do sistema).
 *
 * Reescrita do mockup "Neon Agents Dashboard" (dash-v2.html) como tela real:
 * Tailwind + tipos de coordenação + dados ao vivo via useCoordinationPoll.
 * Agrega dashboard (stats/período/saúde), tasks (status derivado) e agentes
 * (board por agente) num único poll combinado.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Search, Building2 } from "lucide-react";
import { CoordinationNav } from "@/components/coordination/CoordinationNav";
import { useCoordinationPoll } from "@/components/coordination/useCoordinationPoll";
import {
  fetchDashboard,
  fetchTasks,
  fetchAgents,
  fetchHitlPending,
  fetchFlowHealth,
  answerHitl,
  type CoordDashboard,
  type CoordTask,
  type CoordAgent,
  type HitlPrompt,
  type CoordFlowHealth,
} from "@/components/coordination/coordinationApi";
import {
  deriveStatus,
  statusGroup,
  type TaskStatus,
  type TaskGroup,
} from "@/components/coordination/taskStatus";
import HitlAnswerModal from "@/components/coordination/HitlAnswerModal";

type Period = "day" | "week" | "month";

interface DashboardBundle {
  dashboard: CoordDashboard;
  tasks: CoordTask[];
  agents: CoordAgent[];
  hitl: HitlPrompt[];
  flow: CoordFlowHealth;
}

const STATUS_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "queue", label: "Fila" },
  { key: "in_progress", label: "Em progresso" },
  { key: "history", label: "Concluído" },
  { key: "need_you", label: "Precisa de você" },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

/** Paleta neon (espelha as --neon-* do mockup). */
const NEON = ["#a855f7", "#38bdf8", "#ec4899", "#34d399", "#fbbf24"];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return NEON[Math.abs(h) % NEON.length];
}

/** Projeto (em agent.projetos) → label area:*. Espelha o mapa do dev-loop. */
const PROJECT_TO_AREA: Record<string, string> = {
  "hmtrack-front": "area:front",
  "hmtrack-api-py": "area:api",
  "hmtrack-trackers": "area:trackers",
  "hmtrack-alert-system": "area:alert-system",
  "hmtrack-app": "area:mobile",
  HMTrackApp: "area:mobile",
  "banco-dados": "area:db",
  "hmtrack-documentacao": "area:db",
  "hmtrack-whatsapp": "area:whatsapp",
  "claude-office": "area:office",
};

/** Papéis que NÃO executam (coordenam) — não contam como "dono" de uma área. */
const COORDINATION_ROLES = new Set([
  "office-manager",
  "triador",
  "qa",
  "devops",
]);

/** Labels area:* de uma task (pode ter mais de uma). */
function taskAreas(t: CoordTask): string[] {
  return t.labels.filter((l) => l.startsWith("area:"));
}

function shortArea(area: string): string {
  return area.replace(/^area:/, "");
}

/** Projetos do agente como nomes CURTOS de área (hmtrack-front → front), pra casar
 *  com t.project que vem curto. Sem isto o filtro de projeto nunca casava agentes. */
function agentProjectsShort(a: CoordAgent): string[] {
  const s = new Set<string>();
  for (const p of a.projetos) {
    const area = PROJECT_TO_AREA[p];
    if (area) s.add(shortArea(area));
  }
  return [...s];
}

function initials(name: string): string {
  const clean = name.replace(/^Agent[e]?\s*[·-]?\s*/i, "").replace(/^hmtrack-/i, "");
  const parts = clean.split(/[\s_-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function fmtBucket(iso: string, period: Period): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (period === "month")
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  return d.toLocaleDateString();
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Sem label",
  todo: "To-Do",
  pending: "Precisa de você",
  waiting_agent: "Aguardando agente",
  running: "Em progresso",
  error: "Erro",
  done: "Concluído",
  unknown: "—",
};

const GROUP_BORDER: Record<TaskGroup, string> = {
  need_you: "#fbbf24",
  in_progress: "#38bdf8",
  queue: "#ec4899",
  history: "#34d399",
};

export default function DashboardPage(): React.ReactNode {
  const [period, setPeriod] = useState<Period>("day");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState<HitlPrompt | null>(null);

  const qs = useMemo(() => `?period=${period}`, [period]);

  const { data, loading, unavailable, error, refetch } =
    useCoordinationPoll<DashboardBundle>(
      async () => {
        const [dashboard, tasksRes, agentsRes, hitlRes, flow] = await Promise.all([
          fetchDashboard(qs),
          fetchTasks(),
          fetchAgents(),
          fetchHitlPending(),
          fetchFlowHealth(24),
        ]);
        return {
          dashboard,
          tasks: tasksRes.tasks,
          agents: agentsRes.agents,
          hitl: hitlRes.prompts,
          flow,
        };
      },
      [qs],
    );

  // status derivado por task (uma vez)
  const statusByRef = useMemo(() => {
    const m = new Map<string, TaskStatus>();
    if (!data) return m;
    for (const t of data.tasks) m.set(t.source_ref, deriveStatus(t, data.hitl));
    return m;
  }, [data]);

  const groupCounts = useMemo(() => {
    const c = { need_you: 0, in_progress: 0, queue: 0, history: 0 };
    let errors = 0;
    let pending = 0;
    if (data) {
      for (const t of data.tasks) {
        const st = statusByRef.get(t.source_ref) ?? "unknown";
        c[statusGroup(st)] += 1;
        if (st === "error") errors += 1;
        if (st === "pending") pending += 1;
      }
    }
    return { ...c, errors, pending };
  }, [data, statusByRef]);

  // chips de projeto = nomes CURTOS canônicos vindos de t.project (db, front, ...).
  // (Não misturar com a.projetos, que vem cheio — causava chips duplicados e filtro
  // que não casava.)
  const projects = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const t of data.tasks) if (t.project) set.add(t.project);
    return [...set].sort();
  }, [data]);

  const agentsActive = useMemo(
    () => (data ? data.agents.filter((a) => a.enabled && !a.archived_at).length : 0),
    [data],
  );

  const closedToday = useMemo(() => {
    if (!data) return 0;
    const today = new Date().toLocaleDateString();
    const b = data.dashboard.closedByPeriod.buckets.find(
      (x) => new Date(x.period).toLocaleDateString() === today,
    );
    return b?.n ?? 0;
  }, [data]);

  const maxBucket = useMemo(
    () =>
      data
        ? Math.max(1, ...data.dashboard.closedByPeriod.buckets.map((b) => b.n))
        : 1,
    [data],
  );

  // tasks visíveis dado o filtro de status/projeto/busca
  const taskVisible = useMemo(() => {
    return (t: CoordTask): boolean => {
      const st = statusByRef.get(t.source_ref) ?? "unknown";
      if (statusFilter !== "all" && statusGroup(st) !== statusFilter) return false;
      if (projectFilter !== "all" && t.project !== projectFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${t.title ?? ""} ${t.project ?? ""} #${t.number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
  }, [statusByRef, statusFilter, projectFilter, search]);

  // há filtro ativo? (esconde colunas de agente sem fila quando sim)
  const filterActive =
    statusFilter !== "all" || projectFilter !== "all" || search.trim() !== "";

  // áreas COBERTAS = têm agente executor ativo (papel não-coordenação).
  const coveredAreas = useMemo(() => {
    const s = new Set<string>();
    if (!data) return s;
    for (const a of data.agents) {
      if (!a.enabled || a.archived_at) continue;
      if (COORDINATION_ROLES.has(a.role)) continue;
      for (const p of a.projetos) {
        const area = PROJECT_TO_AREA[p];
        if (area) s.add(area);
      }
    }
    return s;
  }, [data]);

  // órfãs = task sem agente executor: sem area:* OU área não-coberta.
  // (issues fechadas/parked/epic não contam — só trabalho vivo.)
  const orphans = useMemo(() => {
    if (!data) return [] as CoordTask[];
    return data.tasks.filter((t) => {
      const st = statusByRef.get(t.source_ref) ?? "unknown";
      if (st === "done") return false;
      if (t.labels.includes("epic")) return false;
      const areas = taskAreas(t);
      if (areas.length === 0) return true; // sem area:* nenhuma
      return !areas.some((a) => coveredAreas.has(a)); // nenhuma área coberta
    });
  }, [data, statusByRef, coveredAreas]);

  const orphansByArea = useMemo(() => {
    const m = new Map<string, CoordTask[]>();
    for (const t of orphans) {
      const areas = taskAreas(t);
      const key = areas[0] ?? "(sem área)";
      const arr = m.get(key);
      if (arr) arr.push(t);
      else m.set(key, [t]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [orphans]);

  // board: colunas por agente (tasks atribuídas) + coluna FILA (visíveis SEM agente).
  // A maioria das tasks não tem claim/run agent (ou tem 'cron:...'/nome divergente)
  // → sem a fila, sumiam. Aqui toda task visível aparece em algum lugar.
  const boardData = useMemo(() => {
    const empty = {
      columns: [] as { agent: CoordAgent; color: string; tasks: CoordTask[] }[],
      queue: [] as CoordTask[],
    };
    if (!data) return empty;
    const shown = new Set<string>();
    const columns = data.agents
      .filter((a) => !a.archived_at)
      .filter(
        (a) =>
          projectFilter === "all" ||
          agentProjectsShort(a).includes(projectFilter),
      )
      .filter(
        (a) => !search || a.nome.toLowerCase().includes(search.toLowerCase()),
      )
      .map((a) => {
        const tasks = data.tasks
          .filter((t) => t.claim_agent === a.nome || t.run_agent === a.nome)
          .filter(taskVisible);
        for (const t of tasks) shown.add(t.source_ref);
        return { agent: a, color: colorFor(a.nome), tasks };
      })
      .filter(({ tasks }) => !filterActive || tasks.length > 0);
    const queue = data.tasks
      .filter(taskVisible)
      .filter((t) => !shown.has(t.source_ref));
    return { columns, queue };
  }, [data, projectFilter, search, taskVisible, filterActive]);

  // clicar "responder" numa task pending: abre o modal HITL se houver prompt no DB
  // (canal hitl_prompts → web); senão (label hitl sem prompt) cai na issue.
  const onRespond = (t: CoordTask): void => {
    const p = data?.hitl.find(
      (h) => h.source_ref === t.source_ref && h.status === "pending",
    );
    if (p) setSelectedPrompt(p);
    else if (t.url) window.open(t.url, "_blank");
  };

  return (
    <main
      className="min-h-screen text-[#ece9f5] px-6 pb-16 pt-6"
      style={{
        background:
          "radial-gradient(1200px 600px at 15% -10%, rgba(168,85,247,0.18), transparent 60%)," +
          "radial-gradient(900px 500px at 90% 0%, rgba(236,72,153,0.12), transparent 55%)," +
          "#07060d",
      }}
    >
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl grid place-items-center text-2xl shadow-[0_0_24px_rgba(168,85,247,0.6)]"
            style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
          >
            🤖
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-[#c084fc] to-[#f0abfc] bg-clip-text text-transparent">
              Agents Dashboard
            </h1>
            <p className="text-[#9a93b3] text-[13px]">
              Fluxo de agentes, filas e tasks — ecossistema HMTrack
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/office"
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#9a93b3] border border-[rgba(168,85,247,0.25)] hover:text-white hover:border-[#a855f7] transition-colors"
          >
            <Building2 size={16} /> Escritório
          </Link>
          <Link
            href="/tasks"
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(168,85,247,0.45)] hover:shadow-[0_0_28px_rgba(168,85,247,0.7)] transition-shadow"
            style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
          >
            <Plus size={16} /> Nova Task
          </Link>
          <Link
            href="/agents"
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(56,189,248,0.4)] transition-shadow"
            style={{ background: "linear-gradient(135deg,#38bdf8,#a855f7)" }}
          >
            <Plus size={16} /> Agente
          </Link>
        </div>
      </header>

      <CoordinationNav />

      {unavailable && (
        <div className="p-4 mb-4 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl text-sm">
          DB de coordenação (:5433) indisponível.
        </div>
      )}
      {error && (
        <div className="p-4 mb-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-sm">
          Erro ao carregar: {error}
        </div>
      )}
      {loading && !data && (
        <p className="text-[#9a93b3] text-sm">Carregando…</p>
      )}

      {data && !unavailable && (
        <>
          {/* Stat cards */}
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-5 mb-7">
            <StatCard label="Agentes ativos" value={agentsActive} accent="#a855f7" glow />
            <StatCard label="Em progresso" value={groupCounts.in_progress} accent="#38bdf8" />
            <StatCard label="Na fila" value={groupCounts.queue} accent="#ec4899" />
            <StatCard label="Concluídas hoje" value={closedToday} accent="#34d399" />
            <StatCard label="Precisa de você" value={groupCounts.need_you} accent="#fbbf24" />
          </section>

          {/* Summary bar */}
          <section className="rounded-2xl p-5 mb-7 backdrop-blur-md border border-[rgba(168,85,247,0.25)] bg-[rgba(20,14,38,0.6)]">
            <div className="text-sm text-[#9a93b3] mb-3.5 flex items-center gap-1.5 flex-wrap">
              <b className="text-white">{data.dashboard.github.open} abertas</b> ={" "}
              <span className="text-[#ec4899] font-bold">{groupCounts.errors} erros</span> ·{" "}
              <span className="text-[#fbbf24] font-bold">{groupCounts.pending} precisa de você</span> ·{" "}
              <span className="text-[#38bdf8] font-bold">{groupCounts.in_progress} em andamento</span> ·{" "}
              <span className="text-[#9a93b3] font-bold">{groupCounts.queue} na fila</span>
            </div>
            <div className="flex gap-2.5 flex-wrap">
              <SummaryPill
                active={statusFilter === "need_you"}
                onClick={() =>
                  setStatusFilter((s) => (s === "need_you" ? "all" : "need_you"))
                }
                color="#fbbf24"
              >
                ⚠ Precisa de você ({groupCounts.need_you})
              </SummaryPill>
              <SummaryPill
                active={statusFilter === "in_progress"}
                onClick={() =>
                  setStatusFilter((s) => (s === "in_progress" ? "all" : "in_progress"))
                }
                color="#38bdf8"
              >
                ⚙ Em andamento ({groupCounts.in_progress})
              </SummaryPill>
              <SummaryPill
                active={statusFilter === "queue"}
                onClick={() => setStatusFilter((s) => (s === "queue" ? "all" : "queue"))}
                color="#9a93b3"
              >
                🧱 Fila ({groupCounts.queue})
              </SummaryPill>
              <SummaryPill active={false} onClick={() => void refetch()} color="#ec4899">
                ✕ Erros — {groupCounts.errors}
              </SummaryPill>
            </div>
          </section>

          {/* Saúde do fluxo autônomo (24h) */}
          <section className="rounded-2xl p-5 mb-7 backdrop-blur-md border border-[rgba(56,189,248,0.3)] bg-[rgba(20,14,38,0.6)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[15px] font-bold text-[#38bdf8]">
                ⚙ Saúde do fluxo (24h)
              </span>
              <span className="text-[#9a93b3] text-[12px]">
                custo aparece quando o dispatch captura tokens (migration 014)
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <div className="text-[#9a93b3] text-[12px]">Dispatches</div>
                <div className="text-2xl font-bold">{data.flow.runs}</div>
              </div>
              <div>
                <div className="text-[#9a93b3] text-[12px]">Sucesso</div>
                <div className="text-2xl font-bold text-[#34d399]">
                  {data.flow.by_status.success ?? 0}
                </div>
              </div>
              <div>
                <div className="text-[#9a93b3] text-[12px]">Erro/timeout</div>
                <div className="text-2xl font-bold text-[#ec4899]">
                  {(data.flow.by_status.error ?? 0) +
                    (data.flow.by_status.timeout ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-[#9a93b3] text-[12px]">Slots ativos</div>
                <div className="text-2xl font-bold text-[#fbbf24]">
                  {data.flow.slots_active}/6
                </div>
              </div>
              <div>
                <div className="text-[#9a93b3] text-[12px]">Custo 24h</div>
                <div className="text-2xl font-bold text-[#a855f7]">
                  ${data.flow.tokens.cost_usd.toFixed(2)}
                </div>
              </div>
            </div>
            {data.flow.by_agent.length > 0 && (
              <div className="mt-4 flex flex-col gap-1">
                <div className="text-[12px] text-[#9a93b3] mb-1">
                  Atividade por agente
                </div>
                {data.flow.by_agent.slice(0, 8).map((a) => (
                  <div
                    key={a.agent}
                    className="flex items-center gap-2 text-[13px]"
                  >
                    <span className="w-48 truncate text-[#ece9f5]">
                      {a.agent}
                    </span>
                    <span className="text-[#9a93b3]">{a.runs} runs</span>
                    <span className="ml-auto text-[#a855f7] font-mono">
                      ${a.cost_usd.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Alerta: tasks SEM DONO (órfãs — área sem agente executor ou sem area:*) */}
          {orphans.length > 0 && (
            <section className="rounded-2xl p-5 mb-7 backdrop-blur-md border bg-[rgba(251,191,36,0.06)] border-[rgba(251,191,36,0.4)]">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[#fbbf24] text-lg">⚠</span>
                <span className="text-[15px] font-bold text-[#fbbf24]">
                  {orphans.length} task(s) sem dono
                </span>
                <span className="text-[#9a93b3] text-[13px]">
                  — área sem agente executor (ninguém puxa) ou sem `area:*`. Precisa
                  re-triagem ou agente.
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {orphansByArea.map(([area, list]) => (
                  <div key={area} className="flex items-start gap-2.5 flex-wrap">
                    <span
                      className="text-[11px] font-bold px-2 py-1 rounded-md shrink-0 text-[#fbbf24] bg-[rgba(251,191,36,0.14)]"
                    >
                      {area} · {list.length}
                    </span>
                    <div className="flex gap-1.5 flex-wrap">
                      {list.slice(0, 12).map((t) => (
                        <a
                          key={t.source_ref}
                          href={t.url ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          title={t.title ?? ""}
                          className="text-[11px] px-2 py-1 rounded-md bg-white/5 text-[#9a93b3] hover:text-white border border-white/10"
                        >
                          #{t.number}
                        </a>
                      ))}
                      {list.length > 12 && (
                        <span className="text-[11px] text-[#9a93b3] px-1 py-1">
                          +{list.length - 12}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Toolbar */}
          <section className="flex items-center gap-3.5 mb-6 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-[360px] rounded-xl px-4 py-2.5 border border-[rgba(168,85,247,0.25)] bg-white/5">
              <Search size={15} className="text-[#9a93b3]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar agente ou task..."
                className="bg-transparent outline-none text-sm w-full placeholder:text-[#9a93b3]"
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-[#9a93b3] text-[13px]">Status:</span>
              {STATUS_FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  active={statusFilter === f.key}
                  onClick={() => setStatusFilter(f.key)}
                >
                  {f.label}
                </Chip>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-[#9a93b3] text-[13px]">Projeto:</span>
              <Chip active={projectFilter === "all"} onClick={() => setProjectFilter("all")}>
                Todos
              </Chip>
              {projects.map((p) => (
                <Chip
                  key={p}
                  active={projectFilter === p}
                  onClick={() => setProjectFilter(p)}
                >
                  {p.replace(/^hmtrack-/, "")}
                </Chip>
              ))}
            </div>
          </section>

          {/* Projetos */}
          <SectionTitle color="#38bdf8">Projetos</SectionTitle>
          <section className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5 mb-8">
            {data.dashboard.openByProject.map((p) => {
              const c = colorFor(p.project);
              const agentsOnIt = data.agents.filter((a) =>
                a.projetos.includes(p.project),
              );
              const total = data.dashboard.openByProject.reduce((s, x) => s + x.n, 0);
              const pct = total ? Math.round((p.n / Math.max(1, maxBucket * 2)) * 100) : 0;
              return (
                <div
                  key={p.project}
                  className="rounded-2xl p-4 backdrop-blur-md border border-[rgba(168,85,247,0.25)] bg-[rgba(20,14,38,0.6)]"
                  style={{ borderLeft: `3px solid ${c}` }}
                >
                  <h3 className="text-sm font-semibold mb-1.5">{p.project}</h3>
                  <div className="text-xs text-[#9a93b3] mb-2.5">
                    {p.n} abertas · {agentsOnIt.length} agente(s)
                  </div>
                  <div className="h-1.5 rounded bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        background: "linear-gradient(90deg,#a855f7,#ec4899)",
                      }}
                    />
                  </div>
                  <div className="flex mt-3">
                    {agentsOnIt.slice(0, 4).map((a, i) => (
                      <div
                        key={a.nome}
                        className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold text-white border-2 border-[#0d0a18]"
                        style={{
                          background: colorFor(a.nome),
                          marginLeft: i === 0 ? 0 : -8,
                        }}
                        title={a.nome}
                      >
                        {initials(a.nome)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {data.dashboard.openByProject.length === 0 && (
              <p className="text-[#6b6485] text-sm">Sem projetos com issues abertas.</p>
            )}
          </section>

          {/* Fechadas por período */}
          <section className="rounded-2xl p-5 mb-8 backdrop-blur-md border border-[rgba(168,85,247,0.25)] bg-[rgba(20,14,38,0.6)]">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <span className="text-xs font-bold tracking-widest uppercase text-[#9a93b3]">
                Fechadas por período
              </span>
              <div className="flex gap-2.5 items-center">
                <div className="inline-flex bg-white/5 border border-[rgba(168,85,247,0.25)] rounded-xl p-0.5">
                  {(["day", "week", "month"] as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`px-4 py-1.5 text-[13px] font-semibold rounded-lg transition-colors ${
                        period === p
                          ? "text-white shadow-[0_0_14px_rgba(56,189,248,0.4)]"
                          : "text-[#9a93b3]"
                      }`}
                      style={
                        period === p
                          ? { background: "linear-gradient(135deg,#38bdf8,#2563eb)" }
                          : undefined
                      }
                    >
                      {p === "day" ? "Dia" : p === "week" ? "Semana" : "Mês"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => void refetch()}
                  className="flex items-center gap-1.5 border border-[rgba(56,189,248,0.4)] bg-[rgba(56,189,248,0.08)] text-[#38bdf8] rounded-lg px-4 py-1.5 text-[13px] font-semibold hover:bg-[rgba(56,189,248,0.16)] transition-colors"
                >
                  <RefreshCw size={14} /> Atualizar
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {data.dashboard.closedByPeriod.buckets.length === 0 && (
                <span className="text-[#6b6485] text-sm">Sem dados.</span>
              )}
              {data.dashboard.closedByPeriod.buckets.map((b) => (
                <div
                  key={b.period}
                  className="grid grid-cols-[90px_1fr_44px] items-center gap-3.5 py-1"
                >
                  <span className="text-[12.5px] text-[#9a93b3]">
                    {fmtBucket(b.period, period)}
                  </span>
                  <div className="h-[22px] bg-white/5 rounded overflow-hidden">
                    <div
                      className="h-full rounded shadow-[0_0_12px_rgba(56,189,248,0.35)]"
                      style={{
                        width: `${(b.n / maxBucket) * 100}%`,
                        background: "linear-gradient(90deg,#2563eb,#38bdf8)",
                      }}
                    />
                  </div>
                  <span className="text-[13px] font-bold text-right">{b.n}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Board de agentes + FILA (não atribuídas) */}
          <SectionTitle color="#a855f7">Agentes &amp; Filas</SectionTitle>
          <section className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
            {boardData.columns.map(({ agent, color, tasks }) => (
              <AgentColumn
                key={agent.nome}
                agent={agent}
                color={color}
                tasks={tasks}
                statusByRef={statusByRef}
                onRespond={onRespond}
              />
            ))}
            {boardData.queue.length > 0 && (
              <QueueColumn
                tasks={boardData.queue}
                statusByRef={statusByRef}
                onRespond={onRespond}
              />
            )}
            {boardData.columns.length === 0 && boardData.queue.length === 0 && (
              <div className="text-[#6b6485] text-sm">
                Nenhuma task pra esse filtro.
              </div>
            )}
          </section>
        </>
      )}

      {/* Modal HITL inline (mesmo do /tasks): responder/aprovar sem sair do dashboard */}
      <HitlAnswerModal
        key={selectedPrompt?.id ?? "none"}
        prompt={selectedPrompt}
        onClose={() => setSelectedPrompt(null)}
        onSubmit={async (id, answer) => {
          await answerHitl(id, answer);
          await refetch();
        }}
      />
    </main>
  );
}

/* ---------------- subcomponentes ---------------- */

function StatCard({
  label,
  value,
  accent,
  glow = false,
}: {
  label: string;
  value: number | string;
  accent: string;
  glow?: boolean;
}): React.ReactNode {
  return (
    <div
      className="rounded-2xl px-5 py-4 backdrop-blur-md border border-[rgba(168,85,247,0.25)] bg-[rgba(20,14,38,0.6)] relative overflow-hidden"
      style={glow ? { boxShadow: "0 0 22px rgba(168,85,247,0.25)" } : undefined}
    >
      <div className="text-[#9a93b3] text-[13px] mb-2.5">{label}</div>
      <div className="text-[34px] font-bold leading-none" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function SummaryPill({
  children,
  active,
  onClick,
  color,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color: string;
}): React.ReactNode {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold border bg-white/5 hover:-translate-y-px transition-transform"
      style={{
        color,
        borderColor: active ? color : "rgba(168,85,247,0.25)",
        boxShadow: active ? `0 0 14px ${color}55` : undefined,
      }}
    >
      {children}
    </button>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}): React.ReactNode {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold border transition-colors ${
        active
          ? "text-white bg-[rgba(168,85,247,0.15)] border-[#a855f7] shadow-[0_0_14px_rgba(168,85,247,0.4)]"
          : "text-[#9a93b3] bg-white/5 border-[rgba(168,85,247,0.25)] hover:text-white hover:border-[#a855f7]"
      }`}
    >
      {children}
    </button>
  );
}

function SectionTitle({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}): React.ReactNode {
  return (
    <div className="text-[15px] font-bold mb-3.5 flex items-center gap-2">
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      {children}
    </div>
  );
}

function TaskCard({
  task: t,
  statusByRef,
  onRespond,
}: {
  task: CoordTask;
  statusByRef: Map<string, TaskStatus>;
  onRespond: (t: CoordTask) => void;
}): React.ReactNode {
  const st = statusByRef.get(t.source_ref) ?? "unknown";
  const border = GROUP_BORDER[statusGroup(st)];
  const done = st === "done";
  return (
    <div
      className="rounded-xl px-3.5 py-3 bg-white/5 border border-white/10 hover:bg-[rgba(168,85,247,0.06)] transition-colors"
      style={{ borderLeft: `3px solid ${border}` }}
    >
      <div
        className={`text-[13.5px] font-semibold mb-2 ${
          done ? "line-through text-[#9a93b3]" : ""
        }`}
      >
        {t.title ?? `#${t.number}`}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {t.project && (
          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-md text-[#38bdf8] bg-[rgba(56,189,248,0.12)]">
            {t.project.replace(/^hmtrack-/, "")}
          </span>
        )}
        <span
          className="text-[10.5px] font-bold px-2 py-0.5 rounded-md"
          style={{ color: border, background: `${border}1f` }}
        >
          {STATUS_LABEL[st]}
        </span>
        {/* HITL: task esperando sua decisão → abre o modal de resposta inline */}
        {st === "pending" && (
          <button
            onClick={() => onRespond(t)}
            className="text-[10.5px] font-bold px-2 py-0.5 rounded-md text-[#fbbf24] bg-[rgba(251,191,36,0.16)] hover:brightness-125"
          >
            ⚠ responder
          </button>
        )}
        {t.url && (
          <a
            href={t.url}
            target="_blank"
            rel="noreferrer"
            className="text-[10.5px] font-bold px-2 py-0.5 rounded-md text-[#9a93b3] bg-white/5 hover:text-white"
          >
            #{t.number}
          </a>
        )}
      </div>
    </div>
  );
}

function AgentColumn({
  agent,
  color,
  tasks,
  statusByRef,
  onRespond,
}: {
  agent: CoordAgent;
  color: string;
  tasks: CoordTask[];
  statusByRef: Map<string, TaskStatus>;
  onRespond: (t: CoordTask) => void;
}): React.ReactNode {
  const busy = agent.active_claims > 0 || Boolean(agent.current_ref);
  const pill = !agent.enabled
    ? { label: "Pausado", color: "#ec4899" }
    : busy
      ? { label: "Ocupado", color: "#fbbf24" }
      : { label: "Livre", color: "#34d399" };

  return (
    <div className="rounded-2xl backdrop-blur-md border border-[rgba(168,85,247,0.25)] bg-[rgba(20,14,38,0.6)] overflow-hidden">
      <div className="px-4 py-4 flex items-center gap-3 border-b border-[rgba(168,85,247,0.25)]">
        <div
          className="w-9 h-9 rounded-xl grid place-items-center text-sm font-bold text-white"
          style={{ background: color }}
        >
          {initials(agent.nome)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{agent.nome}</div>
          <div className="text-xs text-[#9a93b3] truncate">
            {agent.role}
            {agent.projetos.length > 0 &&
              ` · ${agent.projetos.map((p) => p.replace(/^hmtrack-/, "")).join(", ")}`}
          </div>
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md"
          style={{ color: pill.color, background: `${pill.color}1f` }}
          title={
            !agent.enabled
              ? "desativado na Agenda (enabled=false)"
              : busy
                ? "tem claim/dispatch ativo"
                : "ativo e ocioso"
          }
        >
          {pill.label}
        </span>
      </div>
      <div className="p-3.5 flex flex-col gap-3">
        {tasks.length === 0 && (
          <div className="text-[#6b6485] text-xs px-1 py-2">Sem tasks ativas.</div>
        )}
        {tasks.map((t) => (
          <TaskCard
            key={t.source_ref}
            task={t}
            statusByRef={statusByRef}
            onRespond={onRespond}
          />
        ))}
      </div>
    </div>
  );
}

function QueueColumn({
  tasks,
  statusByRef,
  onRespond,
}: {
  tasks: CoordTask[];
  statusByRef: Map<string, TaskStatus>;
  onRespond: (t: CoordTask) => void;
}): React.ReactNode {
  return (
    <div className="rounded-2xl backdrop-blur-md border border-[rgba(56,189,248,0.35)] bg-[rgba(20,14,38,0.6)] overflow-hidden">
      <div className="px-4 py-4 flex items-center gap-3 border-b border-[rgba(56,189,248,0.35)]">
        <div
          className="w-9 h-9 rounded-xl grid place-items-center text-base"
          style={{ background: "rgba(56,189,248,0.15)" }}
        >
          📋
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">Fila — não atribuídas</div>
          <div className="text-xs text-[#9a93b3] truncate">
            tasks visíveis sem agente ativo
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md text-[#38bdf8] bg-[rgba(56,189,248,0.12)]">
          {tasks.length}
        </span>
      </div>
      <div className="p-3.5 flex flex-col gap-3 max-h-[640px] overflow-auto">
        {tasks.map((t) => (
          <TaskCard
            key={t.source_ref}
            task={t}
            statusByRef={statusByRef}
            onRespond={onRespond}
          />
        ))}
      </div>
    </div>
  );
}
