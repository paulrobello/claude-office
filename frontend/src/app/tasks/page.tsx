"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { CoordinationNav } from "@/components/coordination/CoordinationNav";
import { useTranslation, type TranslationKey } from "@/hooks/useTranslation";
import { useCoordinationPoll } from "@/components/coordination/useCoordinationPoll";
import {
  fetchTasks,
  fetchHitlPending,
  answerHitl,
  setTaskPriority,
  approveTask,
  removeFromQueue,
  fetchAgents,
  type CoordTask,
  type CoordAgent,
  type HitlPrompt,
  type HitlAnswerValue,
} from "@/components/coordination/coordinationApi";
import { approveAction } from "@/components/coordination/taskBatch";
import TaskDetailModal from "@/components/coordination/TaskDetailModal";
import HitlAnswerModal from "@/components/coordination/HitlAnswerModal";
import { CreateTaskForm } from "@/components/coordination/CreateTaskForm";
import {
  deriveStatus,
  statusGroup,
  groupAndSortTasks,
  queueRank,
  formatStuckTime,
  DEFAULT_SLA_MS,
  type TaskStatus,
} from "@/components/coordination/taskStatus";
import {
  areaKeysOf,
  agentKeysOf,
  buildAreaToAgents,
  matchesFilters,
  toggleFacet,
  emptyFilters,
  showsClosed,
  facetCounts,
  filtersToQuery,
  filtersFromQuery,
  type TaskFilters,
  type FacetName,
} from "@/components/coordination/taskFilters";
import { TaskFilterBar } from "@/components/coordination/TaskFilterBar";

/** Mark do GitHub inline (lucide removeu ícones de marca nesta versão). */
function GithubMark({ size = 18 }: { size?: number }): React.ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  pending: "text-amber-400",
  error: "text-rose-400",
  running: "text-sky-400",
  waiting_agent: "text-sky-300",
  todo: "text-slate-200",
  sem_agente: "text-fuchsia-300",
  sem_dono: "text-slate-400",
  done: "text-emerald-400",
  backlog: "text-yellow-600",
  unknown: "text-slate-500",
};

// Qual timestamp medir o "tempo parado" por status.
function stuckSince(t: CoordTask, status: TaskStatus): string | null {
  if (status === "error") return t.run_ended_at ?? t.run_started_at;
  if (status === "running" || status === "waiting_agent")
    return t.claimed_at ?? t.run_started_at;
  return t.source_updated_at;
}

function agentModel(t: CoordTask, status: TaskStatus): string {
  const agent =
    status === "error" ? t.run_agent : (t.claim_agent ?? t.run_agent);
  const model =
    status === "error" ? t.run_model : (t.claim_model ?? t.run_model);
  if (!agent) return "";
  return model ? `${agent} · ${model}` : agent;
}

export default function TasksPage(): React.ReactNode {
  const { t: tr } = useTranslation();
  const [selectedPrompt, setSelectedPrompt] = useState<HitlPrompt | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [detailTask, setDetailTask] = useState<CoordTask | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  // Filtros multi-seleção (#818): Status, Projeto/Área, Agente. Default vazio =
  // mostra todo o trabalho vivo e ESCONDE as fechadas (done não vem marcado).
  // Hidrata da querystring no lazy init (client-only; SSR cai no vazio) —
  // compartilhável + sobrevive reload, sem setState-in-effect.
  const [filters, setFilters] = useState<TaskFilters>(() =>
    typeof window === "undefined"
      ? emptyFilters()
      : filtersFromQuery(window.location.search),
  );
  // refs aprovados nesta sessão: somem de "Precisa de você" na hora (otimista),
  // sem esperar o coletor re-sincronizar o relabel hitl→afc no /tasks.
  const [resolved, setResolved] = useState<Set<string>>(() => new Set());
  // refs com ação em voo: mostram "processando" e botões desabilitados.
  const [processing, setProcessing] = useState<Set<string>>(() => new Set());
  // reordenação OTIMISTA da fila (o label só reflete no /tasks após o sync do
  // coletor ~5min; aqui sobe/desce na hora). prioritized: mais recente primeiro.
  const [prioritized, setPrioritized] = useState<string[]>([]);
  const [deprioritized, setDeprioritized] = useState<Set<string>>(
    () => new Set(),
  );
  // nowMs sai de estado (lazy init, não Date.now() em render — regra
  // react-hooks/purity); o intervalo faz o "tempo parado" avançar.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Espelha os filtros na URL sem navegar (replaceState).
  useEffect(() => {
    const qs = filtersToQuery(filters);
    window.history.replaceState(null, "", qs || window.location.pathname);
  }, [filters]);

  // OPEN sempre; as CLOSED só entram quando "Concluída" é marcada — buscar todas
  // as fechadas (513!) estourava o LIMIT e expulsava OPEN antigas. Limite 200 nas
  // mais recentes é suficiente pra auditoria pontual.
  const showClosed = showsClosed(filters);
  const { data, loading, unavailable, error, refetch } = useCoordinationPoll(
    () => fetchTasks("?state=OPEN"),
    [],
  );
  const { data: closedData } = useCoordinationPoll(
    () =>
      showClosed
        ? fetchTasks("?state=CLOSED&limit=200")
        : Promise.resolve({ tasks: [] }),
    [showClosed],
  );
  const { data: hitlData, refetch: refetchHitl } = useCoordinationPoll(
    fetchHitlPending,
    [],
  );
  // Agentes ativos agora (inclui coordenação: triador/QA/gerente) — pra "Em
  // andamento" não ficar vazio enquanto a tela Agentes mostra alguém busy.
  const { data: agentsData } = useCoordinationPoll(() => fetchAgents(""), []);

  // Ignora prompts expirados (expires_at no passado): pendência morta não conta.
  const prompts = useMemo(
    () =>
      (hitlData?.prompts ?? []).filter(
        (p) => !p.expires_at || Date.parse(p.expires_at) > nowMs,
      ),
    [hitlData, nowMs],
  );
  const promptsByRef = useMemo(() => {
    const m = new Map<string, HitlPrompt[]>();
    for (const p of prompts) {
      if (!p.source_ref) continue;
      const l = m.get(p.source_ref) ?? [];
      l.push(p);
      m.set(p.source_ref, l);
    }
    return m;
  }, [prompts]);

  // Mapa área → agentes do roster (faceta Agente: deriva "dono" pela área).
  const areaToAgents = useMemo(
    () => buildAreaToAgents(agentsData?.agents ?? []),
    [agentsData],
  );

  // Universo de tasks: OPEN sempre + CLOSED só quando "Concluída" está marcada.
  const allTasks = useMemo(
    () => [...(data?.tasks ?? []), ...(showClosed ? (closedData?.tasks ?? []) : [])],
    [data, closedData, showClosed],
  );

  // Aplica as 3 facetas (AND entre facetas, OR dentro). Default vazio = tudo
  // que é OPEN; sem `done` marcado, as CLOSED nem entram em allTasks.
  const filtered = useMemo(
    () => allTasks.filter((t) => matchesFilters(t, prompts, filters, areaToAgents)),
    [allTasks, prompts, filters, areaToAgents],
  );

  // Opções das facetas Projeto/Área e Agente, derivadas dos dados (data-driven).
  const areaOptions = useMemo(() => {
    const s = new Set<string>();
    for (const t of allTasks) for (const a of areaKeysOf(t)) s.add(a);
    return [...s].sort();
  }, [allTasks]);
  const agentOptions = useMemo(() => {
    const s = new Set<string>();
    for (const t of allTasks) for (const a of agentKeysOf(t, areaToAgents)) s.add(a);
    return [...s].sort();
  }, [allTasks, areaToAgents]);

  // Contadores por opção (respeitam as outras facetas marcadas).
  const counts = useMemo(
    () => ({
      status: facetCounts("status", allTasks, prompts, filters, areaToAgents),
      area: facetCounts("area", allTasks, prompts, filters, areaToAgents),
      agent: facetCounts("agent", allTasks, prompts, filters, areaToAgents),
    }),
    [allTasks, prompts, filters, areaToAgents],
  );

  // Fechadas que passam pelos filtros (só aparecem com "Concluída" marcada).
  const doneTasks = useMemo(
    () =>
      filtered
        .filter((t) => deriveStatus(t, prompts) === "done")
        .sort((a, b) => b.number - a.number),
    [filtered, prompts],
  );

  const groups = useMemo(() => {
    const g = groupAndSortTasks(filtered, prompts);
    // Aprovadas/removidas nesta sessão somem na hora (otimista). E a fila reordena
    // otimista por prioritized/deprioritized (o label só reflete após o sync ~5min).
    const effRank = (t: CoordTask) =>
      prioritized.includes(t.source_ref)
        ? 0
        : deprioritized.has(t.source_ref)
          ? 2
          : queueRank(t);
    const prioIdx = (t: CoordTask) => {
      const i = prioritized.indexOf(t.source_ref);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return {
      ...g,
      need_you: g.need_you.filter((t) => !resolved.has(t.source_ref)),
      queue: g.queue
        .filter((t) => !resolved.has(t.source_ref))
        .sort(
          (a, b) =>
            effRank(a) - effRank(b) ||
            prioIdx(a) - prioIdx(b) ||
            a.number - b.number,
        ),
    };
  }, [filtered, prompts, resolved, prioritized, deprioritized]);

  // "Precisa de você" se divide em Erros (precisam retry) e Pendentes (aguardam você).
  const errorTasks = useMemo(
    () => groups.need_you.filter((t) => deriveStatus(t, prompts) === "error"),
    [groups, prompts],
  );
  const pendingTasks = useMemo(
    () => groups.need_you.filter((t) => deriveStatus(t, prompts) === "pending"),
    [groups, prompts],
  );
  // Agentes busy cujo trabalho NÃO é uma issue já listada em "Em andamento"
  // (ex.: coordenação — triador/QA/gerente). Evita "Agents diz busy, Tasks vazio".
  const busyAgents = useMemo(() => {
    const inProg = new Set(groups.in_progress.map((t) => t.source_ref));
    return (agentsData?.agents ?? []).filter(
      (a: CoordAgent) =>
        a.status === "busy" && !(a.current_ref && inProg.has(a.current_ref)),
    );
  }, [agentsData, groups]);

  // Prompts sem task casada na lista atual — não podem sumir (brecha HITL).
  // Usa `allTasks` (inclui as fechadas quando `Concluída` está marcado), senão
  // um prompt pendente cujo source_ref casa uma task FECHADA apareceria órfão.
  const orphanPrompts = useMemo(() => {
    const refs = new Set(allTasks.map((t) => t.source_ref));
    return prompts.filter((p) => !p.source_ref || !refs.has(p.source_ref));
  }, [prompts, allTasks]);

  const handleAnswer = async (id: number, answer: HitlAnswerValue) => {
    await answerHitl(id, answer);
    await refetchHitl();
    await refetch();
  };

  const markProcessing = (ref: string, on: boolean) =>
    setProcessing((s) => {
      const n = new Set(s);
      if (on) n.add(ref);
      else n.delete(ref);
      return n;
    });

  const withProcessing = async (
    ref: string,
    fn: () => Promise<void>,
    msg: string,
  ) => {
    markProcessing(ref, true);
    try {
      await fn();
      setFeedback(msg);
      void refetch(); // background, não bloqueia a UI
    } catch (e) {
      setFeedback(`${ref} falhou: ${e instanceof Error ? e.message : "erro"}`);
    } finally {
      markProcessing(ref, false);
    }
  };

  const onSkip = (ref: string) => {
    setDeprioritized((prev) => new Set(prev).add(ref));
    setPrioritized((prev) => prev.filter((r) => r !== ref));
    void withProcessing(
      ref,
      async () => {
        await setTaskPriority(ref, "bottom");
      },
      `${ref} → fim da fila`,
    );
  };
  const onRetry = (ref: string) =>
    void withProcessing(
      ref,
      async () => {
        await setTaskPriority(ref, "top");
      },
      `${ref} → topo da fila (retry)`,
    );
  const onRemove = (ref: string) =>
    void withProcessing(
      ref,
      async () => {
        await removeFromQueue(ref);
        setResolved((s) => new Set(s).add(ref)); // some da fila na hora
      },
      `${ref} removida da fila`,
    );
  // Priorizar: joga pro topo da fila (fila:topo) → próximo ciclo do gerente pega primeiro.
  const onPrioritize = (ref: string) => {
    setPrioritized((prev) => [ref, ...prev.filter((r) => r !== ref)]);
    setDeprioritized((prev) => {
      const n = new Set(prev);
      n.delete(ref);
      return n;
    });
    void withProcessing(
      ref,
      async () => {
        await setTaskPriority(ref, "top");
      },
      `${ref} → topo da fila (próxima a fazer)`,
    );
  };

  // Aprovação direta (1 clique): responde o prompt do banco OU libera o label
  // hitl. Hide otimista: a task some de "Precisa de você" assim que o servidor
  // confirma, sem esperar o coletor re-sincronizar (refetch roda em background).
  const onApproveRow = async (t: CoordTask) => {
    const ref = t.source_ref;
    const prompt = promptsByRef.get(ref)?.[0];
    const act = approveAction(t, prompt);
    if (act.kind === "modal" && prompt) {
      setSelectedPrompt(prompt); // precisa de escolha → abre o modal
      return;
    }
    if (act.kind === "none") {
      setFeedback(`#${t.number} não é aprovável`);
      return;
    }
    markProcessing(ref, true);
    try {
      if (act.kind === "answer" && prompt)
        await answerHitl(prompt.id, act.value);
      else if (act.kind === "relabel") await approveTask(ref);
      setResolved((s) => new Set(s).add(ref)); // some da lista AGORA
      setFeedback(`#${t.number} aprovada`);
      void refetchHitl();
      void refetch();
    } catch (e) {
      setFeedback(
        `#${t.number} falhou: ${e instanceof Error ? e.message : "erro"}`,
      );
    } finally {
      markProcessing(ref, false);
    }
  };

  // Clique no título/código → detalhes (prompt do banco abre o modal HITL).
  const openDetail = (t: CoordTask) => {
    const prompt = promptsByRef.get(t.source_ref)?.[0];
    if (prompt) setSelectedPrompt(prompt);
    else setDetailTask(t);
  };

  const toggleSel = (ref: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(ref)) n.delete(ref);
      else n.add(ref);
      return n;
    });
  const selectAllNeedYou = (refs: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const r of refs) {
        if (on) n.add(r);
        else n.delete(r);
      }
      return n;
    });
  const onBatchApprove = async () => {
    const sel = (data?.tasks ?? []).filter((t) => selected.has(t.source_ref));
    const refs = sel.map((t) => t.source_ref);
    setProcessing((s) => {
      const n = new Set(s);
      refs.forEach((r) => n.add(r));
      return n;
    });
    setSelected(new Set());
    let answered = 0;
    let relabeled = 0;
    let manual = 0;
    const done: string[] = [];
    for (const t of sel) {
      const prompt = promptsByRef.get(t.source_ref)?.[0];
      const act = approveAction(t, prompt);
      try {
        if (act.kind === "answer" && prompt) {
          await answerHitl(prompt.id, act.value);
          answered++;
          done.push(t.source_ref);
        } else if (act.kind === "relabel") {
          await approveTask(t.source_ref);
          relabeled++;
          done.push(t.source_ref);
        } else if (act.kind === "modal") {
          manual++;
        }
      } catch {
        manual++;
      }
    }
    setResolved((s) => {
      const n = new Set(s);
      done.forEach((r) => n.add(r));
      return n;
    });
    setProcessing((s) => {
      const n = new Set(s);
      refs.forEach((r) => n.delete(r));
      return n;
    });
    setFeedback(
      `Aprovadas: ${answered + relabeled} (${relabeled} liberadas, ${answered} respondidas)` +
        (manual
          ? ` · ${manual} precisam de decisão individual (abra os detalhes)`
          : ""),
    );
    void refetchHitl();
    void refetch();
  };
  const onBatchSkip = async () => {
    const n = selected.size;
    for (const ref of Array.from(selected))
      await setTaskPriority(ref, "bottom");
    setFeedback(`${n} despriorizada(s)`);
    setSelected(new Set());
    await refetch();
  };
  // Toggle de uma caixa de faceta (#818): atualiza filtros → re-renderiza a lista.
  const onToggleFacet = (facet: FacetName, value: string) =>
    setFilters((f) => toggleFacet(f, facet, value));
  const clearFilters = () => setFilters(emptyFilters());
  const filterCount =
    filters.status.size + filters.area.size + filters.agent.size;

  const renderRow = (t: CoordTask, queuePos?: number) => {
    const status = deriveStatus(t, prompts);
    const stuck = formatStuckTime(stuckSince(t, status), nowMs, DEFAULT_SLA_MS);
    const am = agentModel(t, status);
    const busy = processing.has(t.source_ref);
    return (
      <div
        key={t.source_ref}
        className="flex items-center gap-3 px-3 py-3 border-t border-slate-900 hover:bg-slate-900/40"
      >
        {queuePos !== undefined && (
          <span
            className="text-xs font-bold text-slate-200 bg-slate-700 rounded px-1.5 py-0.5 shrink-0 w-8 text-center"
            title="posição na fila"
          >
            {queuePos}
          </span>
        )}
        {statusGroup(status) === "need_you" && (
          <input
            type="checkbox"
            className="w-4 h-4 shrink-0"
            checked={selected.has(t.source_ref)}
            onChange={() => toggleSel(t.source_ref)}
          />
        )}
        <button
          onClick={() => openDetail(t)}
          className="font-mono font-bold text-base w-16 shrink-0 text-left hover:text-sky-400"
        >
          #{t.number}
        </button>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => openDetail(t)}
            className="truncate block text-left w-full hover:text-sky-400"
          >
            {t.title ?? "—"}
          </button>
          <div className="text-xs text-slate-500 mt-0.5">
            {t.project ?? "—"}
            {am && <span> · {am}</span>}
            {status === "error" && t.run_status && (
              <span className="text-rose-400/80"> · {t.run_status}</span>
            )}
          </div>
        </div>
        <div
          className={`text-sm font-bold w-44 shrink-0 ${STATUS_COLOR[status]}`}
        >
          {tr(`tasks.status.${status}` as TranslationKey)}
          {stuck.label && (
            <span
              className={
                stuck.overdue ? "text-rose-400 ml-1" : "text-slate-500 ml-1"
              }
            >
              {" "}
              · {stuck.label}
              {stuck.overdue ? " 🔴" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {busy ? (
            <span className="text-sm font-bold text-sky-300 animate-pulse px-2">
              ⏳ {tr("tasks.processing")}
            </span>
          ) : (
            <>
              {status === "pending" && (
                <>
                  <button
                    onClick={() => void onApproveRow(t)}
                    className="px-3 py-1.5 rounded text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    ✓ {tr("tasks.approve")}
                  </button>
                  <button
                    onClick={() => onSkip(t.source_ref)}
                    className="px-3 py-1.5 rounded text-sm font-bold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700"
                  >
                    ⤓ {tr("tasks.skip")}
                  </button>
                </>
              )}
              {status === "error" && (
                <button
                  onClick={() => onRetry(t.source_ref)}
                  className="px-3 py-1.5 rounded text-sm font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30"
                >
                  ↻ {tr("tasks.retry")}
                </button>
              )}
              {(status === "todo" ||
                status === "sem_dono" ||
                status === "sem_agente") && (
                <>
                  <button
                    onClick={() => onPrioritize(t.source_ref)}
                    className="px-3 py-1.5 rounded text-sm font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                  >
                    ↑ {tr("tasks.prioritize")}
                  </button>
                  <button
                    onClick={() => onRemove(t.source_ref)}
                    className="px-3 py-1.5 rounded text-sm font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-rose-500/20 hover:text-rose-300"
                  >
                    ✕ {tr("tasks.removeFromQueue")}
                  </button>
                </>
              )}
            </>
          )}
          {t.url && (
            <a
              href={t.url}
              target="_blank"
              rel="noreferrer"
              title={tr("tasks.openIssue")}
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <GithubMark size={18} />
            </a>
          )}
        </div>
      </div>
    );
  };

  const renderGroup = (
    titleKey: TranslationKey,
    tasks: CoordTask[],
    accent: string,
    batch = false,
    numbered = false,
  ) => {
    const refs = tasks.map((t) => t.source_ref);
    const selCount = refs.filter((r) => selected.has(r)).length;
    const allSel = refs.length > 0 && selCount === refs.length;
    return (
      <section className="mb-5">
        <h2 className={`text-sm font-extrabold tracking-wide mb-1 ${accent}`}>
          {tr(titleKey)} — {tasks.length}
        </h2>
        {batch && tasks.length > 0 && (
          <div className="flex items-center gap-2 mb-2 flex-wrap text-sm">
            <label className="flex items-center gap-2 text-slate-300 font-semibold cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={allSel}
                onChange={(e) => selectAllNeedYou(refs, e.target.checked)}
              />
              {tr("tasks.selectAll")}
            </label>
            <button
              disabled={selCount === 0}
              onClick={() => void onBatchApprove()}
              className="px-3 py-1.5 rounded font-bold bg-emerald-600 text-white disabled:opacity-40"
            >
              ✓ {tr("tasks.batchApprove")}
            </button>
            <button
              disabled={selCount === 0}
              onClick={() => void onBatchSkip()}
              className="px-3 py-1.5 rounded font-bold bg-slate-700 text-slate-100 disabled:opacity-40"
            >
              ⤓ {tr("tasks.batchSkip")}
            </button>
            {selCount > 0 && (
              <span className="text-slate-500">{selCount} selecionada(s)</span>
            )}
          </div>
        )}
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          {tasks.length === 0 ? (
            <p className="px-3 py-4 text-slate-600 text-sm">
              {tr("tasks.empty")}
            </p>
          ) : (
            tasks.map((t, i) => renderRow(t, numbered ? i + 1 : undefined))
          )}
        </div>
      </section>
    );
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="text-orange-500">Claude</span> Coordenação
        </h1>
        <Link
          href="/office"
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft size={14} /> Voltar ao escritório
        </Link>
      </div>

      <CoordinationNav />

      <div className="mb-3 flex items-center justify-between gap-2">
        <CreateTaskForm onCreated={() => void refetch()} />
        <button
          onClick={() => void refetch()}
          className="flex items-center gap-1 px-3 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded text-sm font-bold transition-colors shrink-0"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {unavailable && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded text-sm">
          DB de coordenação (:5433) indisponível. Verifique se o container
          <code className="mx-1 px-1 bg-slate-800 rounded">
            hmtrack-coordination-db
          </code>
          está no ar.
        </div>
      )}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded text-sm">
          Erro ao carregar: {error}
        </div>
      )}
      {loading && !data && (
        <p className="text-slate-500 text-sm">Carregando…</p>
      )}

      {feedback && (
        <div className="mb-3 px-3 py-2 rounded bg-sky-500/10 border border-sky-500/30 text-sky-200 text-sm flex items-center justify-between">
          <span>{feedback}</span>
          <button
            onClick={() => setFeedback("")}
            className="text-slate-400 hover:text-white ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {data && !unavailable && (
        <>
          <div className="mb-2 text-sm text-slate-400">
            <b className="text-slate-200">
              {groups.need_you.length +
                groups.in_progress.length +
                groups.queue.length}{" "}
              abertas
            </b>
            {" = "}
            <span className="text-rose-400">{errorTasks.length} erros</span>
            {" · "}
            <span className="text-amber-400">
              {pendingTasks.length} precisa de você
            </span>
            {" · "}
            <span className="text-sky-400">
              {groups.in_progress.length} em andamento
            </span>
            {" · "}
            <span>{groups.queue.length} na fila</span>
          </div>
          <TaskFilterBar
            filters={filters}
            onToggle={onToggleFacet}
            onClear={clearFilters}
            areaOptions={areaOptions}
            agentOptions={agentOptions}
            counts={counts}
            className="mb-3"
          />
          {errorTasks.length > 0 &&
            renderGroup("tasks.group.errors", errorTasks, "text-rose-400")}
          {(pendingTasks.length > 0 || filterCount === 0) &&
            renderGroup(
              "tasks.group.needYou",
              pendingTasks,
              "text-amber-400",
              true,
            )}
          {(groups.in_progress.length > 0 || filterCount === 0) &&
            renderGroup(
              "tasks.group.inProgress",
              groups.in_progress,
              "text-sky-400",
            )}
          {busyAgents.length > 0 && (
            <div className="mb-5 -mt-3">
              <div className="text-xs text-slate-500 mb-1">
                Agentes ativos agora
              </div>
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                {busyAgents.map((a) => (
                  <div
                    key={a.nome}
                    className="flex items-center gap-3 px-3 py-2 border-t border-slate-900 text-sm"
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                    <span className="font-bold text-slate-200">{a.nome}</span>
                    <span className="text-slate-500 text-xs">
                      {a.role}
                      {a.model ? ` · ${a.model}` : ""}
                    </span>
                    <span className="text-sky-300 text-xs ml-auto">
                      {a.current_ref
                        ? `▶ ${a.current_ref}${a.current_title ? ` — ${a.current_title}` : ""}`
                        : "coordenação"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(groups.queue.length > 0 || filterCount === 0) &&
            renderGroup(
              "tasks.group.queue",
              groups.queue,
              "text-slate-400",
              false,
              true,
            )}
          {showClosed &&
            renderGroup("tasks.status.done", doneTasks, "text-emerald-400")}
        </>
      )}

      {orphanPrompts.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-bold text-slate-300 mb-2">
            {tr("hitl.noIssueSection")}
          </h2>
          <ul className="flex flex-col gap-2">
            {orphanPrompts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between border border-slate-800 rounded px-3 py-2"
              >
                <span className="truncate">
                  {p.source_ref && (
                    <span className="font-mono text-slate-500 mr-2">
                      {p.source_ref}
                    </span>
                  )}
                  {p.question}
                </span>
                <button
                  onClick={() => setSelectedPrompt(p)}
                  className="ml-3 px-3 py-1 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded hover:bg-amber-500/30"
                >
                  {tr("hitl.open")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <HitlAnswerModal
        key={`hitl-${selectedPrompt?.id ?? "none"}`}
        prompt={selectedPrompt}
        onClose={() => setSelectedPrompt(null)}
        onSubmit={handleAnswer}
      />

      <TaskDetailModal
        key={`task-${detailTask?.source_ref ?? "none"}`}
        task={detailTask}
        status={detailTask ? deriveStatus(detailTask, prompts) : "unknown"}
        agentModel={
          detailTask
            ? agentModel(detailTask, deriveStatus(detailTask, prompts))
            : ""
        }
        onClose={() => setDetailTask(null)}
        onApprove={() => {
          if (detailTask) void onApproveRow(detailTask);
        }}
        onSkip={(ref) => void onSkip(ref)}
        onRetry={(ref) => void onRetry(ref)}
      />
    </main>
  );
}
