import { Link } from "wouter";
import { BriefcaseBusiness, CalendarDays, Clock3, Gem, Trophy, Wand2, Award } from "lucide-react";
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
