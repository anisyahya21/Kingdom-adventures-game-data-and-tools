const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : "/" + path;
  return `${API_BASE}/ka-api/ka${clean}`;
}

/** Returns the API-proxied URL for a whitelisted Google Sheet cache key. */
export function googleSheetUrl(key: string): string {
  return `${API_BASE}/ka-api/ka/google/sheet/${encodeURIComponent(key)}`;
}

/** Returns the API-proxied URL for a Google Doc cache entry. */
export function googleDocUrl(docId: string): string {
  return `${API_BASE}/ka-api/ka/google/doc/${encodeURIComponent(docId)}`;
}
