import { Link } from "wouter";
import { Egg, Skull } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CARDS = [
  {
    href: "/eggs",
    title: "Eggs & Pets",
    description: "Egg planner with I Want This Pet, I Have This Egg, and Feed Item Reference.",
    icon: Egg,
    badge: "Planner",
  },
  {
    href: "/monsters-pets",
    title: "Monsters & Pets",
    description: "Home for the monster spawns database and the future monster & pet stats database.",
    icon: Skull,
    badge: "Database",
  },
];

export default function EggsPetsMonstersPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">Eggs, Pets & Monsters</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Choose between the current egg planner and the broader monster and pet database area.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href}>
              <Card className="h-full shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer">
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
            </Link>
          );
        })}
      </div>
    </div>
  );
}
