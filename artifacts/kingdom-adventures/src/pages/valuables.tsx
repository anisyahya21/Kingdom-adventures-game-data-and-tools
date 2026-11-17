import { useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ka/page-header";
import {
  TREASURE_ROOM_LEVEL, VALUABLE_ARENA_UNLOCK_LEVEL, VALUABLE_GROUPS, VALUABLE_NORMAL_SOURCE_COUNT, VALUABLE_TOTAL, type ValuableVariant,
} from "@/game-data/valuable-catalog";
import { getItemIcon } from "@/lib/equipment-icons";

const sourceOptions = [
  ["all", "All sources"],
  ["shop", "Treasure Room"],
  ["chests", "Area chests"],
  ["arena", "Underground Arena"],
] as const;
type SourceFilter = typeof sourceOptions[number][0];

function matchesSource(variant: ValuableVariant, source: SourceFilter) {
  if (source === "shop") return !!variant.shop;
  if (source === "chests") return variant.chests.length > 0;
  if (source === "arena") return !!variant.arena;
  return true;
}

function VariantRow({ variant }: { variant: ValuableVariant }) {
  return (
    <li className="grid gap-3 border-t border-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div>
        <h3 className="text-sm font-semibold">{variant.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{variant.effect}</p>
      </div>
      <ul className="space-y-2 text-sm">
        {variant.shop && <li>
          <p className="font-medium">Treasure Room {variant.shop.once && <span className="text-xs text-muted-foreground">· One-time purchase</span>}</p>
          {variant.shop.aboveRankCap && <p className="text-xs font-medium text-muted-foreground">Unavailable through normal play. Town Hall rank caps at 99.</p>}
          {variant.shop.requirements.length > 0 && <p className="text-xs text-muted-foreground">{variant.shop.requirements.join(" · ")}</p>}
          <ul aria-label="Trophy and crown cost" className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {variant.shop.costs.map(({ name, quantity }, index) => {
              const icon = getItemIcon(name);
              return <li key={index} className="flex items-center gap-1">
                {icon && <img src={icon} alt="" className="size-4 object-contain [image-rendering:pixelated]" />}
                {name ? `${quantity} × ${name}` : "Additional payment requirement"}
              </li>;
            })}
          </ul>
        </li>}
        {variant.chests.map((source, index) => <li key={index}>
          <Link href={`/map-rewards?level=${source.level}`} className="font-medium text-primary hover:underline">
            Area chest · Level {source.level} · {source.terrain}
          </Link>
          <span className="block text-xs text-muted-foreground">
            {source.min === source.max ? `${source.min} ${source.min === 1 ? "copy" : "copies"}` : `${source.min}–${source.max} copies`}
            {source.rate < 100 && ` · ${source.rate}% chance from the chest`}
          </span>
        </li>)}
        {variant.arena && <li>
          <p className="font-medium">Underground Arena · Level {variant.arena.level}</p>
          <p className="text-xs text-muted-foreground">Milestone reward · ×{variant.arena.quantity}</p>
        </li>}
      </ul>
    </li>
  );
}

export default function ValuablesPage() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string>("book-of-awakening");
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = VALUABLE_GROUPS.map(group => ({
    ...group,
    matching: group.variants.filter(variant => matchesSource(variant, source)
      && terms.every(term => `${variant.name} ${variant.effect}`.toLowerCase().includes(term))),
  })).filter(group => group.matching.length > 0);
  const selected = groups.find(group => group.key === selectedKey) ?? groups[0];

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <PageHeader title="Valuables">
        <p>Find the permanent upgrades listed under Treasure in the game.</p>
      </PageHeader>
      <section aria-label="Treasure sources" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-card p-3 text-sm">
        <strong>{VALUABLE_TOTAL} numbered entries · {VALUABLE_NORMAL_SOURCE_COUNT} with a normal source · {VALUABLE_GROUPS.length} types</strong>
        <span className="text-muted-foreground">
          Unlock the Treasure Room at <Link href={`/map-rewards?level=${TREASURE_ROOM_LEVEL}`} className="text-primary hover:underline">area level {TREASURE_ROOM_LEVEL}</Link>
          {" and the Underground Arena at "}
          <Link href={`/map-rewards?level=${VALUABLE_ARENA_UNLOCK_LEVEL}`} className="text-primary hover:underline">area level {VALUABLE_ARENA_UNLOCK_LEVEL}</Link>.
        </span>
      </section>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <label htmlFor="valuable-search" className="mb-1 block text-sm font-medium">Search Valuables</label>
          <Input id="valuable-search" type="search" value={query} onChange={event => setQuery(event.target.value)} />
        </div>
        <div className="space-y-1 text-sm">
          <label htmlFor="valuable-source" className="block font-medium">Source</label>
          <select id="valuable-source" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={source}
            onChange={event => setSource(event.target.value as SourceFilter)}>
            {sourceOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </div>
      {selected ? <div className="grid min-w-0 items-start gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="space-y-1 text-sm md:hidden">
          <label htmlFor="valuable-type" className="block font-medium">Valuable type</label>
          <select id="valuable-type" className="h-10 w-full rounded-md border border-input bg-background px-3" value={selected.key}
            onChange={event => setSelectedKey(event.target.value)}>
            {groups.map(group => <option key={group.key} value={group.key}>{group.name} ({group.matching.length})</option>)}
          </select>
        </div>
        <div className="hidden space-y-1 md:block" role="group" aria-label="Valuable types">
          {groups.map(group => <button key={group.key} type="button" aria-pressed={group.key === selected.key} onClick={() => setSelectedKey(group.key)}
            className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted aria-pressed:border-border aria-pressed:bg-card">
            <img src={group.iconSrc} alt="" className="size-6 shrink-0 object-contain [image-rendering:pixelated]" />
            <span className="flex-1">{group.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{group.matching.length}</span>
          </button>)}
        </div>
        <section aria-labelledby="selected-valuable" className="min-w-0 rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <img src={selected.iconSrc} alt="" className="size-9 object-contain [image-rendering:pixelated]" />
            <h2 id="selected-valuable" className="text-lg font-semibold">{selected.name}</h2>
            <Badge variant="secondary">{selected.matching.length === selected.variants.length ? selected.variants.length : `${selected.matching.length} of ${selected.variants.length}`} entries</Badge>
          </div>
          <ol>{selected.matching.map(variant => <VariantRow key={variant.id} variant={variant} />)}</ol>
        </section>
      </div> : <p role="status" className="text-sm text-muted-foreground">No Valuables match your search and source filter.</p>}
    </div>
  );
}
