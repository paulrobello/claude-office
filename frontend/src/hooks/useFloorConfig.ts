import { useEffect } from "react";
import { useNavigationStore } from "@/stores/navigationStore";

const API_URL = "http://localhost:3400/api/v1";

/**
 * Fetches building configuration and session summaries from the backend.
 */
export function useFloorConfig(): void {
  const setBuildingConfig = useNavigationStore((s) => s.setBuildingConfig);
  const setLoading = useNavigationStore((s) => s.setLoading);
  const setAllSessions = useNavigationStore((s) => s.setAllSessions);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/floors`)
      .then((res) => res.json())
      .then((data) => setBuildingConfig(data))
      .catch(() =>
        setBuildingConfig({ building_name: "Building", floors: [] }),
      );
  }, [setBuildingConfig, setLoading]);

  // Periodically fetch session summaries for room/floor activity
  useEffect(() => {
    const fetchSessions = () => {
      fetch(`${API_URL}/sessions`)
        .then((res) => res.json())
        .then((data) =>
          setAllSessions(
            data.map((s: Record<string, unknown>) => ({
              id: s.id as string,
              roomId: (s.roomId as string) ?? null,
              status: s.status as string,
              eventCount: (s.eventCount as number) ?? 0,
            })),
          ),
        )
        .catch(() => setAllSessions([]));
    };
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [setAllSessions]);
}
