import { Notification, BrowserWindow } from "electron";
import type { AppStore } from "./store";

/**
 * Agent attention event from the Panoptica backend WebSocket.
 */
interface AgentEvent {
  event_type: string;
  session_id: string;
  timestamp: string;
  data: {
    agent_id?: string;
    agent_name?: string;
    tool_name?: string;
    summary?: string;
    phase?: string;
    [key: string]: unknown;
  };
}

/**
 * Urgency levels matching the frontend AttentionEngine scoring.
 */
type UrgencyLevel = "blocked" | "waiting" | "completed" | "info";

function classifyUrgency(event: AgentEvent): UrgencyLevel {
  const data = event.data;
  const eventType = event.event_type;

  // Permission requests = blocked (needs human input)
  if (eventType === "permission_request") return "blocked";

  // Session end or stop
  if (eventType === "session_end" || eventType === "stop") return "completed";

  // Background task completed
  if (eventType === "background_task_notification") {
    if (data.background_task_status === "completed") return "completed";
    return "info";
  }

  return "info";
}

/**
 * Notification batching — avoid spamming the user.
 * Groups events within a time window and sends one notification.
 */
class NotificationBatcher {
  private pending: AgentEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private batchWindowMs = 5_000; // 5 second batch window
  private onBatch: (events: AgentEvent[]) => void;

  constructor(onBatch: (events: AgentEvent[]) => void) {
    this.onBatch = onBatch;
  }

  add(event: AgentEvent): void {
    this.pending.push(event);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.batchWindowMs);
    }
  }

  addImmediate(event: AgentEvent): void {
    // For urgent events, flush immediately
    this.pending.push(event);
    this.flush();
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.length === 0) return;
    const batch = [...this.pending];
    this.pending = [];
    this.onBatch(batch);
  }
}

/**
 * NotificationManager — connects to Panoptica backend WebSocket and
 * fires native OS notifications based on agent attention events.
 */
export class NotificationManager {
  private ws: WebSocket | null = null;
  private store: AppStore;
  private mainWindow: BrowserWindow | null = null;
  private batcher: NotificationBatcher;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backendUrl: string;

  constructor(store: AppStore, backendUrl: string = "ws://localhost:8000") {
    this.store = store;
    this.backendUrl = backendUrl;
    this.batcher = new NotificationBatcher((events) => this.sendBatchedNotification(events));
  }

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  /**
   * Start listening for events. Connects to the backend WebSocket
   * for all sessions (room-level endpoint).
   */
  start(): void {
    this.connect();
  }

  stop(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private connect(): void {
    // Connect to the "all sessions" WebSocket endpoint
    const url = `${this.backendUrl}/ws/notifications`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        // Connected — reset reconnect backoff
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(String(event.data)) as AgentEvent;
          this.handleEvent(data);
        } catch {
          // Invalid JSON — skip
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // Error will trigger onclose
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 10_000); // Reconnect every 10 seconds
  }

  private handleEvent(event: AgentEvent): void {
    const urgency = classifyUrgency(event);

    // Only notify for events above the configured threshold
    const threshold = this.store.get("notificationThreshold", "blocked") as UrgencyLevel;
    const urgencyRank: Record<UrgencyLevel, number> = {
      blocked: 3,
      waiting: 2,
      completed: 1,
      info: 0,
    };

    if (urgencyRank[urgency] < urgencyRank[threshold]) return;

    // Blocked events get immediate notification
    if (urgency === "blocked") {
      this.batcher.addImmediate(event);
    } else {
      this.batcher.add(event);
    }
  }

  private sendBatchedNotification(events: AgentEvent[]): void {
    if (events.length === 0) return;
    if (!Notification.isSupported()) return;

    // Don't notify if window is visible and focused
    if (this.mainWindow?.isVisible() && this.mainWindow?.isFocused()) return;

    const blocked = events.filter((e) => classifyUrgency(e) === "blocked");
    const completed = events.filter((e) => classifyUrgency(e) === "completed");

    let title: string;
    let body: string;

    if (blocked.length > 0) {
      title = `Panoptica — ${blocked.length} agent${blocked.length > 1 ? "s" : ""} blocked`;
      body = blocked
        .map((e) => e.data.agent_name || e.data.summary || "Agent needs attention")
        .slice(0, 3)
        .join("\n");
      if (blocked.length > 3) body += `\n...and ${blocked.length - 3} more`;
    } else if (completed.length > 0) {
      title = "Panoptica — Task completed";
      body = completed
        .map((e) => e.data.summary || "A task has completed")
        .slice(0, 3)
        .join("\n");
    } else {
      title = `Panoptica — ${events.length} event${events.length > 1 ? "s" : ""}`;
      body = events
        .map((e) => e.data.summary || e.event_type)
        .slice(0, 3)
        .join("\n");
    }

    const notification = new Notification({
      title,
      body,
      silent: blocked.length === 0, // Sound only for blocked agents
    });

    notification.on("click", () => {
      // Focus the main window on the relevant session
      if (this.mainWindow) {
        this.mainWindow.show();
        this.mainWindow.focus();
        // If we know the session, navigate to it
        const sessionId = events[0]?.session_id;
        if (sessionId) {
          this.mainWindow.webContents.executeJavaScript(
            `window.location.hash = "session=${sessionId}"`,
          );
        }
      }
    });

    notification.show();
  }
}
