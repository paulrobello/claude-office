import { app, BrowserWindow, Tray, Menu, nativeImage, shell, Notification, type NativeImage } from "electron";
import path from "path";
import { BackendProcess, setQuitting } from "./backend";
import { createStore, type AppStore } from "./store";
import { NotificationManager } from "./notifications";

// Track quit state to differentiate close vs minimize-to-tray
let isQuitting = false;

const FRONTEND_URL = "http://localhost:3401";
const BACKEND_HEALTH_URL = "http://localhost:3400/health";
const SESSIONS_URL = "http://localhost:3400/api/v1/sessions";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backend: BackendProcess | null = null;
let notifications: NotificationManager | null = null;
let store: AppStore;

function createWindow(): BrowserWindow {
  const bounds = store.get("windowBounds", { width: 1200, height: 800, x: undefined, y: undefined });

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 600,
    minHeight: 400,
    title: "Panoptica",
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 12 },
    show: false,
  });

  win.loadURL(FRONTEND_URL);

  win.once("ready-to-show", () => {
    win.show();
  });

  // Save window bounds on move/resize
  const saveBounds = () => {
    if (!win.isMinimized() && !win.isMaximized()) {
      store.set("windowBounds", win.getBounds());
    }
  };
  win.on("resize", saveBounds);
  win.on("move", saveBounds);

  // Minimize to tray instead of closing (configurable)
  win.on("close", (e) => {
    if (store.get("minimizeToTray", true) && !isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

function createTray(): Tray {
  // Use a template image for macOS (auto dark/light mode)
  const iconPath = path.join(__dirname, "../../resources/trayTemplate.png");
  let icon: NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    // Fallback: create a simple 16x16 icon
    icon = nativeImage.createEmpty();
  }

  const t = new Tray(icon);
  t.setToolTip("Panoptica");

  const updateMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show Panoptica",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: "separator" },
      {
        label: "Always on Top",
        type: "checkbox",
        checked: store.get("alwaysOnTop", false),
        click: (menuItem) => {
          store.set("alwaysOnTop", menuItem.checked);
          mainWindow?.setAlwaysOnTop(menuItem.checked);
        },
      },
      {
        label: "Minimize to Tray",
        type: "checkbox",
        checked: store.get("minimizeToTray", true),
        click: (menuItem) => {
          store.set("minimizeToTray", menuItem.checked);
        },
      },
      { type: "separator" },
      {
        label: "Notifications",
        submenu: [
          {
            label: "Blocked only",
            type: "radio",
            checked: store.get("notificationThreshold", "blocked") === "blocked",
            click: () => store.set("notificationThreshold", "blocked"),
          },
          {
            label: "Blocked + Waiting",
            type: "radio",
            checked: store.get("notificationThreshold", "blocked") === "waiting",
            click: () => store.set("notificationThreshold", "waiting"),
          },
          {
            label: "All events",
            type: "radio",
            checked: store.get("notificationThreshold", "blocked") === "info",
            click: () => store.set("notificationThreshold", "info"),
          },
        ],
      },
      { type: "separator" },
      {
        label: "Open in Browser",
        click: () => shell.openExternal(FRONTEND_URL),
      },
      { type: "separator" },
      {
        label: "Quit Panoptica",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    t.setContextMenu(contextMenu);
  };

  updateMenu();

  // Click tray icon → toggle window
  t.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  return t;
}

async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(BACKEND_HEALTH_URL, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchSessionCount(): Promise<number> {
  try {
    const response = await fetch(SESSIONS_URL, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return 0;
    const data = await response.json();
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

app.whenReady().then(async () => {
  store = createStore();

  // Try to connect to existing backend first
  const backendAlive = await checkBackendHealth();

  if (!backendAlive) {
    // Start backend subprocess
    backend = new BackendProcess();
    backend.start();
    // Wait for backend to become healthy
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await checkBackendHealth()) break;
    }
  }

  // Check for headless mode (--headless flag or stored preference)
  const headlessArg = process.argv.includes("--headless");
  const headlessMode = headlessArg || store.get("headlessMode", false);

  // Always create the tray
  tray = createTray();

  // Start notification manager (works in both windowed and headless mode)
  notifications = new NotificationManager(store, "ws://localhost:8000");
  notifications.start();

  if (!headlessMode) {
    mainWindow = createWindow();
    notifications.setMainWindow(mainWindow);

    // Apply stored preferences
    if (store.get("alwaysOnTop", false)) {
      mainWindow.setAlwaysOnTop(true);
    }
  }

  // Periodic session count update for tray tooltip
  setInterval(async () => {
    const count = await fetchSessionCount();
    tray?.setToolTip(`Panoptica — ${count} session${count !== 1 ? "s" : ""}`);
  }, 10_000);

  // Handle protocol links: panoptica://session/<id>
  app.on("open-url", (_event, url) => {
    const match = url.match(/panoptica:\/\/session\/(.+)/);
    if (match && mainWindow) {
      mainWindow.loadURL(`${FRONTEND_URL}?session=${match[1]}`);
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  setQuitting(true);
  notifications?.stop();
  backend?.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Register protocol handler for deep links
if (process.defaultApp) {
  app.setAsDefaultProtocolClient("panoptica", process.execPath, [
    path.resolve(process.argv[1]!),
  ]);
} else {
  app.setAsDefaultProtocolClient("panoptica");
}
