"use client";

import { useState } from "react";
import Modal from "@/components/overlay/Modal";
import type { Destination } from "./opsApi";

const EMPTY: Destination = {
  id: "",
  label: "",
  ssh_alias: "",
  remote_base: "/root/project",
  compose_file: "docker-compose.alocalizai.yml",
  front_api_url: "",
  registry: "ghcr.io/isakielsouza",
  image_tag: "",
  enabled: true,
};

// `enabled` (boolean) é intencionalmente EXCLUÍDO — não é editado como texto.
const FIELDS: Array<[keyof Destination, string]> = [
  ["id", "ID (slug)"],
  ["label", "Rótulo"],
  ["ssh_alias", "SSH alias/host"],
  ["remote_base", "Base remota"],
  ["compose_file", "Compose file"],
  ["front_api_url", "URL da API (front)"],
  ["registry", "Registry"],
  ["image_tag", "Tag de imagem"],
];

/**
 * Editor (apresentacional) de destinos: lista + form CRUD. Usa o wrapper
 * compartilhado `@/components/overlay/Modal`. Sem fetch — as mutações chegam por
 * callbacks (`onCreate`/`onUpdate`/`onDelete`); o container wira os hooks.
 */
export function DestinationEditModal({
  items,
  disabled,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  items: Destination[];
  disabled?: boolean;
  onClose: () => void;
  onCreate: (d: Destination) => Promise<void>;
  onUpdate: (d: Destination) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}): React.ReactNode {
  const [draft, setDraft] = useState<Destination>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = (d: Destination) => {
    setDraft({ ...d });
    setEditingId(d.id);
    setErr(null);
  };

  const save = async () => {
    try {
      if (editingId) {
        await onUpdate(draft);
      } else {
        await onCreate(draft);
      }
      setDraft(EMPTY);
      setEditingId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "erro");
    }
  };

  const footer = (
    <>
      <button
        className="px-3 py-1.5 text-sm text-slate-300"
        onClick={() => {
          setDraft(EMPTY);
          setEditingId(null);
        }}
      >
        limpar
      </button>
      <button
        className="px-4 py-1.5 text-sm font-bold bg-sky-600 hover:bg-sky-500 text-white rounded disabled:opacity-40"
        disabled={disabled}
        onClick={() => {
          void save();
        }}
      >
        {editingId ? "Salvar" : "Adicionar"}
      </button>
    </>
  );

  return (
    <Modal isOpen onClose={onClose} title="Destinos" footer={footer}>
      {disabled && (
        <p className="text-amber-400 text-sm mb-3">
          Deploy em andamento — edição bloqueada.
        </p>
      )}
      <ul className="mb-4 divide-y divide-slate-800">
        {items.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between py-2 text-sm text-slate-200"
          >
            <span>
              {d.label} <span className="text-slate-500">({d.ssh_alias})</span>
            </span>
            <span className="flex gap-3">
              <button
                className="text-sky-400 disabled:opacity-40"
                disabled={disabled}
                onClick={() => load(d)}
              >
                editar
              </button>
              <button
                className="text-rose-400 disabled:opacity-40"
                disabled={disabled}
                onClick={() => {
                  void onDelete(d.id);
                }}
              >
                remover
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map(([k, lbl]) => (
          <label key={k} className="text-xs text-slate-400">
            {lbl}
            <input
              className="mt-1 w-full bg-slate-800 text-slate-100 rounded px-2 py-1 border border-slate-700 disabled:opacity-50"
              value={String(draft[k] ?? "")}
              disabled={disabled || (k === "id" && editingId !== null)}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {err && <p className="text-rose-400 text-sm mt-2">{err}</p>}
    </Modal>
  );
}
