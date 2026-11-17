import { PageHeader } from "@/components/ka/page-header";
import { ToolNavigationCard } from "@/components/ka/tool-navigation-card";

const CARDS = [
  {
    href: "/map-rewards",
    title: "Map Rewards",
    description: "Look up area chests, recruits and boss unlocks.",
  },
  {
    href: "/valuables",
    title: "Valuables",
    description: "Find every numbered Treasure, its effect, and how to get it.",
  },
  {
    href: "/item-sources",
    artworkKey: "miscellaneous-items",
    title: "Items",
    description: "Look up where to find items and skills.",
  },
  {
    href: "/world-builder",
    artworkKey: "miscellaneous-world-builder",
    title: "World Builder",
    description: "Plan your town layout and place buildings on the map.",
  },
  {
    href: "/town-rank",
    artworkKey: "miscellaneous-town-rank",
    title: "Town Rank",
    description: "Check rank upgrade requirements and unlocks.",
  },
];

export default function MiscellaneousPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <PageHeader title="Miscellaneous" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => <ToolNavigationCard key={card.href} {...card} />)}
      </div>
    </div>
  );
}
