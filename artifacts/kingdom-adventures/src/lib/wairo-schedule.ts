import { eventClockDateToLocalDate, getOffsetAdjustedNow } from "@/lib/event-time";

export type WarioDungeonEntry = { day: number; hour: number };
export type WarioDungeonSpawn = WarioDungeonEntry & { startsAt: Date; endsAt: Date };

export const WAIRO_DUNGEON_SCHEDULE: WarioDungeonEntry[] = [
  { day: 1, hour: 9 }, { day: 1, hour: 13 }, { day: 1, hour: 18 },
  { day: 2, hour: 15 }, { day: 2, hour: 23 },
  { day: 3, hour: 12 }, { day: 3, hour: 17 },
  { day: 4, hour: 19 },
  { day: 5, hour: 21 }, { day: 5, hour: 6 },
  { day: 6, hour: 8 },
  { day: 7, hour: 12 },
  { day: 8, hour: 14 },
  { day: 9, hour: 19 },
  { day: 10, hour: 22 },
  { day: 11, hour: 21 },
  { day: 12, hour: 16 },
  { day: 13, hour: 11 },
  { day: 14, hour: 19 },
  { day: 15, hour: 20 },
  { day: 16, hour: 8 },
  { day: 17, hour: 16 },
  { day: 18, hour: 20 },
  { day: 19, hour: 22 },
  { day: 20, hour: 1 },
  { day: 21, hour: 17 },
  { day: 22, hour: 16 },
  { day: 23, hour: 19 },
  { day: 24, hour: 11 },
  { day: 25, hour: 23 },
  { day: 26, hour: 0 },
  { day: 27, hour: 11 },
  { day: 28, hour: 16 },
  { day: 29, hour: 14 },
  { day: 30, hour: 15 }, { day: 30, hour: 22 },
  { day: 31, hour: 10 }, { day: 31, hour: 21 },
];

function buildWarioScheduleForEventMonth(year: number, monthIndex: number, offset: number): WarioDungeonSpawn[] {
  const entries: WarioDungeonSpawn[] = [];
  for (const entry of WAIRO_DUNGEON_SCHEDULE) {
    const eventClockStartsAt = new Date(year, monthIndex, entry.day, entry.hour, 0, 0, 0);
    if (eventClockStartsAt.getMonth() !== monthIndex) continue;
    const startsAt = eventClockDateToLocalDate(eventClockStartsAt, offset);
    entries.push({ ...entry, startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000) });
  }
  return entries.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function buildMonthlyWarioSchedule(base: Date, offset: number): WarioDungeonSpawn[] {
  const eventClockBase = getOffsetAdjustedNow(base, offset);
  return buildWarioScheduleForEventMonth(eventClockBase.getFullYear(), eventClockBase.getMonth(), offset);
}

export function getNextWarioDungeonSpawn(now = new Date(), offset = 0): WarioDungeonSpawn | null {
  const currentMonthUpcoming = buildMonthlyWarioSchedule(now, offset).find(
    (entry) => entry.startsAt.getTime() > now.getTime(),
  );
  if (currentMonthUpcoming) return currentMonthUpcoming;

  const eventClockNow = getOffsetAdjustedNow(now, offset);
  return buildWarioScheduleForEventMonth(eventClockNow.getFullYear(), eventClockNow.getMonth() + 1, offset)[0] ?? null;
}

export function isWarioDungeonLive(now = new Date(), offset = 0) {
  return buildMonthlyWarioSchedule(now, offset).some(
    (entry) => entry.startsAt.getTime() <= now.getTime() && now.getTime() < entry.endsAt.getTime(),
  );
}

