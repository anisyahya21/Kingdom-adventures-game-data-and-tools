import { useEffect, useState } from "react";
import { BriefcaseBusiness, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JOB_CENTER_DRAFTS } from "@/lib/en-event-drafts";
import { Link } from "wouter";
import { getOffsetAdjustedNow, useEventHourOffset } from "@/lib/event-time";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export default function JobCenterPage() {
  const [now, setNow] = useState(() => new Date());
  const [eventOffset] = useEventHourOffset();
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const currentEventDay = WEEKDAYS[getOffsetAdjustedNow(now, eventOffset).getDay()];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Job Center</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          First-draft weekly job-center profession rotation, using the community sheet as a readable guide while we trace the mined source.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {JOB_CENTER_DRAFTS.map((entry) => {
          const isCurrentDay = entry.day === currentEventDay;
          return (
          <Card key={entry.day} className={`shadow-sm ${isCurrentDay ? "border-primary/50 bg-primary/5" : ""}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  {entry.day}
                </CardTitle>
                {isCurrentDay ? <Badge variant="outline">Current</Badge> : null}
              </div>
              <CardDescription>{entry.professions.length} professions listed for this rotation.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {entry.professions.map((profession) => (
                <Link
                  key={profession}
                  href={`/jobs/${encodeURIComponent(profession)}`}
                  className="focus:outline-none"
                >
                  <Badge
                    variant="outline"
                    className="text-xs cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors"
                    asChild
                  >
                    <span>{profession}</span>
                  </Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
