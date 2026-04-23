import { Link } from "wouter";
import { useEffect, useState } from "react";
import { BriefcaseBusiness, CalendarDays, Clock3, Gem, Trophy, Wand2, Award, AlertTriangle, Plus, Minus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const EVENT_CARDS = [
  {
    href: "/gacha-events",
    title: "Gacha Events",
    description: "Featured S-rank jobs, S facilities, Kairo windows, and weapon banner timing.",
    icon: Gem,
    badge: "Live",
  },
  {
    href: "/weekly-conquest",
    title: "Weekly Conquest",
    description: "Current conquest targets, rewards, and the locations you need to clear each week.",
    icon: Trophy,
    badge: "Moved",
  },
  {
    href: "/wario-dungeon",
    title: "Wairo Dungeon",
    description: "Dedicated event page for the monthly dungeon spawn windows.",
    icon: Clock3,
    badge: "Live",
  },
  {
    href: "/daily-rank-rewards",
    title: "Daily Rank Rewards",
    description: "Daily ranking board reward tables for S and A rank, grouped by weekday.",
    icon: Award,
    badge: "Draft",
  },
  {
    href: "/kairo-room",
    title: "Kairo Room",
    description: "Active days, challenge names, and first-draft equipment box rewards from the EN sheet.",
    icon: Wand2,
    badge: "Draft",
  },
  {
    href: "/job-center",
    title: "Job Center",
    description: "Weekly profession rotation by day, using the EN sheet as a readable first pass.",
    icon: BriefcaseBusiness,
    badge: "Draft",
  },
];

type EventCard = (typeof EVENT_CARDS)[number] & { disabled?: boolean };

export default function TimedEventsPage() {
  // Persistent offset state
  const [offset, setOffset] = useState(() => {
    const stored = localStorage.getItem("eventHourOffset");
    return stored ? parseInt(stored, 10) : 0;
  });
  useEffect(() => {
    localStorage.setItem("eventHourOffset", String(offset));
  }, [offset]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Events</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Home for the time-based systems we want grouped under one card on the homepage.
        </p>
      </div>

      {/* DST Warning Box - styled to match site theme, only icon is red */}
      <div className="border-2 border-border bg-muted text-foreground rounded-lg px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 mt-0.5 text-red-500 shrink-0" />
        <div>
          <div className="font-semibold">Warning: Daylight Saving Time (DST) Offset</div>
          <div className="text-sm mt-1">
            Some event times may be affected by DST or timezone differences. If event times look off, use the offset control below to adjust.<br />
            <span className="font-medium">Kairo Room, Job Center, and Wairo Dungeon</span> follow your local time <span className="font-medium">plus any offset you set here</span>.<br />
            <span className="font-medium">Daily Rank Rewards & Weekly Conquest</span> always follow Japan time, converted to your local time.
          </div>
        </div>
      </div>

      {/* Offset Control - dark theme */}
      <div className="flex items-center gap-3 border border-border bg-muted rounded-lg px-4 py-2 w-fit my-2">
        <span className="font-medium text-primary">Event Time Offset:</span>
        <button
          className="p-1 rounded border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          onClick={() => setOffset((v) => Math.max(-23, v - 1))}
          disabled={offset <= -23}
          aria-label="Decrease offset"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="font-mono text-base w-10 text-center">{offset >= 0 ? `+${offset}` : offset}h</span>
        <button
          className="p-1 rounded border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          onClick={() => setOffset((v) => Math.min(23, v + 1))}
          disabled={offset >= 23}
          aria-label="Increase offset"
        >
          <Plus className="w-4 h-4" />
        </button>
        <span className="text-xs text-muted-foreground">(applies to Kairo Room, Job Center, Wairo Dungeon)</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(EVENT_CARDS as EventCard[]).map((card) => {
          const content = (
            <Card className={`h-full shadow-sm transition-all ${card.disabled ? "opacity-75" : "hover:shadow-md hover:border-primary/30 cursor-pointer"}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <card.icon className="w-5 h-5 text-primary" />
                  </div>
                  <Badge variant="outline">{card.badge}</Badge>
                </div>
                <CardTitle className="text-base mt-2">{card.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs leading-relaxed">{card.description}</CardDescription>
              </CardContent>
            </Card>
          );

          return card.disabled ? <div key={card.title}>{content}</div> : <Link key={card.href} href={card.href}>{content}</Link>;
        })}
      </div>
    </div>
  );
}
