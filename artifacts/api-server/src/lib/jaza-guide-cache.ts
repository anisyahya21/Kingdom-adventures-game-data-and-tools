import { getCachedContent, registerGuideRefresh } from "./google-cache";
import { importJazaGitBook } from "./jaza-gitbook-import.mjs";

const CACHE_KEY = "guide:jaza-gitbook";

export function startJazaGuideRefresh(): void {
  registerGuideRefresh(CACHE_KEY, importJazaGitBook);
}

export function getJazaGuide(): string | null {
  startJazaGuideRefresh();
  return getCachedContent(CACHE_KEY);
}
