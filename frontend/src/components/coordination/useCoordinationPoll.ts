"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CoordUnavailableError } from "./coordinationApi";
import { useCoordinationWS } from "./useCoordinationWS";

/**
 * Faz fetch de um endpoint de coordenação. Tempo-real via WebSocket (#412): o
 * servidor empurra `coordination_update` quando o :5433 muda e disparamos um
 * refetch na hora. O poll periódico vira só um FALLBACK lento (default 30s) caso
 * o WS caia. Trata o 503 (DB fora) como estado `unavailable` em vez de erro.
 *
 * `loading` parte como true e vira false após o primeiro fetch. O setState só
 * acontece dentro de callbacks assíncronos (nunca síncrono no corpo do effect),
 * e a ref do fetcher é atualizada num effect — para satisfazer as regras
 * react-hooks (set-state-in-effect / refs).
 */
export function useCoordinationPoll<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  intervalMs = 30000,
): {
  data: T | null;
  loading: boolean;
  unavailable: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);

  // Mantém a ref do fetcher atualizada sem mutá-la durante o render.
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refetch = useCallback(async (): Promise<void> => {
    try {
      const d = await fetcherRef.current();
      setData(d);
      setUnavailable(false);
      setError(null);
    } catch (e) {
      if (e instanceof CoordUnavailableError) {
        setUnavailable(true);
      } else {
        setError(e instanceof Error ? e.message : "erro");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => void refetch(), intervalMs);
    void refetch();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Tempo-real: refetch imediato quando o servidor sinaliza mudança no :5433.
  useCoordinationWS(() => void refetch());

  return { data, loading, unavailable, error, refetch };
}
