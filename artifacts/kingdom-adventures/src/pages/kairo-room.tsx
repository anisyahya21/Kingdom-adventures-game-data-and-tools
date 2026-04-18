import { CalendarDays, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KAIRO_ROOM_DRAFTS } from "@/lib/en-event-drafts";

export default function KairoRoomPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Kairo Room</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          First-draft Kairo Room schedule showing active days, challenge names, and the equipment listed from the event box.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {KAIRO_ROOM_DRAFTS.map((entry) => (
          <Card key={entry.day} className="shadow-sm">
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
                <Badge variant="outline">{entry.active ? "Active" : "Off"}</Badge>
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
                    <div className="text-xs text-muted-foreground mb-2">Equipment from box</div>
                    <div className="flex flex-wrap gap-2">
                      {entry.equipmentFromBox.map((item) => (
                        <Badge key={item} variant="secondary" className="text-xs">
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
        ))}
      </div>
    </div>
  );
}
