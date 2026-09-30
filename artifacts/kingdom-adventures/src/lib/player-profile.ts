import { useCallback, useMemo, useSyncExternalStore } from "react";
import { EQUIPMENT_CATALOG } from "@/lib/generated-equipment-data";
import { STAT_KEYS } from "@/game-data/stat-parameter-ids";
import { PLAYER_VALUABLES } from "@/game-data/player-valuables";
import {
  RESIDENT_STAT_ITEMS,
  type ResidentStatItemCounts,
} from "@/game-data/resident-stat-items";
import {
  RESIDENT_STAT_ITEMS_KEY,
  deviceResidentValuables,
} from "@/lib/resident-valuable-settings";

export { PLAYER_VALUABLES };
export const PLAYER_PROFILE_KEY = "ka_player_profile_v1";
export const PLAYER_PROFILE_EVENT = "ka-player-profile-changed";
export type PlayerCharacter = {
  id: string;
  jobName: string;
  rank: string;
  statLevels: Record<string, number>;
};
export type PlayerProfile = {
  version: 1;
  /** Catalog equipment names map to owned levels. Missing entries are locked. */
  equipment: Record<string, number>;
  characters: PlayerCharacter[];
  /** Acquired/used valuable counts. Waters record used counts, matching the loadout builder. */
  valuables: Record<string, number>;
};
type Update<T> = T | ((previous: T) => T);
const EMPTY: PlayerProfile = {
  version: 1,
  equipment: {},
  characters: [],
  valuables: {},
};
const equipmentNames = new Set<string>(
  EQUIPMENT_CATALOG.map((item) => item.name),
);
const record = (raw: unknown): Record<string, unknown> =>
  raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
const whole = (raw: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof raw === "number" && Number.isFinite(raw)
    ? Math.max(min, Math.min(max, Math.floor(raw)))
    : min;

/** Defensive schema boundary for old saves, imports and storage events. */
export function sanitizePlayerProfile(raw: unknown): PlayerProfile {
  const input = record(raw);
  const equipment: Record<string, number> = {};
  for (const [name, level] of Object.entries(record(input.equipment))) {
    if (equipmentNames.has(name) && whole(level) > 0)
      equipment[name] = whole(level, 1, 99);
  }
  const valuables: Record<string, number> = {};
  for (const item of PLAYER_VALUABLES) {
    const count = whole(record(input.valuables)[item.key]);
    if (count > 0) valuables[item.key] = count;
  }
  const seen = new Set<string>();
  const characters: PlayerCharacter[] = [];
  for (const rawCharacter of Array.isArray(input.characters)
    ? input.characters
    : []) {
    const character = record(rawCharacter);
    if (
      typeof character.id !== "string" ||
      !character.id ||
      seen.has(character.id)
    )
      continue;
    if (
      typeof character.jobName !== "string" ||
      !character.jobName.trim() ||
      !["S", "A", "B", "C", "D", "E", "F"].includes(String(character.rank))
    )
      continue;
    seen.add(character.id);
    characters.push({
      id: character.id,
      jobName: character.jobName.trim(),
      rank: String(character.rank),
      statLevels: Object.fromEntries(
        STAT_KEYS.map((stat) => [
          stat,
          whole(record(character.statLevels)[stat], 1, 999),
        ]),
      ),
    });
  }
  return { version: 1, equipment, characters, valuables };
}

/** Migrate the existing separate tool preferences only when there is no unified profile. */
export function migratePlayerProfile(
  resident: unknown,
  knowHow: unknown,
  craftsman: unknown,
): PlayerProfile {
  return sanitizePlayerProfile({
    ...EMPTY,
    valuables: {
      ...deviceResidentValuables(resident),
      "know-how": whole(knowHow, 0, 6),
      craftsman: whole(craftsman, 0, 6),
    },
  });
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
let cachedRaw: string | null | undefined;
let cached = EMPTY;
let memoryOnly = false;
let storageError: string | null = null;

export function readPlayerProfile(): PlayerProfile {
  if (typeof window === "undefined") return EMPTY;
  if (memoryOnly) return cached;
  try {
    const raw = window.localStorage.getItem(PLAYER_PROFILE_KEY);
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    if (raw !== null) {
      try {
        cached = sanitizePlayerProfile(JSON.parse(raw));
      } catch {
        cached = EMPTY;
      }
    } else {
      cached = migratePlayerProfile(
        readJson(RESIDENT_STAT_ITEMS_KEY),
        readJson("houses-facilities-know-how"),
        readJson("houses-facilities-craftsman"),
      );
    }
    return cached;
  } catch {
    return cached;
  }
}

export function profileResidentStatItems(
  profile: PlayerProfile | Record<string, number>,
): ResidentStatItemCounts {
  const counts =
    "version" in profile
      ? (profile as PlayerProfile).valuables
      : (profile as Record<string, number>);
  return deviceResidentValuables(counts);
}

/** One authoritative write, with compatibility mirrors for the battle pages' existing water key. */
export function writePlayerProfile(next: Update<PlayerProfile>): void {
  const previous = readPlayerProfile();
  const profile = sanitizePlayerProfile(
    typeof next === "function" ? next(previous) : next,
  );
  if (typeof window === "undefined") return;
  cached = profile;
  cachedRaw = JSON.stringify(profile);
  try {
    window.localStorage.setItem(PLAYER_PROFILE_KEY, cachedRaw);
    memoryOnly = false;
    storageError = null;
    window.localStorage.setItem(
      RESIDENT_STAT_ITEMS_KEY,
      JSON.stringify(profileResidentStatItems(profile)),
    );
    window.localStorage.setItem(
      "houses-facilities-know-how",
      JSON.stringify(profile.valuables["know-how"] ?? 0),
    );
    window.localStorage.setItem(
      "houses-facilities-craftsman",
      JSON.stringify(profile.valuables.craftsman ?? 0),
    );
  } catch {
    memoryOnly = true;
    storageError =
      "Browser storage is unavailable or full. Changes are kept only while this page stays open; they have not been saved on this device.";
  }
  window.dispatchEvent(new Event(PLAYER_PROFILE_EVENT));
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === PLAYER_PROFILE_KEY || event.key === null) {
      memoryOnly = false;
      cachedRaw = undefined;
      listener();
    }
  };
  window.addEventListener(PLAYER_PROFILE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PLAYER_PROFILE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePlayerProfile(): [
  PlayerProfile,
  (next: Update<PlayerProfile>) => void,
] {
  return [
    useSyncExternalStore(subscribe, readPlayerProfile, () => EMPTY),
    writePlayerProfile,
  ];
}
export function useProfileStorageError(): string | null {
  return useSyncExternalStore(subscribe, readProfileStorageError, () => null);
}
export function readProfileStorageError(): string | null {
  return storageError;
}
export function useProfileValuables(): [
  Record<string, number>,
  (next: Update<Record<string, number>>) => void,
] {
  const [profile, setProfile] = usePlayerProfile();
  const setCounts = useCallback(
    (next: Update<Record<string, number>>) =>
      setProfile((previous) => ({
        ...previous,
        valuables: typeof next === "function" ? next(previous.valuables) : next,
      })),
    [setProfile],
  );
  return [profile.valuables, setCounts];
}
export function useResidentProfileValuables(): [
  ResidentStatItemCounts,
  (next: Update<ResidentStatItemCounts>) => void,
] {
  const [profile, setProfile] = usePlayerProfile();
  const residentCounts = useMemo(
    () => profileResidentStatItems(profile),
    [profile.valuables],
  );
  const setCounts = useCallback(
    (next: Update<ResidentStatItemCounts>) =>
      setProfile((previous) => {
        const counts = deviceResidentValuables(
          typeof next === "function"
            ? next(profileResidentStatItems(previous))
            : next,
        );
        const valuables = { ...previous.valuables };
        for (const item of RESIDENT_STAT_ITEMS) {
          delete valuables[item.key];
          if (counts[item.key]) valuables[item.key] = counts[item.key]!;
        }
        return { ...previous, valuables };
      }),
    [setProfile],
  );
  return [residentCounts, setCounts];
}
