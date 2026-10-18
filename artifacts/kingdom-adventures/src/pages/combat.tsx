import { Link } from "wouter";
import { ArrowRight, Swords } from "lucide-react";
import { PageHeader } from "@/components/ka/page-header";
import { ToolNavigationCard } from "@/components/ka/tool-navigation-card";
import { GameAccountPicker } from "@/components/ka/game-account-picker";

const tools = [
  { href: "/combat/character-builder", title: "Character Builder", description: "Build a character. Choose equipment and skills, and see how their stats come together.", detail: "Characters · Equipment · Skills", action: "Build a character" },
  { href: "/combat/multi-box", title: "Multi-Box Farming", description: "Turn target stats into builds from your profile, then put your team through the simulator.", detail: "Find builds · Simulate · Compare", action: "Plan a farming team" },
  { href: "/combat/formulas", title: "Combat Formulas", description: "Understand damage, targeting, and what your combat skills actually do.", detail: "Damage · Magic · Arrows · Targeting", action: "Explore the mechanics" },
];

export default function CombatPage() {
  return <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:py-12">
    <PageHeader icon={<Swords className="h-6 w-6 text-primary" />} title="Combat Hub">
      <p>Build your characters. Plan your team. Understand the fight.</p>
    </PageHeader>
    <GameAccountPicker />
    <div className="grid gap-4 lg:grid-cols-3">
      {tools.map((tool) => <ToolNavigationCard key={tool.href} {...tool} />)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-5 py-4">
      <div><p className="text-sm font-medium">Start with what you own</p><p className="mt-1 text-xs text-muted-foreground">Your profile supplies the characters and equipment for build searches.</p></div>
      <Link href="/player-profile" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary">Open profile<ArrowRight className="h-4 w-4" /></Link>
    </div>
  </div>;
}
