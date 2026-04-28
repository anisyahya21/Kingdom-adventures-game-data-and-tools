import { logger } from "./logger";
import fs from "fs";
import path from "path";

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
const CACHE_DIR = path.resolve(process.cwd(), "data", "google-cache");

function cacheFileForKey(key: string) {
  return path.join(CACHE_DIR, `${encodeURIComponent(key)}.txt`);
}

function metaFileForKey(key: string) {
  return path.join(CACHE_DIR, `${encodeURIComponent(key)}.json`);
}

function loadPersistedCache(key: string): CacheEntry | null {
  const existing = cache.get(key);
  if (existing?.data) return existing;

  try {
    const dataPath = cacheFileForKey(key);
    if (!fs.existsSync(dataPath)) return null;
    const data = fs.readFileSync(dataPath, "utf8");
    const metaPath = metaFileForKey(key);
    const meta = fs.existsSync(metaPath)
      ? JSON.parse(fs.readFileSync(metaPath, "utf8")) as { fetchedAt?: number }
      : {};
    const entry: CacheEntry = {
      data,
      fetchedAt: typeof meta.fetchedAt === "number" ? meta.fetchedAt : 0,
      refreshing: false,
    };
    cache.set(key, entry);
    return entry;
  } catch (err) {
    logger.warn({ key, err: String(err) }, "google-cache: persisted cache read failed");
    return null;
  }
}

function persistCache(key: string, data: string, fetchedAt: number) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFileForKey(key), data, "utf8");
    fs.writeFileSync(metaFileForKey(key), JSON.stringify({ fetchedAt }), "utf8");
  } catch (err) {
    logger.warn({ key, err: String(err) }, "google-cache: persisted cache write failed");
  }
}

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
    const fetchedAt = Date.now();
    cache.set(key, { data, fetchedAt, refreshing: false });
    persistCache(key, data, fetchedAt);
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
  const entry = cache.get(key) ?? loadPersistedCache(key);
  return entry && entry.data ? entry.data : null;
}

export function getCachedContentAge(key: string): number | null {
  const entry = cache.get(key) ?? loadPersistedCache(key);
  return entry?.data ? Date.now() - entry.fetchedAt : null;
}

export function refreshStaticSourceIfStale(key: string): void {
  const source = STATIC_SOURCES[key];
  if (!source) return;
  const entry = cache.get(key) ?? loadPersistedCache(key);
  if (!entry?.data || Date.now() - entry.fetchedAt >= source.intervalMs) {
    void doRefresh(key, source.url);
  }
}

/**
 * Start background refresh timers for all static sheet sources.
 * Call once at server startup.
 */
export function initGoogleCache(): void {
  for (const [key, source] of Object.entries(STATIC_SOURCES)) {
    const entry = loadPersistedCache(key);
    if (!entry?.data || Date.now() - entry.fetchedAt >= source.intervalMs) {
      void doRefresh(key, source.url);
    }
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
  const entry = loadPersistedCache(key);
  if (!entry?.data || Date.now() - entry.fetchedAt >= GUIDE_REFRESH_MS) {
    void doRefresh(key, url);
  }
  const timer = setInterval(() => void doRefresh(key, url), GUIDE_REFRESH_MS);
  timer.unref?.();
}
