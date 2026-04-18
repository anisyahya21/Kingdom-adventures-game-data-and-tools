import { BriefcaseBusiness, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JOB_CENTER_DRAFTS } from "@/lib/en-event-drafts";

export default function JobCenterPage() {
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
        {JOB_CENTER_DRAFTS.map((entry) => (
          <Card key={entry.day} className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                {entry.day}
              </CardTitle>
              <CardDescription>{entry.professions.length} professions listed for this rotation.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {entry.professions.map((profession) => (
                <Badge key={profession} variant="outline" className="text-xs">
                  {profession}
                </Badge>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
