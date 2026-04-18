import { Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MonsterPetStatsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Monster & Pet Stats</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Future database for monster and pet stat pages, backed by the mined game CSV data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Planned structure</CardTitle>
          <CardDescription>What this database is being prepared to show</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div>Base level and growth information.</div>
          <div>Stats at level, with a layout similar to the existing database pages.</div>
          <div>Monster and pet detail pages sourced from the mined CSV, terrain, and map-chip data.</div>
        </CardContent>
      </Card>
    </div>
  );
}
