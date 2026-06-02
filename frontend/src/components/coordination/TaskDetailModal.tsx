"use client";

import Modal from "@/components/overlay/Modal";
import { useTranslation, type TranslationKey } from "@/hooks/useTranslation";
import type { CoordTask } from "@/components/coordination/coordinationApi";
import type { TaskStatus } from "@/components/coordination/taskStatus";

interface Props {
  task: CoordTask | null;
  status: TaskStatus;
  agentModel: string;
  onClose: () => void;
  onApprove: (ref: string) => void; // relabel hitl→afk
  onSkip: (ref: string) => void;
  onRetry: (ref: string) => void;
}

/** Modal de detalhes de uma task (sem prompt HITL do banco). Mostra contexto da
 *  issue + ações diretas (Aprovar/Pular/Retry conforme o status). */
export default function TaskDetailModal({
  task,
  status,
  agentModel,
  onClose,
  onApprove,
  onSkip,
  onRetry,
}: Props): React.ReactNode {
  const { t } = useTranslation();
  if (!task) return null;

  const isPendingLabel = status === "pending";
  const isError = status === "error";

  const footer = (
    <>
      {isPendingLabel && (
        <button
          onClick={() => {
            onApprove(task.source_ref);
            onClose();
          }}
          className="px-4 py-2 rounded text-sm font-bold bg-emerald-600 text-white"
        >
          ✓ {t("tasks.approve")}
        </button>
      )}
      {isError && (
        <button
          onClick={() => {
            onRetry(task.source_ref);
            onClose();
          }}
          className="px-4 py-2 rounded text-sm font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40"
        >
          ↻ {t("tasks.retry")}
        </button>
      )}
      <button
        onClick={() => {
          onSkip(task.source_ref);
          onClose();
        }}
        className="px-4 py-2 rounded text-sm font-bold bg-slate-800 text-slate-200 border border-slate-700"
      >
        ⤓ {t("tasks.skip")}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={task !== null}
      onClose={onClose}
      title={`#${task.number} — ${task.title ?? ""}`}
      footer={footer}
    >
      <div className="text-sm text-slate-300 mb-2 font-bold">
        {t(`tasks.status.${status}` as TranslationKey)}
      </div>
      <div className="text-sm text-slate-400 mb-3">
        {task.project ?? "—"}
        {agentModel && <span> · {agentModel}</span>}
      </div>
      {isError && task.run_status && (
        <div className="mb-3 text-sm text-rose-400">
          {t("tasks.status.error")}: {task.run_status}
        </div>
      )}
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
      {task.url && (
        <a
          href={task.url}
          target="_blank"
          rel="noreferrer"
          className="block text-xs text-sky-400 hover:underline"
        >
          ↗ {t("tasks.openIssue")}
        </a>
      )}
    </Modal>
  );
}
