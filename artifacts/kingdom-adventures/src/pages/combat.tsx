import { Link } from "wouter";
import { ArrowRight, BookOpen, Boxes, SlidersHorizontal, Swords } from "lucide-react";
import { PageHeader } from "@/components/ka/page-header";
import { Card, CardContent } from "@/components/ui/card";

import { GameAccountPicker } from "@/components/ka/game-account-picker";

const tools = [
  { href: "/combat/character-builder", icon: SlidersHorizontal, title: "Character Builder", description: "Build a character. Choose equipment and skills, and see how their stats come together.", detail: "Characters · Equipment · Skills", action: "Build a character", number: "01" },
  { href: "/combat/multi-box", icon: Boxes, title: "Multi-Box Farming", description: "Turn target stats into builds from your profile, then put your team through the simulator.", detail: "Find builds · Simulate · Compare", action: "Plan a farming team", number: "02" },
  { href: "/combat/formulas", icon: BookOpen, title: "Combat Formulas", description: "Understand damage, targeting, and what your combat skills actually do.", detail: "Damage · Magic · Arrows · Targeting", action: "Explore the mechanics", number: "03" },
];

export default function CombatPage() {
  return <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:py-12">
    <PageHeader icon={<Swords className="h-6 w-6 text-primary" />} title="Combat Hub">
      <p>Build your characters. Plan your team. Understand the fight.</p>
    </PageHeader>
    <GameAccountPicker />
    <div className="grid gap-4 lg:grid-cols-3">
      {tools.map(({ href, icon: Icon, title, description, detail, action, number }) => <Link key={href} href={href} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Card className="h-full overflow-hidden transition-all group-hover:-translate-y-1 group-hover:border-primary/50 group-hover:shadow-md">
          <CardContent className="flex h-full flex-col p-6 sm:p-7">
            <div className="mb-8 flex items-center justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-6 w-6" /></span><span className="font-mono text-xs text-muted-foreground/60">{number}</span></div>
            <h2 className="mb-3 text-xl font-semibold tracking-tight">{title}</h2>
            <p className="mb-6 text-sm leading-6 text-muted-foreground">{description}</p>
            <p className="mb-7 mt-auto text-xs text-muted-foreground">{detail}</p>
            <div className="flex items-center justify-between border-t border-border pt-5 text-sm font-medium text-primary">{action}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
          </CardContent>
        </Card>
      </Link>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-5 py-4">
      <div><p className="text-sm font-medium">Start with what you own</p><p className="mt-1 text-xs text-muted-foreground">Your profile supplies the characters and equipment for build searches.</p></div>
      <Link href="/player-profile" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary">Open profile<ArrowRight className="h-4 w-4" /></Link>
    </div>
  </div>;
}
