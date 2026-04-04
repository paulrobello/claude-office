import ElectronStore from "electron-store";

interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

interface StoreSchema {
  windowBounds: WindowBounds;
  alwaysOnTop: boolean;
  minimizeToTray: boolean;
  lastSessionId: string | null;
  headlessMode: boolean;
  notificationThreshold: "blocked" | "waiting" | "completed" | "info";
}

// electron-store extends Conf which provides get/set — type assertion needed
// because of ESM/CJS interop issues with the generic type chain
export type AppStore = InstanceType<typeof ElectronStore<StoreSchema>> & {
  get<K extends keyof StoreSchema>(key: K, defaultValue?: StoreSchema[K]): StoreSchema[K];
  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void;
};

export function createStore(): AppStore {
  return new ElectronStore<StoreSchema>({
    name: "panoptica-preferences",
    defaults: {
      windowBounds: { width: 1200, height: 800 },
      alwaysOnTop: false,
      minimizeToTray: true,
      lastSessionId: null,
      headlessMode: false,
      notificationThreshold: "blocked",
    },
  }) as AppStore;
}
