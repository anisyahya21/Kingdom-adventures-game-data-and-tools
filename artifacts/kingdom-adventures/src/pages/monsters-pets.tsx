import { Link } from "wouter";
import { Database, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CARDS = [
  {
    href: "/monster-spawns",
    title: "Monster Spawns",
    description: "Current monster spawn database, separated from Weekly Conquest.",
    icon: MapPin,
    badge: "Live",
  },
  {
    href: "/monster-pet-stats",
    title: "Monster & Pet Stats",
    description: "Future database for monster and pet base level, growth, and level-based stats.",
    icon: Database,
    badge: "Scaffold",
  },
];

export default function MonstersPetsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">Monsters & Pets</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Split the database into location-driven spawn data and deeper monster or pet stat pages.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const content = (
            <Card className="h-full shadow-sm transition-all hover:shadow-md hover:border-primary/30 cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Icon className="w-5 h-5 text-primary" />
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

          return <Link key={card.href} href={card.href}>{content}</Link>;
        })}
      </div>
    </div>
  );
}
