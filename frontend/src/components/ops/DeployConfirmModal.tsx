"use client";

import { useState } from "react";
import Modal from "@/components/overlay/Modal";

/**
 * Modal de confirmação de deploy (apresentacional). Mirror do BacklogApproveModal:
 * usa o wrapper compartilhado `@/components/overlay/Modal` (overlay/header/footer
 * padronizados). Sem fetch — chama `onConfirm(dryRun)`/`onCancel`.
 */
export function DeployConfirmModal({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: (dryRun: boolean) => void;
  onCancel: () => void;
}): React.ReactNode {
  const [dryRun, setDryRun] = useState(false);

  const footer = (
    <>
      <button
        className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100"
        onClick={onCancel}
      >
        Cancelar
      </button>
      <button
        className="px-4 py-2 text-sm font-bold bg-sky-600 hover:bg-sky-500 text-white rounded"
        onClick={() => onConfirm(dryRun)}
      >
        Confirmar
      </button>
    </>
  );

  return (
    <Modal isOpen onClose={onCancel} title="Atualizar servidor" footer={footer}>
      <p className="text-sm text-slate-300 mb-4">
        ⚠️ Isso vai <b>buildar as 14 imagens</b> e atualizar o servidor{" "}
        <b>{label}</b>. Confirmar?
      </p>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
        />
        Apenas dry-run (mostra o plano, não builda/deploya)
      </label>
    </Modal>
  );
}
