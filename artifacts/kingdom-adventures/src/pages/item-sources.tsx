import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ChevronDown, MapPin, PackageSearch, Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ka/page-header";
import { CharacterPreviewCanvas } from "@/components/character-preview-canvas";
import { getEquipmentIcon, getFacilityIconByName, getFurnitureIcon, getItemIcon, getSurveyIconByName, getValuableIcon } from "@/lib/equipment-icons";
import { getMonsterSprite } from "@/lib/monster-sprites";
import { getSkillIcon } from "@/lib/skill-icons";
import { findCatalogEntries, isBriefingReward, jobsWithSkill } from "@/lib/item-source-catalog";
import { TREASURE_MONSTERS, treasureDisplayName } from "@/lib/treasure-lookup";
import {
  GRADE_ORDER,
  activeLanes,
  buildItemDirectRows,
  buildItemSourceRows,
  dailyRankLabel,
  formatPercent,
  formatQuantity,
  gradeTone,
  groupProfileSources,
  normalizeRewardName,
  rewardKey,
  safeRewardLabel,
  searchProfiles,
  sourceFamilyAndDetail,
  sourceNode,
  unresolvedProfilesForReward,
  type DisplaySourceGroup,
  type ItemSourceRow,
  type Profile,
  type RewardType,
} from "@/lib/treasure-source-graph";

/* ------------------------------------------------------------------ small pieces */

const SOURCE_FAMILY_IMAGES: Record<string, string> = {
  "Legendary Cave": "/website_icons/facilities_confirmed/facility_196_legendary_cave.png",
  "Normal Cave": "/website_icons/facilities_confirmed/mapchip_071_cave.png",
  "Kairo Room": "/website_icons/facilities_confirmed/facility_180_kairo_room.png",
  "Wairo Dungeon": "/website_icons/facilities_confirmed/mapchip_223_wairo_dungeon.png",
  Arena: "/website_icons/facilities_confirmed/facility_181_underground_arena.png",
  "Daily Rank Bonus": "/website_icons/facilities_confirmed/facility_172_ranking_board.png",
  Survey: "/website_icons/requested/survey_button_00.png",
  Gathering: "/icons/treasure-sources/gathering-spade.webp",
};
const SOURCE_PREVIEW_ORDER = [...Object.keys(SOURCE_FAMILY_IMAGES), "Area reward"];
const MAX_PREVIEW_SOURCES = 4;
const MONSTERS_BY_ID = new Map(TREASURE_MONSTERS.map((monster) => [monster.id, monster]));

function monsterFromSource(sourceId: string) {
  const key = sourceNode(sourceId)?.key;
  return key?.startsWith("monster:") ? MONSTERS_BY_ID.get(Number(key.slice("monster:".length))) : undefined;
}

/** Job rewards are rank jobs ("F Rank Scholar") → the rank token and the job name. */
const jobRankToken = (name: string) => /^\s*([FEDCBAS])\s/.exec(name)?.[1];
const jobNameToken = (name: string) => /^\s*[FEDCBAS]\s+(?:Rank|Grade)\s+(.+)$/.exec(name)?.[1];

function RewardIcon({ type, name, className = "h-8 w-8" }: { type: RewardType; name: string; className?: string }) {
  // Job rewards use the same character renderer as the Wairo Dungeon loot table, so the two pages
  // cannot drift: the rank stays in the text, the sprite is the job's character.
  if (type === "job") {
    const rank = jobRankToken(name);
    const job = jobNameToken(name);
    if (job) {
      const height = className.match(/h-\d+(?:\.\d+)?/)?.[0] ?? "h-8";
      return (
        <CharacterPreviewCanvas
          jobName={job}
          rank={rank}
          variant={1}
          equipState="right"
          scale={2}
          poseFrame={0}
          label={name}
          className={`${height} w-auto shrink-0`}
        />
      );
    }
  }
  const src =
    type === "skill" ? getSkillIcon(name)
      : type === "item" ? getItemIcon(name) ?? getFacilityIconByName(name)
        : type === "equipment" ? getEquipmentIcon(undefined, name)
          : type === "furniture" ? getFurnitureIcon(name) ?? getFacilityIconByName(name)
            : type === "valuable" ? getValuableIcon(name) ?? getItemIcon(name)
            : undefined;
  if (!src) return <PackageSearch className={`${className} shrink-0 text-muted-foreground`} />;
  return <img src={src} alt={treasureDisplayName(name)} className={`${className} shrink-0 object-contain [image-rendering:pixelated]`} />;
}

function SourceGlyph({ sourceId, family, preview = false }: { sourceId?: string; family?: string; preview?: boolean }) {
  const node = sourceId ? sourceNode(sourceId) : undefined;
  const sourceFamily = family ?? (sourceId ? sourceFamilyAndDetail(sourceId).family : "");
  const monster = sourceId ? monsterFromSource(sourceId) : undefined;
  const image = (node?.kind === "survey" ? getSurveyIconByName(node.label) : undefined)
    ?? getMonsterSprite(monster?.name)?.src
    ?? SOURCE_FAMILY_IMAGES[sourceFamily];
  const size = preview ? "h-10 w-10" : "h-8 w-8";
  if (!image) {
    if (sourceFamily === "Monster drop") return null;
    const Symbol = sourceFamily === "Area reward" ? MapPin : PackageSearch;
    return (
      <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center`}>
        <Symbol className={`${preview ? "h-6 w-6" : "h-4 w-4"} text-muted-foreground`} />
      </span>
    );
  }
  return (
    <img
      src={image}
      alt=""
      loading="lazy"
      className={`${size} shrink-0 object-contain`}
    />
  );
}

/** Non-treasure routes get a mechanism icon instead of a chest sprite. */
/**
 * Source cell artwork. For a direct route the subject is the facility or shop itself, and the
 * site already ships those sprites; otherwise the cave / rank / monster family image is used.
 */
function SourceCellGlyph({ row }: { row: ItemSourceRow }) {
  const direct = row.mechanism === "craft-group-facility" ? getFurnitureIcon(row.family)
    : row.mechanism === "material-shop" ? getFacilityIconByName(row.family)
      : row.mechanism === "item-flag-shop" ? getFacilityIconByName("Item Shop")
        : undefined;
  if (direct) return <img src={direct} alt="" className="h-8 w-8 shrink-0 object-contain [image-rendering:pixelated]" />;
  return <SourceGlyph sourceId={row.sourceId} />;
}

const rowMatchesLevel = (row: ItemSourceRow, level: number | null) => {
  if (level === null || row.direct) return true;
  return row.edges.some((edge) => {
    const conditions = { ...(sourceNode(edge.source)?.conditions ?? {}), ...(edge.conditions ?? {}) };
    const min = Number(conditions.minLevel ?? conditions.treasureMinLevel);
    const max = Number(conditions.maxLevel ?? conditions.treasureMaxLevel);
    return !(Number.isFinite(min) && level < min) && !(Number.isFinite(max) && level > max);
  });
};

/** One plain sentence per non-treasure route; no implementation detail reaches the page. */
const DIRECT_COPY: Record<string, string> = {
  "material-shop": "Bought directly from the shop.",
  "craft-group-facility": "Crafted at this facility.",
  "craft-group-orchard": "Produced by the orchard.",
  "skill-crafting": "Crafted at the skill shop.",
  "gacha-pool": "Drawn from this gacha pool; the in-game odds list shows the rate.",
  "equipment-exchange": "Traded at the equipment exchange.",
  "item-flag-shop": "Sold in the item shop.",
  "item-flag-restaurant": "Sold at the restaurant.",
};

function RowDetails({ row }: { row: ItemSourceRow }) {
  const price = /^Price (.+)$/.exec(row.requirement)?.[1];
  const limit = Number(row.conditions?.purchaseLimit);
  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      {!row.direct && <ul className="space-y-0.5">
        <li>Chance to get this treasure: <span className="tabular-nums text-foreground">{row.treasureRate.text}</span>{row.treasureRate.detail && ` · ${row.treasureRate.detail}`}</li>
        <li>Chance for the item after opening: <span className="tabular-nums text-foreground">{row.itemRate.text}</span></li>
        <li>Overall item chance: <span className="tabular-nums text-foreground">{row.overall.text}{row.overall.detail && ` ${row.overall.detail}`}</span></li>
      </ul>}
      {row.note && <p>{row.note}.</p>}
      {row.direct && (
        <>
          {DIRECT_COPY[row.mechanism] && <p>{DIRECT_COPY[row.mechanism]}</p>}
          {price && <p>Recorded price range: {price}.</p>}
          {Number.isFinite(limit) && <p>Purchase limit: {limit}.</p>}
        </>
      )}
    </div>
  );
}

function ItemSourceList({ rows }: { rows: ItemSourceRow[] }) {
  return (
    <section className="space-y-2" data-testid="item-source-table">
      <h3 className="text-base font-semibold">Sources <span className="font-normal text-muted-foreground">{rows.length}</span></h3>
      {rows.map((row) => (
        <details key={row.key} className="rounded-lg border bg-card" data-testid="source-row" data-source={row.family}>
          <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-3 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 gap-3">
              <SourceCellGlyph row={row} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{row.family}</span>
                {row.requirement && <span className="block text-xs text-muted-foreground">{row.requirement}</span>}
                {!row.direct && (
                  <span className="mt-1.5 flex items-center gap-1.5 text-xs">
                    <img src={row.treasureIcon} alt="" className="h-5 w-5 shrink-0 object-contain [image-rendering:pixelated]" />
                    {treasureDisplayName(row.treasureName)}
                  </span>
                )}
                {row.treasureNote && <span className="block text-xs text-muted-foreground">{row.treasureNote}</span>}
              </span>
            </span>
            <span className="flex max-w-36 items-start gap-2 text-right text-xs text-muted-foreground">
              <span>
                <span className="block text-sm font-semibold tabular-nums text-foreground">{row.overall.text === "—" ? "Direct source" : row.overall.text}</span>
                {!row.direct && <span className="block">{row.overall.established ? row.overall.detail : "overall item chance"}</span>}
                {row.quantity !== "—" && <span className="block">Qty {row.quantity}</span>}
              </span>
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            </span>
          </summary>
          <div className="border-t px-4 py-3"><RowDetails row={row} /></div>
        </details>
      ))}
      {rows.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No sources match these filters.</p>}
    </section>
  );
}

/* ------------------------------------------------------------ treasure mode */

function SourceGroupRow({ group }: { group: DisplaySourceGroup }) {
  const probability = group.probability;
  const chance = probability && "decimal" in probability ? formatPercent(probability.decimal) : undefined;
  const varies = group.probabilityVaries || Boolean(probability && "formula" in probability);
  const rank = dailyRankLabel(group.routes[0]?.conditions?.sourceRowId);
  const conditions = [rank ? `${rank.day} · Rank ${rank.rankLabel}` : "", ...group.sublabel].filter(Boolean);
  return (
    <li className="rounded-md border">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <SourceGlyph sourceId={group.sourceId} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{group.label}</p>
          {conditions.length > 0 && <p className="text-xs text-muted-foreground">{conditions.join(" · ")}</p>}
        </div>
        <span className="max-w-28 shrink-0 text-right text-xs text-muted-foreground">
          {chance ? <><strong className="block text-sm tabular-nums text-foreground">{chance}</strong>treasure chance</> : varies ? "Chance varies" : "Chance unknown"}
        </span>
      </div>
    </li>
  );
}

function TreasureDetails({ profile }: { profile: Profile }) {
  const groups = groupProfileSources(profile);
  const lanes = activeLanes(profile);
  return (
    <div className="space-y-4 border-t p-3 sm:p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Where to get it</h3>
          {groups.length > 0 ? (
            <ul className="space-y-1.5">{groups.map((group) => <SourceGroupRow key={group.key} group={group} />)}</ul>
          ) : <p className="text-sm text-muted-foreground">No acquisition source documented.</p>}
        </section>
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Contents</h3>
            <span className="text-xs text-muted-foreground">Chance after opening</span>
          </div>
          <ul className="space-y-1">
            {lanes.map((entry) => (
              <li key={entry.lane} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2 py-1.5">
                <span className="flex min-w-0 items-center gap-2">
                  <RewardIcon type={entry.type} name={entry.name} className="h-7 w-7" />
                  <span className="min-w-0">
                    <span className="block text-sm">{safeRewardLabel(entry.type, treasureDisplayName(entry.name), entry.id)}</span>
                    <span className="block text-xs text-muted-foreground">Qty {formatQuantity(entry.min, entry.max)}</span>
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">{formatPercent(entry.rate / 100, 3)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function TreasureResult({ profile, query, open, onToggle }: { profile: Profile; query: string; open: boolean; onToggle: () => void }) {
  const contents = [...new Set(activeLanes(profile).map((lane) => treasureDisplayName(lane.name)).filter(Boolean))];
  const search = normalizeRewardName(query);
  const matchingContent = search ? contents.find((name) => normalizeRewardName(name).includes(search)) : undefined;
  const preview = matchingContent ? [matchingContent, ...contents.filter((name) => name !== matchingContent)] : contents;
  const firstRank = profile.routes.length === 1 ? dailyRankLabel(profile.routes[0].conditions?.sourceRowId) : undefined;
  const sourceFamilies = new Set(profile.routes.map((route) => sourceFamilyAndDetail(route.source).family));
  const sources: { family: string; label: string; sourceId?: string }[] = SOURCE_PREVIEW_ORDER
    .filter((family) => sourceFamilies.has(family))
    .map((family) => ({ family, label: family }));
  const monsterIds = new Set<number>();
  for (const { source } of profile.routes) {
    const monster = monsterFromSource(source);
    if (!monster || monsterIds.has(monster.id) || !getMonsterSprite(monster.name)) continue;
    monsterIds.add(monster.id);
    sources.push({ family: "Monster drop", label: `Monster drop · ${monster.name}`, sourceId: source });
  }
  const shownSources = sources.slice(0, MAX_PREVIEW_SOURCES);
  const extraSources = sources.slice(MAX_PREVIEW_SOURCES);
  const detailId = `treasure-details-${profile.id}`;
  return (
    <article className="rounded-lg border bg-card" data-testid="treasure-profile" data-profile-id={profile.id}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={open ? detailId : undefined}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted/40 focus-visible:outline-ring">
        <img src={profile.icon} alt="" loading="lazy" className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]" />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:items-center md:justify-between md:gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{treasureDisplayName(profile.name)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {firstRank && `Rank ${firstRank.rankLabel} · `}
              {preview.slice(0, 3).join(", ")}{preview.length > 3 && ` +${preview.length - 3} more`}
            </span>
          </span>
          {shownSources.length > 0 && (
            <span className="flex shrink-0 flex-wrap items-center gap-1.5" data-testid="treasure-source-preview">
              {shownSources.map(({ family, label, sourceId }) => (
                <span key={sourceId ?? family} title={label} className="inline-flex items-center">
                  <SourceGlyph family={family} sourceId={sourceId} preview />
                  <span className="sr-only">{label}</span>
                </span>
              ))}
              {extraSources.length > 0 && (
                <span title={extraSources.map(({ label }) => label).join(", ")} className="inline-flex items-center px-1 text-xs text-muted-foreground">
                  +{extraSources.length}<span className="sr-only"> more sources</span>
                </span>
              )}
            </span>
          )}
          {!profile.edges.length && <span className="shrink-0 text-xs text-muted-foreground">Source unknown</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div id={detailId}><TreasureDetails profile={profile} /></div>}
    </article>
  );
}

/* ------------------------------------------------------------------------ page */

const TYPE_LABEL: Record<RewardType, string> = {
  item: "Item",
  skill: "Skill",
  equipment: "Equipment",
  furniture: "Furniture",
  valuable: "Valuable",
  job: "Job",
};

const CATALOG_PAGE_SIZE = 18;

export default function ItemSourcesPage() {
  const [mode, setMode] = useState<"item" | "treasure">("item");
  const [query, setQuery] = useState("");
  const [catalogType, setCatalogType] = useState<RewardType | "all">("all");
  const [catalogLimit, setCatalogLimit] = useState(CATALOG_PAGE_SIZE);
  const [selected, setSelected] = useState<{ type: RewardType; name: string } | null>(null);
  const [kindFilter, setKindFilter] = useState("All");
  const [areaLevel, setAreaLevel] = useState("");
  const [treasureQuery, setTreasureQuery] = useState("");
  const [expandedTreasure, setExpandedTreasure] = useState<string | null>(null);

  const level = areaLevel.trim() && Number.isInteger(Number(areaLevel)) && Number(areaLevel) > 0 ? Number(areaLevel) : null;
  const matches = useMemo(() => findCatalogEntries(query, catalogType), [query, catalogType]);
  const rows = useMemo(
    () => (selected
      ? [...buildItemSourceRows(selected.type, selected.name), ...buildItemDirectRows(selected.type, selected.name)]
        // Direct routes use the same evidence order, so a guaranteed shop row sits next to the
        // drop routes it competes with instead of being buried at the end.
        .sort((a, b) => GRADE_ORDER[gradeTone(a.grade)] - GRADE_ORDER[gradeTone(b.grade)]
          || a.family.localeCompare(b.family)
          || a.requirement.localeCompare(b.requirement))
      : []),
    [selected],
  );
  const unresolved = useMemo(
    () => (selected ? unresolvedProfilesForReward(selected.type, selected.name) : []),
    [selected],
  );
  const kindOptions = useMemo(() => ["All", ...[...new Set(rows.map((row) => row.kind))].sort()], [rows]);
  const filtered = useMemo(() => rows.filter((row) =>
    (kindFilter === "All" || row.kind === kindFilter) && rowMatchesLevel(row, level),
  ), [rows, kindFilter, level]);
  const learnedBy = selected?.type === "skill" ? jobsWithSkill(selected.name) : [];
  const briefing = selected?.type === "item" && isBriefingReward(selected.name);

  const treasures = useMemo(() => searchProfiles(treasureQuery), [treasureQuery]);

  const select = (type: RewardType, name: string) => {
    setSelected({ type, name });
    setQuery(name);
    setKindFilter("All");
    setMode("item");
  };
  const itemLabel = selected ? safeRewardLabel(selected.type, selected.name) : "";

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeader icon={<Search className="h-5 w-5" />} title="Item & Skill Sources">
        <p>
          Find where to get items and skills, including which skills come with each job and rank.
        </p>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={mode === "item" ? "default" : "outline"} aria-pressed={mode === "item"} onClick={() => setMode("item")}>Find sources</Button>
        <Button size="sm" variant={mode === "treasure" ? "default" : "outline"} aria-pressed={mode === "treasure"} onClick={() => setMode("treasure")}>Treasure lookup</Button>
        <Button size="sm" variant="ghost" asChild><Link href="/monsters">Monster loot</Link></Button>
      </div>

      {mode === "item" ? (
        <>
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
                <div className="space-y-1">
                  <label htmlFor="item-source-search" className="text-sm font-medium">Search the catalog</label>
                  <Input
                    id="item-source-search"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSelected(null);
                      setCatalogLimit(CATALOG_PAGE_SIZE);
                    }}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="catalog-type" className="text-sm font-medium">Entry type</label>
                  <select
                    id="catalog-type"
                    value={catalogType}
                    onChange={(event) => {
                      setCatalogType(event.target.value as RewardType | "all");
                      setSelected(null);
                      setCatalogLimit(CATALOG_PAGE_SIZE);
                    }}
                    className="block h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="all">All types</option>
                    {Object.entries(TYPE_LABEL).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
                  </select>
                </div>
              </div>
              {selected && <Button variant="outline" size="sm" onClick={() => { setSelected(null); setQuery(""); }}>Browse catalog</Button>}
              {!selected && (
                <>
                  <p className="text-sm text-muted-foreground" role="status">
                    {matches.length ? `Showing ${Math.min(catalogLimit, matches.length)} of ${matches.length} entries` : "No entries match your search."}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {matches.slice(0, catalogLimit).map((target) => (
                      <button
                        key={`${target.type}|${target.name}`}
                        onClick={() => select(target.type, target.name)}
                        className="flex items-center gap-3 rounded-md border p-3 text-left hover:bg-muted"
                      >
                        <RewardIcon type={target.type} name={target.name} className="h-10 w-10" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{treasureDisplayName(target.name)}</span>
                          <span className="text-xs text-muted-foreground">
                            {TYPE_LABEL[target.type]}
                            {target.type === "skill" && jobsWithSkill(target.name).length > 0 && " · Job skill"}
                            {target.profileCount > 0 && ` · ${target.profileCount} treasure${target.profileCount === 1 ? "" : "s"}`}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {matches.length > catalogLimit && (
                    <Button variant="outline" onClick={() => setCatalogLimit((limit) => limit + CATALOG_PAGE_SIZE)}>Show more entries</Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {selected && (
            <>
              <div className="flex flex-wrap items-center gap-4" data-testid="item-header">
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border bg-card">
                  <RewardIcon type={selected.type} name={selected.name} className="h-14 w-14" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold tracking-tight">{itemLabel}</h2>
                  <Badge variant="secondary" className="mt-2">{TYPE_LABEL[selected.type]}</Badge>
                </div>
              </div>

              {learnedBy.length > 0 && (
                <Card>
                  <CardHeader className="pb-3"><h3 className="text-base font-semibold">Comes with</h3></CardHeader>
                  <CardContent>
                    <ul className="grid gap-2 text-sm sm:grid-cols-2">
                      {learnedBy.map(([job, ranks]) => (
                        <li key={job}>
                          <Link href={`/jobs/${encodeURIComponent(job)}`} className="font-medium text-primary hover:underline">{job}</Link>{" "}
                          <span className="ml-2 text-muted-foreground">{ranks.length === 1 ? "Rank" : "Ranks"} {ranks.join(", ")}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {briefing && (
                <Card>
                  <CardContent className="pt-6 text-sm">
                    <Link href="/briefing-room" className="font-medium text-primary hover:underline">Briefing Room</Link>
                    <p className="mt-1 text-muted-foreground">Awarded by missions that list {itemLabel} as their reward.</p>
                  </CardContent>
                </Card>
              )}

              {rows.length > 0 && <>
                <div className="flex flex-wrap items-end gap-4 rounded-lg border p-3">
                  <div>
                    <label htmlFor="source-kind" className="text-xs font-medium text-muted-foreground">Source type</label>
                    <select
                      id="source-kind"
                      value={kindFilter}
                      onChange={(event) => setKindFilter(event.target.value)}
                      className="mt-1 block h-9 rounded-md border bg-background px-2 text-sm"
                    >
                      {kindOptions.map((kind) => <option key={kind}>{kind}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="source-level" className="text-xs font-medium text-muted-foreground">Area level (optional)</label>
                    <Input
                      id="source-level"
                      type="number"
                      min="1"
                      step="1"
                      value={areaLevel}
                      onChange={(event) => setAreaLevel(event.target.value)}
                      placeholder="Any level"
                      className="mt-1 h-9 w-36"
                    />
                  </div>
                </div>

                <ItemSourceList key={rewardKey(selected.type, selected.name)} rows={filtered} />
              </>}

              {unresolved.length > 0 && (
                <section className="space-y-2 rounded-lg border bg-card p-3">
                  <h3 className="text-sm font-semibold">Treasures with unknown sources</h3>
                  <ul className="space-y-1">
                    {unresolved.map(({ profile, lanes }) => (
                      <li key={profile.id} className="flex items-center gap-2 text-sm">
                        <img src={profile.icon} alt="" className="h-5 w-5 object-contain [image-rendering:pixelated]" />
                        <span>{treasureDisplayName(profile.name)}</span>
                        <span className="text-xs text-muted-foreground">
                          {lanes.map((lane) => formatPercent(lane.rate / 100, 3)).join(", ")} inside
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {!rows.length && !unresolved.length && !learnedBy.length && !briefing && (
                <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                  This {TYPE_LABEL[selected.type].toLowerCase()} is in the game catalog. Its acquisition source is undocumented here.
                  {selected.type === "skill" && <> <Link href="/skills" className="font-medium text-primary hover:underline">See the Skills catalog</Link>.</>}
                </p>
              )}

            </>
          )}
        </>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-3 pt-6">
              <label htmlFor="treasure-search" className="text-sm font-medium">Treasure name, contained item, or source</label>
              <Input
                id="treasure-search"
                value={treasureQuery}
                onChange={(event) => { setTreasureQuery(event.target.value); setExpandedTreasure(null); }}
                autoComplete="off"
              />
              <p className="text-sm text-muted-foreground" role="status">
                {treasures.length === 0
                  ? "No treasures match your search."
                  : `${treasures.length} ${treasures.length === 1 ? "treasure" : "treasures"}`}
              </p>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {treasures.map((profile) => (
              <TreasureResult
                key={profile.id}
                profile={profile}
                query={treasureQuery}
                open={expandedTreasure === profile.id}
                onToggle={() => setExpandedTreasure((current) => current === profile.id ? null : profile.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
