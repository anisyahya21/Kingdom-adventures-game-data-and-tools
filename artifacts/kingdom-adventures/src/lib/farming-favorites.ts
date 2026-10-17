import { useSyncExternalStore } from "react";
import { profileResidentStatItems, type PlayerProfile } from "@/lib/player-profile";
import type { ProfileGoalBuild, ProfileStatGoal } from "@/lib/profile-loadout-goal-planner";
import type { SavedLoadout } from "@/lib/battle-legality";

export const FARMING_FAVORITES_KEY = "ka_farming_favorite_builds_v1";
const EVENT = "ka-farming-favorites-changed";
export type FarmingFavorite = {
  id: string;
  fingerprint: string;
  name: string;
  savedAt: string;
  build: ProfileGoalBuild;
  profile: PlayerProfile;
  search: { mode: "match-stats"; goals: Record<string, ProfileStatGoal | undefined>; allowEquipmentLevelUp: boolean };
};

function sorted(record: Record<string, unknown>) { return Object.entries(record).sort(([left], [right]) => left.localeCompare(right)); }
export function favoriteFingerprint(build: ProfileGoalBuild, profile: PlayerProfile) {
  const character = profile.characters.find((row) => row.id === build.characterId);
  return JSON.stringify({ characterId: build.characterId, jobName: build.jobName ?? character?.jobName, rank: build.rank ?? character?.rank,
    gender: character?.gender, levels: sorted(character?.statLevels ?? {}), valuables: sorted(profile.valuables), stats: sorted(build.stats),
    picks: [...build.picks].sort((left, right) => left.slot.localeCompare(right.slot)), skills: build.skills ?? [] });
}

export function createFarmingFavorite(build: ProfileGoalBuild, profile: PlayerProfile, goals: Record<string, ProfileStatGoal | undefined>, allowEquipmentLevelUp: boolean): FarmingFavorite {
  const character = profile.characters.find((row) => row.id === build.characterId);
  if (!character) throw new Error("The source character is no longer available. Refresh your profile and search again.");
  const profileSnapshot: PlayerProfile = { version: 1, characters: [{ ...character, statLevels: { ...character.statLevels } }],
    equipment: Object.fromEntries(build.picks.filter((pick) => profile.equipment[pick.item] !== undefined).map((pick) => [pick.item, profile.equipment[pick.item]])),
    valuables: { ...profile.valuables } };
  return JSON.parse(JSON.stringify({ id: crypto.randomUUID(), fingerprint: favoriteFingerprint(build, profile),
    name: build.characterName, savedAt: new Date().toISOString(), build, profile: profileSnapshot,
    search: { mode: "match-stats", goals, allowEquipmentLevelUp } })) as FarmingFavorite;
}

export function favoriteToLoadout(favorite: FarmingFavorite): SavedLoadout & { useProfileInventory: boolean } {
  const character = favorite.profile.characters.find((row) => row.id === favorite.build.characterId);
  if (!character) throw new Error("This favorite has no saved character snapshot.");
  return { id: `favorite:${favorite.id}`, name: favorite.name, gender: character.gender,
    jobName: favorite.build.jobName ?? character.jobName, rank: favorite.build.rank ?? character.rank,
    statLevels: { ...character.statLevels }, equipment: favorite.build.picks.map((pick) => ({ name: pick.item, level: pick.level })),
    skills: [...(favorite.build.skills ?? [])], residentStatItems: profileResidentStatItems(favorite.profile),
    // Reopening a favorite preserves its saved levels instead of silently adopting newer profile levels.
    useProfileInventory: false };
}

const EMPTY: FarmingFavorite[] = [];
let cachedRaw: string | null | undefined;
let cached: FarmingFavorite[] = EMPTY;
export function readFarmingFavorites(): FarmingFavorite[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null;
  try { raw = localStorage.getItem(FARMING_FAVORITES_KEY); } catch { return EMPTY; }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const data = raw ? JSON.parse(raw) : null;
    cached = data?.version === 1 && Array.isArray(data.builds) ? data.builds.filter((row: FarmingFavorite) => row && typeof row.id === "string" && typeof row.name === "string" && typeof row.fingerprint === "string" && row.build && Array.isArray(row.build.picks) && row.profile && Array.isArray(row.profile.characters) && row.profile.valuables && row.search) : EMPTY;
  } catch { cached = EMPTY; }
  return cached;
}
function writeFavorites(builds: FarmingFavorite[]) {
  try { localStorage.setItem(FARMING_FAVORITES_KEY, JSON.stringify({ version: 1, builds })); }
  catch { throw new Error("Could not save Favorites on this device. Your browser storage may be full or unavailable."); }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === FARMING_FAVORITES_KEY || event.key === null) listener(); };
  window.addEventListener(EVENT, listener); window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", onStorage); };
}
export function saveFarmingFavorite(build: ProfileGoalBuild, profile: PlayerProfile, goals: Record<string, ProfileStatGoal | undefined>, allowEquipmentLevelUp: boolean) {
  const current = readFarmingFavorites(); const fingerprint = favoriteFingerprint(build, profile);
  const existing = current.find((row) => row.fingerprint === fingerprint);
  if (existing) return existing;
  const favorite = createFarmingFavorite(build, profile, goals, allowEquipmentLevelUp);
  writeFavorites([favorite, ...current]); return favorite;
}
export function removeFarmingFavorite(id: string) { writeFavorites(readFarmingFavorites().filter((row) => row.id !== id)); }
export function useFarmingFavorites() { return useSyncExternalStore(subscribe, readFarmingFavorites, () => EMPTY); }
