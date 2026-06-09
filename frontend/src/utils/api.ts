/**
 * Minimal API helper for authenticated requests to the backend.
 *
 * The backend exposes an auto-generated API key via /api/v1/status
 * that must be included as X-API-Key on state-changing endpoints.
 * This module caches that key after the first status fetch.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

let _apiKey: string | null = null;

/** Store the API key (called once from the status fetch in page.tsx). */
export function setApiKey(key: string): void {
  _apiKey = key;
}

/** Retrieve the cached API key. */
export function getApiKey(): string | null {
  return _apiKey;
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
