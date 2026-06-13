import { describe, it, expect } from "vitest";
import {
  timesToCron,
  intervalToCron,
  cronToEditor,
  DEFAULT_BUSINESS_HOURS,
  enterTimesHours,
} from "../src/utils/cron";

describe("timesToCron", () => {
  it("gera lista de horas no mesmo minuto", () => {
    expect(
      timesToCron(["08:00", "12:00", "15:00", "18:00", "22:00", "23:00"]),
    ).toBe("0 8,12,15,18,22,23 * * *");
  });
});

describe("DEFAULT_BUSINESS_HOURS", () => {
  it("é horário comercial 8..23 (16 horas, minuto 0 implícito)", () => {
    expect(DEFAULT_BUSINESS_HOURS).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ]);
  });

  it("gera o cron 0 8-23 equivalente (lista de horas)", () => {
    const times = DEFAULT_BUSINESS_HOURS.map(
      (h) => `${String(h).padStart(2, "0")}:00`,
    );
    expect(timesToCron(times)).toBe(
      "0 8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *",
    );
  });
});

describe("enterTimesHours", () => {
  it("lista vazia → pré-popula com horário comercial", () => {
    expect(enterTimesHours([])).toEqual(DEFAULT_BUSINESS_HOURS);
  });

  it("não clobbera horas já existentes", () => {
    expect(enterTimesHours([9, 18])).toEqual([9, 18]);
  });

  it("retorna cópia nova (não compartilha referência com o default)", () => {
    expect(enterTimesHours([])).not.toBe(DEFAULT_BUSINESS_HOURS);
  });
});

describe("intervalToCron", () => {
  it("a cada 15min das 7 às 23", () => {
    expect(intervalToCron(15, 7, 23)).toBe("0,15,30,45 7-23 * * *");
  });
});

describe("intervalToCron 24h", () => {
  it("a cada 15min, janela 0-23 (24h)", () => {
    expect(intervalToCron(15, 0, 23)).toBe("0,15,30,45 0-23 * * *");
  });
});

describe("cronToEditor", () => {
  it("reconhece janela 0-23 como 24h (round-trip)", () => {
    expect(cronToEditor("0,15,30,45 0-23 * * *")).toEqual({
      mode: "interval",
      everyMin: 15,
      startHour: 0,
      endHour: 23,
      h24: true,
    });
  });
  it("reconhece intervalo", () => {
    expect(cronToEditor("0,15,30,45 7-23 * * *")).toEqual({
      mode: "interval",
      everyMin: 15,
      startHour: 7,
      endHour: 23,
    });
  });
  it("reconhece horários fixos", () => {
    expect(cronToEditor("0 8,12,15,18,23 * * *")).toEqual({
      mode: "times",
      minute: 0,
      hours: [8, 12, 15, 18, 23],
    });
  });
  it("cai em raw para expressões fora do padrão", () => {
    expect(cronToEditor("*/5 * * * *")).toEqual({ mode: "raw" });
    expect(cronToEditor("0 8 * * 1-5")).toEqual({ mode: "raw" });
  });
});
