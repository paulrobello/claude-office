import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("panoptica", {
  platform: process.platform,
  isElectron: true,
  // Future: expose IPC methods for native features
  // e.g., showNotification, getBadgeCount, etc.
});
