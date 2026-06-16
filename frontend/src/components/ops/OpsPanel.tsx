"use client";

import { useEffect, useState } from "react";
import { useDestinations } from "./useDestinations";
import { useOpsRun } from "./useOpsRun";
import { useOpsStatus } from "./useOpsStatus";
import { useOpsStream } from "./useOpsStream";
import { DestinationSelect } from "./DestinationSelect";
import { DestinationEditModal } from "./DestinationEditModal";
import { DeployConfirmModal } from "./DeployConfirmModal";
import { OpsLogPanel } from "./OpsLogPanel";

/**
 * Container de ops/deploy: wira os hooks (destinos, status, run, stream WS) nos
 * componentes apresentacionais. Restaura um run em andamento ao montar (seed do
 * log_tail) e bloqueia ações enquanto há deploy rodando.
 */
export function OpsPanel(): React.ReactNode {
  const { items, create, update, remove } = useDestinations();
  const { status, refresh } = useOpsStatus();
  const { start, running, msg } = useOpsRun();
  const stream = useOpsStream();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [managing, setManaging] = useState(false);

  const busy = Boolean(status?.running) || running;
  const current =
    items.find((d) => d.id === (selected ?? status?.dest_id)) ??
    items[0] ??
    null;

  useEffect(() => {
    // seleção default = primeiro destino, só até o usuário escolher.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selected && items[0]) setSelected(items[0].id);
  }, [items, selected]);

  // restaura run em andamento ao montar/refresh (linhas já emitidas vêm do log_tail)
  useEffect(() => {
    if (status?.running && status.log_tail.length) stream.seed(status.log_tail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.running]);

  // Quando o run termina (ops.result chega pelo WS), re-sincroniza o status
  // pra limpar o `status.running` stale e reabilitar o botão.
  useEffect(() => {
    if (stream.result) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.result]);

  // A página /servidores NÃO monta o WebSocket de sessão (só /office monta), então
  // as mensagens `ops.*` nunca chegam aqui. Enquanto há um run ativo, poll do
  // /status (que carrega o log_tail autoritativo) garante log ao vivo sem WS.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => void refresh(), 1500);
    return () => clearInterval(id);
  }, [busy, refresh]);

  const onConfirm = async (dryRun: boolean): Promise<void> => {
    setConfirming(false);
    if (!current) return;
    stream.reset();
    const ok = await start(current.id, dryRun);
    if (ok) await refresh();
  };

  const onDelete = async (id: string): Promise<void> => {
    if (!window.confirm(`Remover o destino "${id}"? Esta ação é irreversível.`))
      return;
    await remove(id);
  };

  // Fontes de exibição: prefere o stream WS (real-time) e cai pro /status polled
  // quando o WS não está entregando (caso da página /servidores).
  const displayLines =
    stream.lines.length > 0 ? stream.lines : (status?.log_tail ?? []);
  const displayStep =
    stream.step !== "idle" && stream.step !== ""
      ? stream.step
      : (status?.step ?? "idle");
  const displayResult =
    stream.result ??
    (status && (status.step === "done" || status.step === "failed")
      ? { status: status.step, exit_code: status.exit_code ?? -1 }
      : null);

  const stepLabel = displayStep !== "idle" ? displayStep : "";

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <DestinationSelect
          items={items}
          value={current?.id ?? null}
          onChange={setSelected}
          onManage={() => setManaging(true)}
          disabled={busy}
        />
        <button
          className="px-4 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
          disabled={busy || !current}
          onClick={() => setConfirming(true)}
        >
          {busy
            ? `rodando… · ${stepLabel}`
            : `Atualizar ${current?.label ?? ""}`}
        </button>
      </div>
      {msg && <p className="text-amber-400 text-sm mb-2">{msg}</p>}
      {(displayLines.length > 0 || busy || displayResult) && (
        <OpsLogPanel
          lines={displayLines}
          step={displayStep}
          result={displayResult}
        />
      )}
      {confirming && current && (
        <DeployConfirmModal
          label={current.label}
          onConfirm={(d) => {
            void onConfirm(d);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
      {managing && (
        <DestinationEditModal
          items={items}
          disabled={busy}
          onClose={() => setManaging(false)}
          onCreate={create}
          onUpdate={update}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
