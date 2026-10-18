import { ToolNavigationCard } from "@/components/ka/tool-navigation-card";
import { PageHeader } from "@/components/ka/page-header";

const CARDS = [
  {
    href: "/monster-spawns",
    title: "Monster Spawns & Loot",
    description:
      "One card per monster: spawn biome and level, the cave that spawns it, the treasure box it drops with every content and chance, and average XP per kill.",
  },
  {
    href: "/monster-pet-stats",
    title: "Monster & Pet Stats",
    description: "Detailed Kingdom Adventurers monster and pet stats database with base levels, growth, and level-based stat tables.",
  },
  {
    href: "/monster-xp",
    title: "Monster XP per Kill",
    description: "Compare Ground/dirt and biome XP per kill by area level, including stat-by-stat XP and XP Up skills.",
  },
];

export default function MonstersPetsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <PageHeader artworkKey="/monsters-pets" title="Monsters & Pets">
        <div className="max-w-3xl space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            Browse the Kingdom Adventurers monster database and pet database in detail, including spawn locations,
            monster levels, pet base stats, growth, and level-based stat comparisons.
          </p>
          <p>
            Use Monster Spawns when you need to find where an enemy appears, or Monster & Pet Stats when you want
            the deeper data for collecting, pet planning, and team comparisons.
          </p>
        </div>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-3">
        {CARDS.map((card) => <ToolNavigationCard key={card.href} href={card.href} title={card.title} description={card.description} />)}
      </div>
    </div>
  );
}

