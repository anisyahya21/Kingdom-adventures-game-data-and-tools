const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const SHEET_FALLBACK_URLS: Record<string, string> = {
  equipment: "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/gviz/tq?tqx=out:json&gid=123527243",
  "shops-items": "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/gviz/tq?tqx=out:json&gid=1863106351",
  "weekly-conquest-lookup": "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/gviz/tq?tqx=out:json&gid=421403004",
  "weekly-conquest-schedule": "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/gviz/tq?tqx=out:json&gid=1625050714",
  eggs: "https://docs.google.com/spreadsheets/d/1pNx7SjpgjuKFI9Hgr21y3ammRlZjKNTTdvfLYQL7l7A/gviz/tq?tqx=out:json&gid=1439838004",
};

export function apiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : "/" + path;
  return `${API_BASE}/ka-api/ka${clean}`;
}

/** Returns the API-proxied URL for a whitelisted Google Sheet cache key. */
export function googleSheetUrl(key: string): string {
  if (API_BASE) {
    return `${API_BASE}/ka-api/ka/google/sheet/${encodeURIComponent(key)}`;
  }
  return SHEET_FALLBACK_URLS[key] ?? `/ka-api/ka/google/sheet/${encodeURIComponent(key)}`;
}

/** Returns the API-proxied URL for a Google Doc cache entry. */
export function googleDocUrl(docId: string): string {
  if (API_BASE) {
    return `${API_BASE}/ka-api/ka/google/doc/${encodeURIComponent(docId)}`;
  }
  return `https://docs.google.com/document/d/${encodeURIComponent(docId)}/export?format=md`;
}
