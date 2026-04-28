import { logger } from "./logger";

// ─── Refresh intervals ────────────────────────────────────────────────────────
export const GUIDE_REFRESH_MS = 60_000;          // 1 min  – guides change most often
export const SHEET_REFRESH_MS = 5 * 60_000;      // 5 min  – stable sheet data
const WEEKLY_CONQUEST_REFRESH_MS = 2 * 60_000;  // 2 min  – conquest resets weekly

// ─── Whitelisted static Google sources ───────────────────────────────────────
// Add new sheet sources here; frontend requests by key name only.
// This prevents the endpoints from being used as an open proxy.
export const STATIC_SOURCES: Record<string, { url: string; intervalMs: number }> = {
  "equipment": {
    url: "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/gviz/tq?tqx=out:json&gid=123527243",
    intervalMs: SHEET_REFRESH_MS,
  },
  "shops-items": {
    url: "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/gviz/tq?tqx=out:json&gid=1863106351",
    intervalMs: SHEET_REFRESH_MS,
  },
  "weekly-conquest-lookup": {
    url: "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/gviz/tq?tqx=out:json&gid=421403004",
    intervalMs: WEEKLY_CONQUEST_REFRESH_MS,
  },
  "weekly-conquest-schedule": {
    url: "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/gviz/tq?tqx=out:json&gid=1625050714",
    intervalMs: WEEKLY_CONQUEST_REFRESH_MS,
  },
  "eggs": {
    url: "https://docs.google.com/spreadsheets/d/1pNx7SjpgjuKFI9Hgr21y3ammRlZjKNTTdvfLYQL7l7A/gviz/tq?tqx=out:json&gid=1439838004",
    intervalMs: SHEET_REFRESH_MS,
  },
};

// ─── Internal cache store ─────────────────────────────────────────────────────
interface CacheEntry {
  data: string;
  fetchedAt: number;
  refreshing: boolean;
}

const cache = new Map<string, CacheEntry>();

async function doRefresh(key: string, url: string): Promise<void> {
  const existing = cache.get(key);
  if (existing?.refreshing) return; // already in flight

  cache.set(key, {
    data: existing?.data ?? "",
    fetchedAt: existing?.fetchedAt ?? 0,
    refreshing: true,
  });

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.text();
    cache.set(key, { data, fetchedAt: Date.now(), refreshing: false });
    logger.info({ key }, "google-cache: refreshed");
  } catch (err) {
    const prev = cache.get(key);
    cache.set(key, {
      data: prev?.data ?? "",
      fetchedAt: prev?.fetchedAt ?? 0,
      refreshing: false,
    });
    logger.warn({ key, err: String(err) }, "google-cache: refresh failed, keeping stale");
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns cached content or null if cache is still warming. */
export function getCachedContent(key: string): string | null {
  const entry = cache.get(key);
  return entry && entry.data ? entry.data : null;
}

/**
 * Start background refresh timers for all static sheet sources.
 * Call once at server startup.
 */
export function initGoogleCache(): void {
  for (const [key, source] of Object.entries(STATIC_SOURCES)) {
    void doRefresh(key, source.url);
    const timer = setInterval(() => void doRefresh(key, source.url), source.intervalMs);
    timer.unref?.();
  }
}

const registeredGuideDocs = new Set<string>();

/**
 * Register a guide doc for background caching.
 * Safe to call multiple times with the same docId – idempotent.
 */
export function ensureGuideDocCached(docId: string): void {
  if (registeredGuideDocs.has(docId)) return;
  registeredGuideDocs.add(docId);
  const key = `guide:${docId}`;
  const url = `https://docs.google.com/document/d/${docId}/export?format=md`;
  void doRefresh(key, url);
  const timer = setInterval(() => void doRefresh(key, url), GUIDE_REFRESH_MS);
  timer.unref?.();
}
