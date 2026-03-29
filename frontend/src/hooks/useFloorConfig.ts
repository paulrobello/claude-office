import { useEffect } from "react";
import { useNavigationStore } from "@/stores/navigationStore";

const API_URL = "http://localhost:8000/api/v1/floors";

/**
 * Fetches building configuration from the backend on mount
 * and stores it in the navigation store.
 */
export function useFloorConfig(): void {
  const setBuildingConfig = useNavigationStore((s) => s.setBuildingConfig);
  const setLoading = useNavigationStore((s) => s.setLoading);

  useEffect(() => {
    setLoading(true);
    fetch(API_URL)
      .then((res) => res.json())
      .then((data) => setBuildingConfig(data))
      .catch(() => setBuildingConfig({ floors: [] }));
  }, [setBuildingConfig, setLoading]);
}
