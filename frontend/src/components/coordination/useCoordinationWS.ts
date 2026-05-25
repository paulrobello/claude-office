"use client";

import { useEffect, useRef } from "react";

// Feed de coordenação (#412): o servidor empurra `coordination_update` quando o
// estado do :5433 muda; o cliente então refaz o fetch REST. Substitui o poll de 15s
// (que vira só um fallback lento). Mesmo host do coordinationApi (backend :8000).
const WS_URL = "ws://localhost:8000/ws/coordination";

const MAX_BACKOFF_MS = 15000;

/**
 * Conecta ao feed de coordenação e chama `onUpdate` quando o servidor sinaliza
 * mudança. Reconecta com backoff exponencial. Se o WS cair, o poll de fallback
 * do `useCoordinationPoll` mantém a tela fresca.
 */
export function useCoordinationWS(onUpdate: () => void): void {
  const cbRef = useRef(onUpdate);
  useEffect(() => {
    cbRef.current = onUpdate;
  });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = (): void => {
      if (closed) return;
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        retry = 0;
      };
      ws.onmessage = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(ev.data as string) as { type?: string };
          if (msg.type === "coordination_update") cbRef.current();
        } catch {
          /* frame não-JSON: ignora */
        }
      };
      ws.onclose = () => {
        if (closed) return;
        const delay = Math.min(1000 * 2 ** retry, MAX_BACKOFF_MS);
        retry += 1;
        timer = setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };
    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, []);
}
