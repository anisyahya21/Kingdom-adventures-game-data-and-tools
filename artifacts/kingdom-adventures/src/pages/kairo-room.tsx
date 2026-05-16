import { useEffect, useState } from "react";
import { CalendarDays, Calculator, ShieldAlert, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KAIRO_ROOM_DRAFTS } from "@/lib/en-event-drafts";
import { KAIRO_ROOM_LOOT_GROUPS } from "@/lib/special-boss-loot";
import { getOffsetAdjustedNow, useEventHourOffset } from "@/lib/event-time";
import { eventStatusCardClass, eventStatusClass, eventStatusLabel } from "@/lib/event-status";
import { KairoFarmingCalculator } from "@/components/kairo-farming-calculator";
import { CharacterPreviewCanvas } from "@/components/character-preview-canvas";
import { useEquipmentIcons } from "@/hooks/use-equipment-icons";
import { getEquipmentIcon, getItemIcon } from "@/lib/equipment-icons";

const FACILITY_ITEM_ICONS: Record<string, string> = {
  "Kairo King Statue": "/website_icons/facilities_confirmed/facility_186_kairo_king_statue.png",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function kairoDayAnchor(day: string): string {
  return `kairo-room-${day.toLowerCase()}`;
}

function scrollToKairoDay(day: string): void {
  const target = document.getElementById(kairoDayAnchor(day));
  if (!target) return;
  window.history.replaceState(null, "", `#${kairoDayAnchor(day)}`);
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function KairoRoomPage() {
  const equipIcons = useEquipmentIcons();
  const [now, setNow] = useState(() => new Date());
  const [eventOffset] = useEventHourOffset();
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const currentEventDay = WEEKDAYS[getOffsetAdjustedNow(now, eventOffset).getDay()];

  const weekdayByTitle = new Map(
    KAIRO_ROOM_DRAFTS.filter((entry) => entry.active && entry.questName).map((entry) => [
      entry.questName!.replace("'s Challenge", ""),
      entry.day,
    ]),
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-bold tracking-tight">Kairo Room</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Weekly Kairo Room schedule plus cleaned mined loot tables for each challenge and difficulty.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            document.getElementById("kairo-farming-calc")?.scrollIntoView({ behavior: "smooth" })
          }
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          <Calculator className="w-4 h-4" />
          Jump to Farming Calculator — find the best run for any drop
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {KAIRO_ROOM_DRAFTS.map((entry) => {
          const isCurrentDay = entry.day === currentEventDay;
          const isLive = isCurrentDay && entry.active;
          const canOpenDay = entry.active && !!entry.questName;
          return (
          <Card
            key={entry.day}
            role={canOpenDay ? "button" : undefined}
            tabIndex={canOpenDay ? 0 : undefined}
            aria-label={canOpenDay ? `View ${entry.day} Kairo Room loot tables` : undefined}
            onClick={canOpenDay ? () => scrollToKairoDay(entry.day) : undefined}
            onKeyDown={canOpenDay ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              scrollToKairoDay(entry.day);
            } : undefined}
            className={`shadow-sm ${eventStatusCardClass(isLive ? "live" : "inactive")} ${canOpenDay ? "cursor-pointer transition-transform hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" : ""}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    {entry.day}
                  </CardTitle>
                  <CardDescription>
                    {entry.active ? entry.questName : "No Kairo Room challenge listed."}
                  </CardDescription>
                </div>
                <Badge variant="outline" className={eventStatusClass(isLive ? "live" : "inactive")}>
                  {eventStatusLabel(isLive ? "live" : "inactive")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {entry.active ? (
                <>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Quest name</div>
                    <div className="text-sm font-medium text-foreground">{entry.questName}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Main equipment from box</div>
                    <div className="flex flex-wrap gap-2">
                      {entry.equipmentFromBox.map((item) => (
                        <Badge key={item} variant="secondary" className="text-xs">
                          {getEquipmentIcon(equipIcons, item) && (
                            <img src={getEquipmentIcon(equipIcons, item)} alt="" className="mr-1 inline h-4 w-4 rounded object-contain align-[-3px]" />
                          )}
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  The EN sheet does not list a Kairo Room challenge for this day.
                </div>
              )}
            </CardContent>
          </Card>
          );
        })}
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" />
            Loot tables
          </CardTitle>
          <CardDescription>
            Resolved from mined SpecialBoss and Treasure lookup data, then reformatted into readable drop tables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {KAIRO_ROOM_LOOT_GROUPS.map((group) => {
            const day = weekdayByTitle.get(group.title);
            return (
            <div key={group.title} id={day ? kairoDayAnchor(day) : undefined} className="scroll-mt-24 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold">{group.title}</h2>
                <Badge variant="outline">{day ?? "Event day"}</Badge>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {group.encounters.map((encounter) => (
                  <div key={`${group.title}-${encounter.difficulty}`} className="rounded-lg border p-3 space-y-3">
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
                                  <td className="px-3 py-2 text-foreground">
                                      <div className="flex items-center gap-2">
                                        {line.item === "F Rank Scholar" ? (
                                          <CharacterPreviewCanvas jobName="Scholar" rank="F" variant={1} equipState="right" scale={2} poseFrame={0} label="F Rank Scholar" className="h-10 w-auto shrink-0" />
                                        ) : getEquipmentIcon(equipIcons, line.item) ? (
                                          <img src={getEquipmentIcon(equipIcons, line.item)} alt="" className="h-10 w-10 shrink-0 object-contain" style={{ imageRendering: "pixelated" }} />
                                        ) : getItemIcon(line.item) ? (
                                          <img src={getItemIcon(line.item)!} alt="" className="h-6 w-6 shrink-0 object-contain" style={{ imageRendering: "pixelated" }} />
                                        ) : FACILITY_ITEM_ICONS[line.item] ? (
                                          <img src={FACILITY_ITEM_ICONS[line.item]} alt="" className="h-8 w-8 shrink-0 object-contain" style={{ imageRendering: "pixelated" }} />
                                        ) : (
                                          <span className="h-8 w-8 shrink-0" />
                                        )}
                                        <span>{line.item}</span>
                                      </div>
                                    </td>
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
            </div>
          );
          })}
        </CardContent>
      </Card>

      <KairoFarmingCalculator currentDay={currentEventDay} />
    </div>
  );
}
