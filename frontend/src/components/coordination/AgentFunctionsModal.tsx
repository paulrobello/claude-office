"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import Modal from "@/components/overlay/Modal";
import { type CoordAgent, execAgentFunction } from "./coordinationApi";
import { AGENT_FUNCTIONS_REGISTRY, type AgentFunction } from "@/lib/agentFunctions";
import { useJobStore } from "@/stores/jobStore";

export function AgentFunctionsModal({
  agent,
  onClose,
}: {
  agent: CoordAgent;
  onClose: () => void;
}): React.ReactElement {
  const functions: AgentFunction[] = AGENT_FUNCTIONS_REGISTRY[agent.nome] ?? [];
  const startJob = useJobStore((s) => s.startJob);
  const [executing, setExecuting] = useState<string | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  async function handleExecute(fn: AgentFunction) {
    setExecuting(fn.id);
    setExecError(null);
    try {
      const { job_id } = await execAgentFunction(agent.nome, fn.id);
      startJob(job_id, agent.nome, fn.label);
      setExecuting(null);
      onClose();
    } catch (err) {
      setExecError(err instanceof Error ? err.message : "Erro desconhecido");
      setExecuting(null);
    }
  }

  return (
    <Modal isOpen title={`Funções — ${agent.nome}`} onClose={onClose}>
      {functions.length === 0 ? (
        <p className="text-slate-500 text-sm">
          Nenhuma função disponível para este agente.
        </p>
      ) : (
        <ul className="space-y-3">
          {functions.map((fn) => (
            <li
              key={fn.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950 p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-100">{fn.label}</p>
                <p className="mt-1 text-xs text-slate-500">{fn.description}</p>
              </div>
              <button
                onClick={() => handleExecute(fn)}
                disabled={executing === fn.id}
                className="flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <Play size={12} />
                {executing === fn.id ? "Iniciando..." : "Executar"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {execError && (
        <p className="mt-3 text-xs text-rose-400">Erro: {execError}</p>
      )}
    </Modal>
  );
}
