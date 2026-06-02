import type { CoordTask, HitlPrompt, HitlAnswerValue } from "./coordinationApi";

/**
 * O que "Aprovar" faz pra uma task pendente:
 * - answer  → responder o prompt HITL do banco (yesno→true; choice/multi→recomendada)
 * - relabel → pendência é label `hitl` no GitHub (sem prompt): liberar pro agente (hitl→afk)
 * - modal   → prompt do banco que precisa de escolha (choice/multi sem recomendada, ou text)
 * - none    → não aprovável (não é pendente)
 */
export type ApproveAction =
  | { kind: "answer"; value: HitlAnswerValue }
  | { kind: "relabel" }
  | { kind: "modal" }
  | { kind: "none" };

export function approveAction(
  task: CoordTask,
  prompt: HitlPrompt | undefined,
): ApproveAction {
  if (prompt) {
    if (prompt.kind === "yesno") return { kind: "answer", value: true };
    if (prompt.kind === "choice" || prompt.kind === "multi") {
      const keys = new Set((prompt.options ?? []).map((o) => o.key));
      if (prompt.recommended_key && keys.has(prompt.recommended_key)) {
        return {
          kind: "answer",
          value:
            prompt.kind === "multi"
              ? [prompt.recommended_key]
              : prompt.recommended_key,
        };
      }
    }
    return { kind: "modal" };
  }
  if (task.labels.includes("hitl")) return { kind: "relabel" };
  return { kind: "none" };
}
