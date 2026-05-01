import fallbackSharedData from "../../../api-server/data/ka_shared.json";
import { readBrowserCache, writeBrowserCache } from "@/lib/browser-cache";

export const localSharedData = fallbackSharedData as Record<string, unknown>;

export async function fetchSharedWithFallback<T>(url: string): Promise<T> {
  const cacheKey = "shared-data";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Shared API returned ${res.status}`);
    const data = await res.json() as T;
    writeBrowserCache(cacheKey, data);
    return data;
  } catch {
    return readBrowserCache<T>(cacheKey) ?? JSON.parse(JSON.stringify(localSharedData)) as T;
  }
}
