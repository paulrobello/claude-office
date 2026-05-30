import { describe, expect, it } from "vitest";
import {
  placeByRole,
  ROOMS,
  TILE,
} from "../src/components/coordination/OfficeMap";
import type { CoordAgent } from "../src/components/coordination/coordinationApi";

// #410 — sala = role: cada agente deve ser posicionado na sala da sua FUNÇÃO
// (não por índice), e a sala usada deve ser rotulada com o role (= cards do /console).

function agent(nome: string, role: string, status = "idle"): CoordAgent {
  return {
    nome,
    role,
    projetos: [],
    mode: "on-demand",
    contratado_em: null,
    last_active_at: null,
    status,
    active_claims: 0,
    queued_requests: 0,
    cron_expr: null,
    enabled: true,
    archived_at: null,
  };
}

/** Índice da sala que contém o ponto (px). Salas não se sobrepõem → no máx. 1. */
function roomOfPoint(cx: number, cy: number): number | null {
  for (let i = 0; i < ROOMS.length; i++) {
    const r = ROOMS[i];
    if (
      cx >= r.x * TILE &&
      cx <= (r.x + r.w) * TILE &&
      cy >= r.y * TILE &&
      cy <= (r.y + r.h) * TILE
    ) {
      return i;
    }
  }
  return null;
}

describe("placeByRole (sala = role, #410)", () => {
  it("coloca cada agente na sala da sua role (não por índice)", () => {
    const agents = [
      agent("DEV-FRONT-1", "dev-front"),
      agent("DEV-FRONT-2", "dev-front"),
      agent("DEV-API-1", "dev-api"),
      agent("DBA-1", "dba"),
    ];
    const { placed, roomRole } = placeByRole(agents);
    expect(roomRole.size).toBe(3); // 3 roles → 3 salas
    for (const p of placed) {
      const roomIdx = roomOfPoint(p.cx, p.cy);
      expect(roomIdx).not.toBeNull();
      expect(roomRole.get(roomIdx as number)).toBe(p.agent.role);
    }
  });

  it("agentes da MESMA role caem na mesma sala, em desks distintos", () => {
    const agents = [
      agent("DEV-FRONT-1", "dev-front"),
      agent("DEV-API-1", "dev-api"),
      agent("DEV-FRONT-2", "dev-front"),
    ];
    const { placed } = placeByRole(agents);
    const front = placed.filter((p) => p.agent.role === "dev-front");
    expect(roomOfPoint(front[0].cx, front[0].cy)).toBe(
      roomOfPoint(front[1].cx, front[1].cy),
    );
    expect(front[0].cx !== front[1].cx || front[0].cy !== front[1].cy).toBe(true);
  });

  it("roles ordenadas alfabeticamente (mesmo sort dos cards do /console)", () => {
    const agents = [
      agent("Z", "dev-front"),
      agent("A", "dba"),
      agent("M", "dev-api"),
    ];
    const { roomRole } = placeByRole(agents);
    const labelsByRoomOrder = [...roomRole.entries()]
      .sort((a, b) => a[0] - b[0])
      .map((e) => e[1]);
    expect(labelsByRoomOrder).toEqual(["dba", "dev-api", "dev-front"]);
  });

  it("roster vazio não quebra", () => {
    const { placed, roomRole } = placeByRole([]);
    expect(placed).toEqual([]);
    expect(roomRole.size).toBe(0);
  });
});
