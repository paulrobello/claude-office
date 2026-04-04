import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { app } from "electron";

// Shared quit state — set by main process before quit
let _isQuitting = false;
export function setQuitting(val: boolean): void { _isQuitting = val; }

const BACKEND_DIR = path.resolve(__dirname, "../../../backend");
const DEFAULT_PORT = 8000;

export class BackendProcess {
  private process: ChildProcess | null = null;
  private restartCount = 0;
  private maxRestarts = 5;
  private logFile: fs.WriteStream | null = null;

  constructor() {
    const logPath = path.join(app.getPath("logs"), "panoptica-backend.log");
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      this.logFile = fs.createWriteStream(logPath, { flags: "a" });
    } catch {
      // Can't create log file — continue without logging
    }
  }

  start(): void {
    if (this.process) return;

    this.log("Starting backend...");

    // Try bundled binary first, then uvicorn
    const bundledBinary = this.findBundledBinary();
    if (bundledBinary) {
      this.startBundled(bundledBinary);
    } else {
      this.startUvicorn();
    }
  }

  private findBundledBinary(): string | null {
    // In packaged app, look for PyInstaller binary in resources
    const candidates = [
      path.join(process.resourcesPath || "", "panoptica-backend"),
      path.join(process.resourcesPath || "", "panoptica-backend.exe"),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  private startBundled(binaryPath: string): void {
    this.log(`Starting bundled backend: ${binaryPath}`);
    this.process = spawn(binaryPath, [], {
      env: {
        ...process.env,
        DATABASE_URL: `sqlite+aiosqlite:///${path.join(app.getPath("userData"), "panoptica.db")}`,
        PORT: String(DEFAULT_PORT),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.attachHandlers();
  }

  private startUvicorn(): void {
    // Dev mode: use uvicorn directly
    const uvicornCmd = process.platform === "win32" ? "uvicorn.exe" : "uvicorn";

    this.log(`Starting uvicorn from: ${BACKEND_DIR}`);
    this.process = spawn(
      uvicornCmd,
      ["app.main:app", "--host", "0.0.0.0", "--port", String(DEFAULT_PORT)],
      {
        cwd: BACKEND_DIR,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    this.attachHandlers();
  }

  private attachHandlers(): void {
    if (!this.process) return;

    this.process.stdout?.on("data", (data: Buffer) => {
      this.log(`[stdout] ${data.toString().trim()}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      this.log(`[stderr] ${data.toString().trim()}`);
    });

    this.process.on("exit", (code, signal) => {
      this.log(`Backend exited: code=${code}, signal=${signal}`);
      this.process = null;

      // Auto-restart with exponential backoff
      if (this.restartCount < this.maxRestarts && !_isQuitting) {
        this.restartCount++;
        const delay = Math.min(1000 * Math.pow(2, this.restartCount - 1), 30_000);
        this.log(`Restarting in ${delay}ms (attempt ${this.restartCount}/${this.maxRestarts})`);
        setTimeout(() => this.start(), delay);
      }
    });

    this.process.on("error", (err) => {
      this.log(`Backend error: ${err.message}`);
    });
  }

  stop(): void {
    if (!this.process) return;
    this.log("Stopping backend...");

    // Graceful shutdown
    this.process.kill("SIGTERM");

    // Force kill after 5 seconds
    const forceKillTimeout = setTimeout(() => {
      if (this.process) {
        this.log("Force killing backend");
        this.process.kill("SIGKILL");
      }
    }, 5000);

    this.process.once("exit", () => {
      clearTimeout(forceKillTimeout);
      this.process = null;
      this.log("Backend stopped");
    });
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    this.logFile?.write(line);
  }
}
