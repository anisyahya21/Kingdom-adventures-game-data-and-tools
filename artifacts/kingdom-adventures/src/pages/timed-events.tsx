import { ToolIdentityArtwork } from "@/components/ka/tool-identity";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Bell, BriefcaseBusiness, ClipboardList, Clock3, Trophy, Wand2, Award, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEventRefresh } from "@/lib/event-refresh";
import { useEventHourOffset } from "@/lib/event-time";
import { KAIRO_ROOM_DRAFTS } from "@/lib/en-event-drafts";
import { eventStatusCardClass, eventStatusClass, eventStatusLabel, type EventStatus } from "@/lib/event-status";
import { isWarioDungeonLive } from "@/lib/wairo-schedule";
import { getFacilityIcon } from "@/lib/equipment-icons";

const GACHA_EVENTS_ARTWORK = "/homepage-artwork/gacha-casino-v1.png";
const WAIRO_DUNGEON_ICON = "/website_icons/facilities_confirmed/mapchip_223_wairo_dungeon.png";

const EVENT_CARDS = [
  {
    href: "/briefing-room",
    title: "Briefing Room",
    description: "Today’s and tomorrow’s mission goals and rewards, with monster spawn details and this month’s target schedule.",
    icon: ClipboardList,
    facilityIconId: 167,
    status: "live" as EventStatus,
  },
  {
    href: "/gacha-events",
    title: "Gacha Events",
    description: "Featured S-rank jobs, S facilities, Kairo windows, and weapon banner timing.",
    customIcon: GACHA_EVENTS_ARTWORK,
    status: "live" as EventStatus,
  },
  {
    href: "/weekly-conquest",
    title: "Weekly Conquest",
    description: "Current conquest targets, rewards, and the locations you need to clear each week.",
    icon: Trophy,
    facilityIconId: 168,
    status: "live" as EventStatus,
  },
  {
    href: "/wario-dungeon",
    title: "Wairo Dungeon",
    description: "Dedicated event page for the monthly dungeon spawn windows.",
    customIcon: WAIRO_DUNGEON_ICON,
    icon: Clock3,
    facilityIconId: 223,
    status: "inactive" as EventStatus,
  },
  {
    href: "/daily-rank-rewards",
    title: "Daily Rank Rewards",
    description: "Daily ranking board reward tables for S and A rank, grouped by weekday.",
    icon: Award,
    facilityIconId: 172,
    status: "live" as EventStatus,
  },
  {
    href: "/kairo-room",
    title: "Kairo Room",
    description: "Active days, challenge names, and equipment box rewards from the EN sheet.",
    icon: Wand2,
    facilityIconId: 180,
    status: "inactive" as EventStatus,
  },
  {
    href: "/job-center",
    title: "Job Center",
    description: "Weekly profession rotation by day, using the EN sheet as a readable event schedule.",
    icon: BriefcaseBusiness,
    facilityIconId: 174,
    status: "live" as EventStatus,
  },
];

type EventCard = (typeof EVENT_CARDS)[number] & { disabled?: boolean; facilityIconId?: number };

export default function TimedEventsPage() {
  const [offset, setOffset] = useEventHourOffset();
  const [now, setNow] = useState(() => new Date());
  const refreshNow = useCallback(() => setNow(new Date()), []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEventRefresh(refreshNow);

  const localDay = new Date(now.getTime() + offset * 60 * 60 * 1000).toLocaleDateString("en-US", { weekday: "long" });
  const kairoRoomLive = Boolean(KAIRO_ROOM_DRAFTS.find((entry) => entry.day === localDay)?.active);
  const warioDungeonLive = isWarioDungeonLive(now, offset);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3"><ToolIdentityArtwork artworkKey="/timed-events" /><h1 className="text-xl font-bold tracking-tight">Events</h1></div>
          <p className="text-sm text-muted-foreground">Schedules, rewards and upcoming events.</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/player-profile?tab=notifications"><Bell className="mr-2 h-4 w-4" />Manage reminders</Link></Button>
      </div>
      <details className="rounded-lg border bg-muted/15 px-4 py-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">Event time settings <span className="ml-2 font-mono text-foreground">{offset >= 0 ? "+" : ""}{offset}h</span></summary>
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center gap-3"><span>Event time offset</span><div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setOffset((value) => Math.max(-23, value - 1))} disabled={offset <= -23} aria-label="Decrease offset"><Minus className="h-4 w-4" /></Button>
            <span className="min-w-8 text-center font-mono text-foreground">{offset >= 0 ? "+" : ""}{offset}h</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setOffset((value) => Math.min(23, value + 1))} disabled={offset >= 23} aria-label="Increase offset"><Plus className="h-4 w-4" /></Button>
          </div></div>
          <p>Kairo Room, Job Center, Wairo Dungeon and Gacha Events use local time plus this offset. Daily Rank Rewards and Weekly Conquest use Japan time. Briefing Room uses the Japan calendar with this offset applied.</p>
          <p className="text-xs">If event times look off after a daylight saving change, adjust the offset here.</p>
        </div>
      </details>

      <div className="grid gap-4 md:grid-cols-2">
        {(EVENT_CARDS as EventCard[]).map((card) => {
          const status =
            card.href === "/kairo-room" ? (kairoRoomLive ? "live" : "inactive")
            : card.href === "/wario-dungeon" ? (warioDungeonLive ? "live" : "inactive")
            : card.href === "/daily-rank-rewards" ? "live"
            : card.status;
          const facIcon = card.facilityIconId ? getFacilityIcon(card.facilityIconId) : undefined;
          const content = (
            <Card className={`h-full shadow-sm transition-all overflow-hidden ${eventStatusCardClass(status)} ${card.disabled ? "opacity-75" : "hover:shadow-md hover:border-primary/30 cursor-pointer"}`}>
              <div className="flex h-full">
                <div className="flex-none w-20 self-stretch flex items-center justify-center bg-muted/30 border-r border-border p-2">
                  {card.customIcon
                    ? <img src={card.customIcon} alt="" className="w-full h-full object-contain" style={{ imageRendering: "pixelated" }} />
                    : facIcon
                    ? <img src={facIcon} alt="" className="w-full h-full object-contain" style={{ imageRendering: "pixelated" }} />
                    : <card.icon className="w-8 h-8 text-primary" />}
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-end">
                      <Badge variant="outline" className={eventStatusClass(status)}>{eventStatusLabel(status)}</Badge>
                    </div>
                    <CardTitle className="text-base">{card.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-xs leading-relaxed">{card.description}</CardDescription>
                  </CardContent>
                </div>
              </div>
            </Card>
          );

          return card.disabled ? <div key={card.title}>{content}</div> : <Link key={card.href} href={card.href}>{content}</Link>;
        })}
      </div>
    </div>
  );
}

