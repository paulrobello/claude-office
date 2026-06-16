import { useCallback, useEffect, useState } from "react";

import {
  createDestination,
  deleteDestination,
  type Destination,
  listDestinations,
  updateDestination,
} from "./opsApi";

export function useDestinations() {
  const [items, setItems] = useState<Destination[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await listDestinations());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount via refresh()
    void refresh();
  }, [refresh]);

  return {
    items,
    error,
    refresh,
    create: async (d: Destination) => {
      await createDestination(d);
      await refresh();
    },
    update: async (d: Destination) => {
      await updateDestination(d);
      await refresh();
    },
    remove: async (id: string) => {
      await deleteDestination(id);
      await refresh();
    },
  };
}
