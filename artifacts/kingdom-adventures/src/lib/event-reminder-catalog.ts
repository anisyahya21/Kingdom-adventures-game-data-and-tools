import type { GachaEvent } from "../pages/gacha-events";

export const REMINDER_GACHA_GROUPS = ["S Rank Gacha", "S Rank Weapons", "S Rank Facility"] as const;
export type ReminderGachaGroup = (typeof REMINDER_GACHA_GROUPS)[number];

/** Explicit catalog rank keeps recurring lower-rank weapon pools out. */
export function reminderGachaGroup(event: GachaEvent): ReminderGachaGroup | null {
  if (event.kind === "weapons") return event.weaponRank === "S" ? "S Rank Weapons" : null;
  if (event.kind === "facilities") return "S Rank Facility";
  if (event.kind === "jobs" && event.title.startsWith("S Rank")) return "S Rank Gacha";
  return null;
}
