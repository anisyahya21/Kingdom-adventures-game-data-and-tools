import equipmentSheetUrl from "../../../api-server/data/google-cache/equipment.txt?url&no-inline";
import shops_itemsSheetUrl from "../../../api-server/data/google-cache/shops-items.txt?url&no-inline";
import weekly_conquest_lookupSheetUrl from "../../../api-server/data/google-cache/weekly-conquest-lookup.txt?url&no-inline";
import weekly_conquest_scheduleSheetUrl from "../../../api-server/data/google-cache/weekly-conquest-schedule.txt?url&no-inline";
import eggsSheetUrl from "../../../api-server/data/google-cache/eggs.txt?url&no-inline";

const STORED_API_BASE_KEY = "kaApiBaseUrl";

export function configuredApiBase() {
  const envBase = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  if (typeof window === "undefined") return envBase;

  const isLocalHost = /^(localhost|127\.0\.0\.1|192\.168\.)$/i.test(window.location.hostname);
  if (window.location.protocol === "https:" && !isLocalHost) {
    // A single first-party API origin keeps sessions independent of build-time
    // environment values and stale device overrides after deployments.
    return "";
  }

  const params = new URLSearchParams(window.location.search);
  const queryBase = params.get("apiBase")?.trim().replace(/\/$/, "");
  if (queryBase) {
    window.localStorage.setItem(STORED_API_BASE_KEY, queryBase);
    return queryBase;
  }

  const storedBase = (window.localStorage.getItem(STORED_API_BASE_KEY) || "").replace(/\/$/, "");
  if (window.location.protocol === "https:" && /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.)/i.test(storedBase)) {
    window.localStorage.removeItem(STORED_API_BASE_KEY);
    return envBase;
  }
  if (storedBase && window.location.protocol === "https:") {
    try {
      const storedUrl = new URL(storedBase);
      const liveApiOverride = storedUrl.origin !== window.location.origin && storedUrl.origin !== envBase;
      if (liveApiOverride && !/^(localhost|127\.0\.0\.1|192\.168\.)$/i.test(window.location.hostname)) {
        window.localStorage.removeItem(STORED_API_BASE_KEY);
        return envBase;
      }
    } catch {
      window.localStorage.removeItem(STORED_API_BASE_KEY);
      return envBase;
    }
  }

  return (storedBase || envBase).replace(/\/$/, "");
}

export function saveConfiguredApiBase(value: string) {
  const clean = value.trim().replace(/\/$/, "");
  if (!clean) window.localStorage.removeItem(STORED_API_BASE_KEY);
  else window.localStorage.setItem(STORED_API_BASE_KEY, clean);
  return clean;
}

const STATIC_SHEET_URLS: Record<string, string> = {
  "equipment": equipmentSheetUrl,
  "shops-items": shops_itemsSheetUrl,
  "weekly-conquest-lookup": weekly_conquest_lookupSheetUrl,
  "weekly-conquest-schedule": weekly_conquest_scheduleSheetUrl,
  "eggs": eggsSheetUrl,
};

export function apiUrl(path: string): string {
  const apiBase = configuredApiBase();
  const clean = path.startsWith("/") ? path : "/" + path;
  return `${apiBase}/ka-api/ka${clean}`;
}

/** Game reference tables are published static assets, independent of API configuration. */
export function googleSheetUrl(key: string): string {
  const url = STATIC_SHEET_URLS[key];
  if (!url) throw new Error(`Unknown static reference table: ${key}`);
  return url;
}

/** Returns the API-proxied URL for a Google Doc cache entry. */
export function googleDocUrl(docId: string): string {
  const apiBase = configuredApiBase();
  if (apiBase) {
    return `${apiBase}/ka-api/ka/google/doc/${encodeURIComponent(docId)}`;
  }
  return `https://docs.google.com/document/d/${encodeURIComponent(docId)}/export?format=md`;
}
