import { ToolNavigationCard } from "@/components/ka/tool-navigation-card";
import { PageHeader } from "@/components/ka/page-header";

const CARDS = [
  {
    href: "/eggs",
    title: "Eggs & Pets",
    description: "Kingdom Adventurers egg planner with I Want This Pet, I Have This Egg, pet outcomes, and feed item reference.",
  },
  {
    href: "/monsters-pets",
    title: "Monsters & Pets",
    description: "Full monster and pet database with spawn locations, detailed stats, growth data, levels, and pet planning.",
  },
];

export default function EggsPetsMonstersPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <PageHeader artworkKey="/eggs-pets-monsters" title="Eggs, Pets & Monsters">
        <div className="max-w-3xl space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            Plan Kingdom Adventurers eggs, pets, and monsters with tools that go beyond simple spawn lists.
            This section connects egg outcomes, feed items, monster locations, pet stats, growth data, and level-based details.
          </p>
          <p>
            Use the egg planner when you want a specific pet, or open the monster and pet database when you need detailed
            information for collecting, comparing, and building stronger teams.
          </p>
        </div>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-2">
        {CARDS.map((card) => <ToolNavigationCard key={card.href} href={card.href} title={card.title} description={card.description} />)}
      </div>
    </div>
  );
}

