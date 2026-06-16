"use client";

import { useState } from "react";
import Modal from "@/components/overlay/Modal";
import { useTranslation } from "@/hooks/useTranslation";
import { approveBacklog, type CoordTask } from "./coordinationApi";

interface Props {
  task: CoordTask | null;
  onClose: () => void;
  /** Aprovada (backlogs→afk) com sucesso → o pai marca otimista + re-sincroniza. */
  onApproved: (ref: string) => void | Promise<void>;
}

/**
 * Modal de um item do BACKLOG (label `backlogs`): mostra o item e oferece UM botão
 * "Aprovar para desenvolvimento" — remove `backlogs` + adiciona `afk` (entra na fila
 * do dispatch). SEM Play/dispatch direto: o backlog não vai pro agente na hora, só
 * é promovido pro fluxo de dev. Reusado no /tasks e no /dashboard.
 */
export default function BacklogApproveModal({
  task,
  onClose,
  onApproved,
}: Props): React.ReactNode {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!task) return null;

  const hasArea = task.labels.some((l) => l.startsWith("area:"));

  const approve = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await approveBacklog(task.source_ref);
      await onApproved(task.source_ref);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "erro");
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <button
      onClick={() => void approve()}
      disabled={busy}
      title={t("tasks.backlogApproveTitle")}
      className="px-4 py-2 rounded text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
    >
      {busy ? t("tasks.processing") : `✓ ${t("tasks.backlogApprove")}`}
    </button>
  );

  return (
    <Modal
      isOpen={task !== null}
      onClose={onClose}
      title={`#${task.number} — ${task.title ?? ""}`}
      footer={footer}
    >
      <div className="text-sm text-slate-300 mb-2 font-bold">
        🗃️ {t("tasks.status.backlog")}
      </div>
      <div className="text-sm text-slate-400 mb-3">{task.project ?? "—"}</div>
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {task.labels.map((l) => (
            <span
              key={l}
              className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 border border-slate-700"
            >
              {l}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm text-slate-400">{t("tasks.backlogModalHint")}</p>
      {!hasArea && (
        <p className="mt-2 text-xs text-amber-400">
          {t("tasks.backlogNoArea")}
        </p>
      )}
      {task.url && (
        <a
          href={task.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-xs text-sky-400 hover:underline"
        >
          ↗ {t("tasks.openIssue")}
        </a>
      )}
      {err && <p className="mt-2 text-rose-400 text-xs">{err}</p>}
    </Modal>
  );
}
