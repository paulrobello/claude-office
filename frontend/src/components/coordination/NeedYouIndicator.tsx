"use client";

import { useEffect } from "react";
import { fetchTasks, fetchHitlPending } from "./coordinationApi";
import { useCoordinationPoll } from "./useCoordinationPoll";
import { needYouCount } from "./taskStatus";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Badge global "Precisa de você · N" (pending + error) + título da aba piscando.
 * Renderizado dentro do CoordinationNav, então aparece em todas as abas de
 * coordenação. Lê /tasks + /hitl (poll barato) e deriva o contador com a lógica
 * pura de taskStatus.
 */
export function NeedYouIndicator(): React.ReactNode {
  const { t: tr } = useTranslation();
  const { data: tasksData } = useCoordinationPoll(
    () => fetchTasks("?state=OPEN"),
    [],
  );
  const { data: hitlData } = useCoordinationPoll(fetchHitlPending, []);

  const n = needYouCount(tasksData?.tasks ?? [], hitlData?.prompts ?? []);

  // Título da aba piscando quando há pendência (leve, sem permissão).
  useEffect(() => {
    const base = "claude-office";
    if (n <= 0) {
      document.title = base;
      return;
    }
    let on = false;
    const tick = () => {
      document.title = on ? `(${n}) ⚠ ${base}` : `(${n}) ${base}`;
      on = !on;
    };
    tick();
    const id = window.setInterval(tick, 1500);
    return () => {
      window.clearInterval(id);
      document.title = base;
    };
  }, [n]);

  if (n <= 0) return null;
  return (
    <span
      className="ml-auto px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-bold"
      title={tr("tasks.needYouBadge")}
    >
      ⚠ {tr("tasks.needYouBadge")} · {n}
    </span>
  );
}
