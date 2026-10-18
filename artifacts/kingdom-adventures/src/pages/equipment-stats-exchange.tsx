import { ToolNavigationCard } from "@/components/ka/tool-navigation-card";
import { PageHeader } from "@/components/ka/page-header";

const CARDS = [
  {
    href: "/equipment-stats",
    title: "Equipment Stats",
    description: "Browse and compare equipment stats at any level.",
  },
  {
    href: "/equipment-exchange",
    title: "Equipment Exchange",
    description: "Calculate the cheapest route into A-rank Kairo equipment using live trade prices and mined copper values.",
  },
  {
    href: "/equipment-leveling-optimizer",
    title: "Equipment Leveling Optimizer",
    description: "Calculate EXP gained from sacrificed equipment and prepare for cheapest leveling route optimization.",
  },
];

export default function EquipmentStatsExchangePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <PageHeader artworkKey="/equipment" title="Equipment Stats & Exchange">
        <p className="text-sm text-muted-foreground max-w-3xl">
          Choose between the Kingdom Adventurers equipment stats database, exchange calculator, and leveling optimizer.
          Use these tools to compare weapons, shields, armor, accessories, ranks, craft requirements, and exchange routes.
        </p>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-3">
        {CARDS.map((card) => <ToolNavigationCard key={card.href} href={card.href} title={card.title} description={card.description} />)}
      </div>
    </div>
  );
}

