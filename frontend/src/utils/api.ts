/**
 * Minimal API helper for authenticated requests to the backend.
 *
 * The backend no longer returns the API key over HTTP (SEC-001). Instead the
 * key is delivered out-of-band via a ?token= launch URL printed to the server
 * console; initApiKeyFromBrowser captures it into sessionStorage.
 */

/**
 * Backend origin. Explicit env wins; otherwise derive from the page itself:
 * `next dev` on :3000 talks to the backend on :8000, anything else (Docker,
 * SERVE_STATIC) is same-origin so the port never needs configuring.
 */
function backendOrigin(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === "undefined") return "http://localhost:8000";
  const { protocol, hostname, port, origin } = window.location;
  return port === "3000" ? `${protocol}//${hostname}:8000` : origin;
}

export const API_BASE = backendOrigin();
export const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL || API_BASE.replace(/^http/, "ws");

const KEY_STORAGE = "claude-office-api-key";

let _apiKey: string | null = null;

/** Store the API key (called from the token intake in page.tsx). */
export function setApiKey(key: string): void {
  _apiKey = key;
}

/** Retrieve the cached API key. */
export function getApiKey(): string | null {
  return _apiKey;
}

/** Read ?token= from the URL (stripping it from history) or sessionStorage. */
export function initApiKeyFromBrowser(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    setApiKey(token);
    try {
      sessionStorage.setItem(KEY_STORAGE, token);
    } catch {
      // sessionStorage may be unavailable (private mode); key stays in-memory.
    }
    params.delete("token");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : ""),
    );
    return;
  }
  try {
    const stored = sessionStorage.getItem(KEY_STORAGE);
    if (stored) setApiKey(stored);
  } catch {
    // sessionStorage unavailable; key remains unset until next ?token= intake.
  }
}

/** Fetch wrapper that attaches X-API-Key when available. */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (_apiKey) {
    headers.set("X-API-Key", _apiKey);
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}
