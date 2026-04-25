import { useEffect, useMemo, useState } from "react";
import { Clock3, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { WAIRO_DUNGEON_LOOT_GROUP } from "@/lib/special-boss-loot";
import { applyEventHourOffset, useEventHourOffset } from "@/lib/event-time";

type WarioDungeonEntry = { day: number; hour: number };
type WarioDungeonSpawn = WarioDungeonEntry & { startsAt: Date; endsAt: Date };

const WARIO_DUNGEON_SCHEDULE: WarioDungeonEntry[] = [
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

function toJstDate(year: number, monthIndex: number, day: number, hour: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour - 9, 0, 0, 0));
}


function buildMonthlyWarioSchedule(base: Date, offset: number): WarioDungeonSpawn[] {
  const entries: WarioDungeonSpawn[] = [];
  for (const entry of WARIO_DUNGEON_SCHEDULE) {
    const sourceStartsAt = toJstDate(base.getFullYear(), base.getMonth(), entry.day, entry.hour);
    if (sourceStartsAt.getMonth() !== base.getMonth()) continue;
    const startsAt = applyEventHourOffset(sourceStartsAt, offset);
    entries.push({ ...entry, startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000) });
  }
  return entries.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Starting now";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function WarioDungeonPage() {
  const [now, setNow] = useState(() => new Date());
  const [eventOffset] = useEventHourOffset();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const schedule = useMemo(() => buildMonthlyWarioSchedule(now, eventOffset), [eventOffset, now]);
  const nextSpawn = useMemo(() => {
    const currentMonthUpcoming = schedule.find((entry) => entry.startsAt.getTime() > now.getTime());
    if (currentMonthUpcoming) return currentMonthUpcoming;
    const nextMonthBase = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return buildMonthlyWarioSchedule(nextMonthBase, eventOffset)[0] ?? null;
  }, [eventOffset, now, schedule]);

  const scheduleByDay = useMemo(() => {
    const grouped = new Map<number, WarioDungeonSpawn[]>();
    for (const entry of schedule) {
      if (!grouped.has(entry.day)) grouped.set(entry.day, []);
      grouped.get(entry.day)!.push(entry);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]).map(([day, entries]) => ({ day, entries }));
  }, [schedule]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Clock3 className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Wairo Dungeon</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Monthly dungeon spawn windows plus cleaned mined loot tables for the Wairo raid chain.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="w-4 h-4 text-primary" />
                Loot tables
              </div>
              <div className="text-sm text-muted-foreground">
                Resolved from mined SpecialBoss and Treasure lookup data, then reformatted into readable drop tables.
              </div>
              <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Each Wairo fight has 2 loot tables because the mined data contains 2 separate reward sets for the same encounter.
                Think of them as 2 possible reward pools tied to that stage, not 2 guaranteed drops at once.
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {WAIRO_DUNGEON_LOOT_GROUP.encounters.map((encounter) => (
                <div key={encounter.difficulty} className="rounded-lg border p-3 space-y-3">
                  <div>
                    <div className="font-medium text-sm">{encounter.difficulty}</div>
                    <div className="text-xs text-muted-foreground">
                      Lv {encounter.level} encounter • Boss Lv {encounter.bossLevel}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {encounter.tables.map((table, index) => (
                      <div key={index} className="overflow-hidden rounded-md border">
                        <div className="bg-muted/40 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                          Loot table {index + 1}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/20 text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">Item</th>
                                <th className="px-3 py-2 text-left font-medium">Quantity</th>
                                <th className="px-3 py-2 text-left font-medium">Rarity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {table.map((line) => (
                                <tr key={`${index}-${line.item}`} className="border-t border-border/60">
                                  <td className="px-3 py-2 text-foreground">{line.item}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{line.quantity}</td>
                                  <td className="px-3 py-2">
                                    <Badge variant="secondary" className="font-mono text-[11px]">
                                      {line.chance}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="font-semibold">Next spawn</div>
              {nextSpawn ? (
                <>
                  <div className="text-sm">
                    <div className="font-medium">Day {nextSpawn.day} - {nextSpawn.startsAt.toLocaleString([], { month: "short", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" })}</div>
                  </div>
                  <div className="rounded-lg border px-3 py-2 text-sm">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">Countdown</div>
                    <div className="text-lg font-semibold tabular-nums">{formatCountdown(nextSpawn.startsAt.getTime() - now.getTime())}</div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No future spawn found.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1">
            <div className="font-semibold">Wairo Dungeon schedule</div>
            <div className="text-sm text-muted-foreground">
              Spawn times are shown in your local time with your event offset applied ({eventOffset >= 0 ? `+${eventOffset}` : eventOffset}h).
            </div>
          </div>
          <div className="space-y-2">
            {scheduleByDay.map(({ day, entries }) => {
              const firstEntry = entries[0];
              const isPast = entries.every((entry) => entry.endsAt.getTime() <= now.getTime());
              const isActive = entries.some((entry) => entry.startsAt.getTime() <= now.getTime() && now.getTime() < entry.endsAt.getTime());
              return (
                <div key={day} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${isActive ? "border-green-500/40 bg-green-500/5" : ""}`}>
                  <div>
                    <div className="font-medium">Day {day} - {firstEntry.startsAt.toLocaleString([], { weekday: "short" })}</div>
                    <div className="text-xs text-muted-foreground">
                      {entries.map((entry) => entry.startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })).join(" - ")}
                    </div>
                  </div>
                  <div className={`text-right text-xs ${isPast ? "text-muted-foreground" : ""}`}>
                    {isActive ? <div className="font-medium text-green-600 dark:text-green-400">Live now</div> : isPast ? <div>Ended</div> : <div className="font-medium">Upcoming</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>The first day of the month has three spawns in the source data.</div>
            <div>Days 30 and 31 can also have multiple spawns when those dates exist in the month.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
