import catalog from "./search-route-catalog.json";

/** Exact aliases only. Query strings and fragments remain functional. */
export const ROUTE_ALIASES: Record<string, string> = {
  "/monsters": "/monster-spawns",
  "/monster-spawn": "/monster-spawns",
  "/monster-loot": "/monster-spawns",
  "/skill": "/skills",
  "/equipment-level-optimizer": "/equipment-leveling-optimizer",
  "/survey-planner": "/survey",
  "/items-reference": "/item-sources",
  "/loadout": "/combat",
};

const knownPaths = new Set<string>(catalog.paths);
const excluded = new Set([
  "/admin", "/test", "/icon-library", "/map-2-testing",
  "/runtime-world-grid-test", "/runtime-world-render-test", "/terrain-composition-lab",
  "/player-profile", "/sync-devices", "/add-guide", "/combat/multi-box/favorites",
]);

export function canonicalPath(pathname: string) {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return ROUTE_ALIASES[path] ?? path;
}

export function isKnownPage(pathname: string) {
  let path = canonicalPath(pathname);
  try { path = decodeURIComponent(path); } catch { return false; }
  // Community guides are published at runtime; the guide page checks existence.
  return knownPaths.has(path) || /^\/guides\/[^/]+$/.test(path);
}

export function isIndexablePage(pathname: string) {
  const path = canonicalPath(pathname);
  return isKnownPage(path) && !excluded.has(path);
}
