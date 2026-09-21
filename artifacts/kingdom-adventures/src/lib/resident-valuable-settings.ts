/**
 * Device-wide universal valuable settings (the Loadout Builder's "Universal Settings" card) and
 * their carryover into the battle pages.
 *
 * The Loadout Builder stores "how many of each Water of ... you have used" once per device under
 * `ka_resident_stat_items` and mirrors the counts onto every saved loadout (`residentStatItems`).
 * A stored loadout can still arrive without that field - a row written before the mirror existed,
 * or a row restored from the shared document - and the conversion then reports
 * `RESIDENT_VALUABLES_NOT_CAPTURED` and adds nothing to the battle parameters (the honest
 * declared-input gap). The battle pages read the same device key so the player's declared counts
 * still reach the battle statistics.
 *
 * Carryover rule (no double counting): a loadout's OWN `residentStatItems` always wins when the
 * field is present, including an explicit empty record (declared none). The device counts are
 * copied only onto a loadout that has no field at all, and only when at least one water is
 * declared device-wide. Counts are never summed or merged, so one water is worth its `amount`
 * exactly once.
 */
import { RESIDENT_STAT_ITEMS, type ResidentStatItemCounts } from "@/game-data/resident-stat-items";
import { residentValuablesDeclared } from "@/game-data/resident-valuable-effects";

/** The device-wide storage key the Loadout Builder writes and the battle pages read. */
export const RESIDENT_STAT_ITEMS_KEY = "ka_resident_stat_items";

/**
 * Defensive read of the stored device counts: known water keys with a positive whole count only.
 * An unknown key or a malformed value is dropped rather than carried as a bonus.
 */
export function deviceResidentValuables(raw: unknown): ResidentStatItemCounts {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const counts: ResidentStatItemCounts = {};
  for (const item of RESIDENT_STAT_ITEMS) {
    const value = record[item.key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    counts[item.key] = Math.floor(value);
  }
  return counts;
}

export function withResidentValuables<T extends { residentStatItems?: ResidentStatItemCounts }>(
  loadout: T,
  device: ResidentStatItemCounts,
): T {
  if (loadout.residentStatItems !== undefined) return loadout;
  if (!residentValuablesDeclared(device)) return loadout;
  return { ...loadout, residentStatItems: { ...device } };
}

/** Apply the carryover to a batch of saved loadouts (a no-op when the device declares nothing). */
export function loadoutsWithResidentValuables<T extends { residentStatItems?: ResidentStatItemCounts }>(
  loadouts: T[],
  device: ResidentStatItemCounts,
): T[] {
  if (!residentValuablesDeclared(device)) return loadouts;
  return loadouts.map((loadout) => withResidentValuables(loadout, device));
}