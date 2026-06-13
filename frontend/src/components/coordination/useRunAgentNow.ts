import { useState } from "react";

import { runAgentNow, type CoordAgent } from "./coordinationApi";

export interface RunAgentNowState {
  /** Requisição do Play em voo (botão pulsando). */
  running: boolean;
  /** Canônico 'Em execução': claim/loop REAL (active_claims/current_ref) OU o
   *  override otimista do `started`, até o poll trazer o claim. Alimenta o pill
   *  de estado do agente (Ocupado). */
  busy: boolean;
  /** Toast claro de `already_running` ('já em execução') ou erro — NUNCA o
   *  'iniciado' transitório: o sucesso vira o pill 'Ocupado', não uma label. */
  msg: string | null;
  runNow: () => Promise<void>;
}

/** ▶ Play do agente (#833) com feedback canônico 'Em execução' (#839): o sucesso
 *  (`started`) NÃO vira uma label 'iniciado' avulsa — reflete o agente como
 *  OCUPADO (o MESMO pill que o board já usa), via override otimista que o poll
 *  assume assim que o claim real aparece. `already_running` → 'já em execução'. */
export function useRunAgentNow(agent: CoordAgent | null): RunAgentNowState {
  const [running, setRunning] = useState(false);
  const [startedOpt, setStartedOpt] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const realBusy = agent
    ? agent.active_claims > 0 || Boolean(agent.current_ref)
    : false;

  // Ajuste de estado em render (padrão React, não-effect): quando o poll traz o
  // claim/loop REAL, a verdade assume e o override otimista sai — senão `busy`
  // ficaria preso em true depois que o run terminasse e liberasse o claim.
  const [prevRealBusy, setPrevRealBusy] = useState(realBusy);
  if (realBusy !== prevRealBusy) {
    setPrevRealBusy(realBusy);
    if (realBusy && startedOpt) setStartedOpt(false);
  }

  const runNow = async (): Promise<void> => {
    if (!agent) return;
    setRunning(true);
    setMsg(null);
    try {
      const res = await runAgentNow(agent.nome);
      if (res.status === "already_running") setMsg("já em execução");
      else setStartedOpt(true); // started → reflete 'Em execução' (Ocupado)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "erro");
    } finally {
      setRunning(false);
    }
  };

  return { running, busy: realBusy || startedOpt, msg, runNow };
}
