/** Helpers puros entre o editor amigável e a expressão cron (5 campos). */

/** Horário comercial padrão: horas 8..23 (minuto 0). Pré-popula o modo "horários fixos". */
export const DEFAULT_BUSINESS_HOURS: number[] = Array.from(
  { length: 16 },
  (_, i) => 8 + i,
);

/**
 * Ao entrar no modo "horários fixos": lista vazia (vindo de interval/raw, ou
 * agente sem agenda) vira horário comercial; lista já existente é preservada
 * (não clobbera horários fixos salvos).
 */
export function enterTimesHours(current: number[]): number[] {
  return current.length === 0 ? [...DEFAULT_BUSINESS_HOURS] : current;
}

export type CronEditor =
  | { mode: "times"; minute: number; hours: number[] }
  | {
      mode: "interval";
      everyMin: number;
      startHour: number;
      endHour: number;
      h24?: boolean;
    }
  | { mode: "raw" };

/** ["08:00","22:00"] -> "0 8,22 * * *". Assume minuto único (usa o do 1º horário). */
export function timesToCron(times: string[]): string {
  const parsed = times.map((t) => {
    const [h, m] = t.split(":").map(Number);
    return { h, m };
  });
  const minute = parsed.length ? parsed[0].m : 0;
  const hours = parsed.map((p) => p.h).sort((a, b) => a - b);
  return `${minute} ${hours.join(",")} * * *`;
}

/** intervalo de N min dentro de [startHour, endHour]. N deve dividir 60. */
export function intervalToCron(
  everyMin: number,
  startHour: number,
  endHour: number,
): string {
  const mins: number[] = [];
  for (let m = 0; m < 60; m += everyMin) mins.push(m);
  return `${mins.join(",")} ${startHour}-${endHour} * * *`;
}

function isPlainHourList(field: string): number[] | null {
  if (!/^\d+(,\d+)*$/.test(field)) return null;
  return field.split(",").map(Number);
}

/** Parse de volta pro editor; cai em {mode:"raw"} se não casar os 2 padrões. */
export function cronToEditor(expr: string): CronEditor {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { mode: "raw" };
  const [min, hour, dom, mon, dow] = parts;
  if (dom !== "*" || mon !== "*" || dow !== "*") return { mode: "raw" };

  // intervalo: minuto = lista começando em 0 com passo constante; hora = range a-b
  const minList = isPlainHourList(min);
  const rangeMatch = hour.match(/^(\d+)-(\d+)$/);
  if (minList && minList.length >= 2 && minList[0] === 0 && rangeMatch) {
    const step = minList[1] - minList[0];
    const ok = step > 0 && minList.every((m, i) => m === i * step);
    if (ok) {
      const startHour = Number(rangeMatch[1]);
      const endHour = Number(rangeMatch[2]);
      const editor: CronEditor = {
        mode: "interval",
        everyMin: step,
        startHour,
        endHour,
      };
      // janela 0-23 == "24h por dia" → reabre com a caixa marcada (round-trip)
      if (startHour === 0 && endHour === 23) editor.h24 = true;
      return editor;
    }
  }

  // horários fixos: minuto único + hora = lista simples
  const hourList = isPlainHourList(hour);
  if (/^\d+$/.test(min) && hourList) {
    return { mode: "times", minute: Number(min), hours: hourList };
  }
  return { mode: "raw" };
}
