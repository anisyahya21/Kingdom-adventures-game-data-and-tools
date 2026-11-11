import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  ArrowUpDown,
  BadgeInfo,
  Egg,
  Plus,
  Search,
  Target,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ThemedNumberInput } from "@/components/ui/themed-number-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchableSelect } from "@/components/searchable-select";
import { getMonsterSpriteById } from "@/lib/monster-sprites";
import { getSkillIcon } from "@/lib/skill-icons";
import { getItemIcon, getEggIconByColor } from "@/lib/equipment-icons";
import { ReferencePage, ReferenceTable, referenceSelectClass } from "@/components/ka/reference-table";
import { Link, useSearch } from "wouter";
import {
  EggBand,
  EggFeedItem,
  EggStat,
  fetchEggReferenceData,
  getReachedBand,
} from "@/lib/eggs-data";

const STATS: EggStat[] = ["Attack", "Defense", "Balanced", "Special"];
const BAND_STYLE: Record<EggBand, string> = {
  None: "bg-muted text-muted-foreground border-border",
  Low: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-300",
  Medium: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-300",
  High: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-300",
  Over: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-300",
};
type FeedSortKey = EggStat | "EXP" | "Copper";
type FeedState = Record<string, number>;
type FeedInputState = Record<string, string>;

function parseLevel(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatSignedSeconds(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "-";
  return `${seconds > 0 ? "+" : ""}${seconds}s`;
}

function minEggLevelForThreshold(threshold: number | null, bestPerItem: number): number | null {
  if (threshold === null || bestPerItem <= 0) return null;
  return Math.ceil(threshold / (bestPerItem * 10));
}

function itemsNeededForThreshold(threshold: number | null, perItemValue: number): number | null {
  if (threshold === null || perItemValue <= 0) return null;
  return Math.ceil(threshold / perItemValue);
}

function sortFeedItemsForStat(items: EggFeedItem[], stat: EggStat): EggFeedItem[] {
  return [...items].sort((a, b) => {
    const byStat = b.stats[stat] - a.stats[stat];
    if (byStat !== 0) return byStat;
    const byExp = b.exp - a.exp;
    if (byExp !== 0) return byExp;
    return a.name.localeCompare(b.name);
  });
}

function getFeedRows(feedState: FeedState, allItems: EggFeedItem[]) {
  return Object.entries(feedState)
    .filter(([, quantity]) => quantity >= 0)
    .map(([name, quantity]) => {
      const item = allItems.find((entry) => entry.name === name);
      return item ? { item, quantity } : null;
    })
    .filter((entry): entry is { item: EggFeedItem; quantity: number } => Boolean(entry))
    .sort((a, b) => a.item.name.localeCompare(b.item.name));
}

function getFeedTotals(rows: Array<{ item: EggFeedItem; quantity: number }>) {
  return rows.reduce(
    (acc, row) => {
      acc.itemCount += row.quantity;
      acc.exp += row.item.exp * row.quantity;
      acc.copper += (row.item.copperCoins ?? 0) * row.quantity;
      acc.hatchTimeSeconds += (row.item.hatchTimeSeconds ?? 0) * row.quantity;
      for (const stat of STATS) {
        acc.stats[stat] += row.item.stats[stat] * row.quantity;
      }
      return acc;
    },
    {
      itemCount: 0,
      exp: 0,
      copper: 0,
      hatchTimeSeconds: 0,
      stats: {
        Attack: 0,
        Defense: 0,
        Balanced: 0,
        Special: 0,
      } as Record<EggStat, number>,
    }
  );
}

function BandPill({ band }: { band: EggBand }) {
  return <Badge variant="outline" className={BAND_STYLE[band]}>{band}</Badge>;
}

const BAND_FILL_COLOR: Record<Exclude<EggBand, "None">, string> = {
  Low: "bg-rose-500/60",
  Medium: "bg-amber-500/60",
  High: "bg-emerald-500/60",
  Over: "bg-rose-500/60",
};

const BAND_ORDER: Exclude<EggBand, "None">[] = ["Low", "Medium", "High", "Over"];

function getBandFillPct(
  band: Exclude<EggBand, "None">,
  currentTotal: number,
  thresholds: Record<Exclude<EggBand, "None">, number | null>
): number {
  const min = thresholds[band];
  if (min === null) return 0;
  const bandIndex = BAND_ORDER.indexOf(band);
  const nextBand = BAND_ORDER[bandIndex + 1] as Exclude<EggBand, "None"> | undefined;
  const max = nextBand ? thresholds[nextBand] : null;
  if (max === null || max === undefined) return currentTotal >= min ? 1 : 0;
  if (currentTotal < min) return 0;
  if (currentTotal >= max) return 1;
  return (currentTotal - min) / (max - min);
}

function BandProgress({
  currentBand,
  thresholds,
  currentTotal,
}: {
  currentBand: EggBand;
  thresholds: Record<Exclude<EggBand, "None">, number | null>;
  currentTotal: number;
}) {
  const currentIndex = currentBand === "None" ? -1 : BAND_ORDER.indexOf(currentBand);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {BAND_ORDER.map((band, idx) => {
        const isActive = band === currentBand;
        const isPast = idx < currentIndex;
        const fillPct = isActive
          ? getBandFillPct(band, currentTotal, thresholds)
          : isPast
          ? 1
          : 0;

        return (
          <div
            key={band}
            className={`rounded-lg border px-3 py-2 relative overflow-hidden ${
              isActive
                ? BAND_STYLE[band]
                : isPast
                ? "border-border/40 bg-muted/10 text-muted-foreground"
                : "border-border/30 bg-muted/10 text-muted-foreground/50"
            }`}
          >
            {/* fill bar */}
            <div
              className={`absolute inset-0 transition-all duration-200 ${
                isActive || isPast ? BAND_FILL_COLOR[band] : ""
              }`}
              style={{ width: `${Math.round(fillPct * 100)}%`, opacity: 0.25 }}
            />
            <div className="relative z-10">
              <div className="text-[11px] uppercase tracking-wide">{band}</div>
              <div className="text-sm font-semibold">{thresholds[band] ?? "-"}</div>
              {isActive && (
                <div className="text-[11px] mt-0.5">{Math.round(fillPct * 100)}%</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


function EggReference({ foodView }: { foodView: boolean }) {
  const [query, setQuery] = useState("");
  const [color, setColor] = useState("");
  const [stat, setStat] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["egg-reference-data"],
    queryFn: fetchEggReferenceData,
  });

  const term = query.trim().toLowerCase();
  const pets = data?.monsters.filter((pet) =>
    pet.eggColor && (!color || pet.eggColor === color) && (!stat || pet.requiredStat === stat)
      && pet.monsterName.toLowerCase().includes(term),
  ) ?? [];
  const foods = data?.feedItems.filter((food) =>
    food.name.toLowerCase().includes(term) && (!stat || food.stats[stat as EggStat] > 0),
  ) ?? [];

  return (
    <ReferencePage title={foodView ? "Egg foods" : "Eggs & Pets"} actions={[
      foodView ? { href: "/eggs", label: "Pet thresholds", icon: "/website_icons/eggs/egg_7.png", description: "Find the egg colour and stat points for each pet." } : { href: "/eggs?view=foods", label: "Food bonuses", icon: getItemIcon("Bread"), description: "Look up how many points each food adds." },
      { href: "/eggs?view=planner", label: "Feeding Planner", icon: "/website_icons/eggs/egg_7.png", description: "Choose a pet or an egg and calculate what to feed it." },
    ]}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input type="search" className="h-9 w-full sm:w-60" aria-label={foodView ? "Search foods" : "Search pets"}
          placeholder={foodView ? "Search foods" : "Search pets"} value={query} onChange={(event) => setQuery(event.target.value)} />
        {!foodView && (
          <select className={referenceSelectClass} aria-label="Egg colour" value={color} onChange={(event) => setColor(event.target.value)}>
            <option value="">All egg colours</option>
            {data?.eggColors.map((name) => <option key={name}>{name}</option>)}
          </select>
        )}
        <select className={referenceSelectClass} aria-label="Required stat" value={stat} onChange={(event) => setStat(event.target.value)}>
          <option value="">All stats</option>
          {STATS.map((name) => <option key={name}>{name}</option>)}
        </select>
      </div>
      {isLoading ? <p role="status">Loading egg data…</p> : error || !data ? (
        <p role="alert">Could not load the egg reference data.</p>
      ) : foodView ? (
        <ReferenceTable label="Stat points per food item">
          <thead><tr><th scope="col">Food</th>{STATS.map((name) => <th key={name} scope="col">{name} points</th>)}</tr></thead>
          <tbody>
            {foods.map((food) => (
              <tr key={food.name}>
                <th scope="row"><EggTableIcon src={getItemIcon(food.name)} label={food.name} /></th>
                {STATS.map((name) => <td key={name} className="tabular-nums">{food.stats[name] ? `+${food.stats[name]}` : "0"}</td>)}
              </tr>
            ))}
            {!foods.length && <tr><td colSpan={5}>No foods match.</td></tr>}
          </tbody>
        </ReferenceTable>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">These are total stat points. To stay in High, reach the High number and stop before the Over number. Select a pet to plan what to feed it.</p>
          <ReferenceTable label="Pet hatching thresholds">
            <thead><tr>
              <th scope="col">Pet</th><th scope="col">Egg colour</th><th scope="col">Required stat</th>
              {BAND_ORDER.map((band) => <th key={band} scope="col">{band}</th>)}
              <th scope="col">Starting skill</th><th scope="col">Second skill item</th>
            </tr></thead>
            <tbody>
              {pets.map((pet) => {
                const icon = getEggIconByColor(pet.eggColor);
                return (
                  <tr key={pet.monsterName}>
                    <th scope="row">
                      <Link className="text-primary underline-offset-4 hover:underline"
                        title="Open feeding planner"
                        href={`/eggs?view=planner&pet=${encodeURIComponent(pet.monsterName)}`}><EggTableIcon src={getMonsterSpriteById(pet.monsterId)} label={pet.monsterName} /></Link>
                    </th>
                    <td><span className="flex items-center gap-1.5">{icon && <img src={icon} alt="" className="size-5 object-contain" loading="lazy" />}{pet.eggColor}</span></td>
                    <td>{pet.requiredStat}</td>
                    {BAND_ORDER.map((band) => <td key={band} className="tabular-nums">{pet.thresholds[band] ?? "—"}</td>)}
                    <td className="min-w-32 whitespace-normal"><EggTableIcon src={getSkillIcon(pet.startingSkill)} label={pet.startingSkill} /></td><td><EggTableIcon src={getItemIcon(pet.secondSkillItem)} label={pet.secondSkillItem} /></td>
                  </tr>
                );
              })}
              {!pets.length && <tr><td colSpan={9}>No pets match.</td></tr>}
            </tbody>
          </ReferenceTable>
        </>
      )}
    </ReferencePage>
  );
}

function EggTableIcon({ src, label }: { src?: string | null; label: string }) {
  return <span className="inline-flex items-center gap-2">
    {src && <img src={src} alt="" loading="lazy" className="size-6 shrink-0 object-contain [image-rendering:pixelated]" />}
    {label}
  </span>;
}

export default function EggsPage() {
  const params = new URLSearchParams(useSearch());
  const view = params.get("view");
  return view === "planner"
    ? <EggPlanner key={params.get("pet")} initialPet={params.get("pet") ?? ""} />
    : <EggReference key={view} foodView={view === "foods"} />;
}

function EggPlanner({ initialPet }: { initialPet: string }) {
  const [mode, setMode] = useState<"target" | "existing">("target");
  const [selectedMonster, setSelectedMonster] = useState(initialPet);
  const [selectedEggColor, setSelectedEggColor] = useState("");
  const [eggLevel, setEggLevel] = useState("30");
  const [existingPlanStat, setExistingPlanStat] = useState<EggStat>("Defense");
  const [existingBestPerItem, setExistingBestPerItem] = useState("");
  const [showOnlyReachable, setShowOnlyReachable] = useState(true);
  const [targetFoodToAdd, setTargetFoodToAdd] = useState("");
  const [targetFeedState, setTargetFeedState] = useState<FeedState>({});
  const [targetFeedInputs, setTargetFeedInputs] = useState<FeedInputState>({});
  const [feedSortBy, setFeedSortBy] = useState<FeedSortKey>("Attack");
  const [feedRowsToShow, setFeedRowsToShow] = useState("25");

  const { data, isLoading, error } = useQuery({
    queryKey: ["egg-reference-data"],
    queryFn: fetchEggReferenceData,
  });

  useEffect(() => {
    if (!data) return;
    if (!selectedMonster && data.monsters.length > 0) {
      setSelectedMonster(data.monsters[0].monsterName);
    }
    if (!selectedEggColor && data.eggColors.length > 0) {
      setSelectedEggColor(data.eggColors[0]);
    }
  }, [data, selectedEggColor, selectedMonster]);

  const eggLevelNum = parseLevel(eggLevel);
  const eggItemCap = eggLevelNum * 10;

  const monsterOptions = useMemo(
    () => (data?.monsters ?? []).map((monster) => ({
      value: monster.monsterName,
      label: `${monster.monsterName} (${monster.eggColor})`,
      icon: getEggIconByColor(monster.eggColor),
    })),
    [data]
  );

  const selectedMonsterData = useMemo(
    () => data?.monsters.find((monster) => monster.monsterName === selectedMonster) ?? null,
    [data, selectedMonster]
  );

  const targetAllowedFoods = useMemo(() => {
    if (!selectedMonsterData || !data) return [];
    return sortFeedItemsForStat(data.feedItems, selectedMonsterData.requiredStat)
      .filter((item) => item.stats[selectedMonsterData.requiredStat] > 0);
  }, [data, selectedMonsterData]);

  const targetFoodOptions = useMemo(
    () => targetAllowedFoods.map((item) => ({
      value: item.name,
      label: `${item.name} (+${item.stats[selectedMonsterData?.requiredStat ?? "Attack"]})`,
      icon: getItemIcon(item.name),
    })),
    [selectedMonsterData, targetAllowedFoods]
  );

  const targetFeedRows = useMemo(
    () => getFeedRows(targetFeedState, targetAllowedFoods),
    [targetAllowedFoods, targetFeedState]
  );
  const targetTotals = useMemo(() => getFeedTotals(targetFeedRows), [targetFeedRows]);

  const targetCurrentBand = useMemo(() => {
    if (!selectedMonsterData) return "None" as EggBand;
    return getReachedBand(targetTotals.stats[selectedMonsterData.requiredStat], selectedMonsterData.thresholds);
  }, [selectedMonsterData, targetTotals]);

  const targetBestPerItem = useMemo(() => {
    if (!selectedMonsterData) return 0;
    return targetAllowedFoods[0]?.stats[selectedMonsterData.requiredStat] ?? 0;
  }, [selectedMonsterData, targetAllowedFoods]);

  const targetMinLevels = useMemo(() => {
    if (!selectedMonsterData) return null;
    return {
      Low: minEggLevelForThreshold(selectedMonsterData.thresholds.Low, targetBestPerItem),
      Medium: minEggLevelForThreshold(selectedMonsterData.thresholds.Medium, targetBestPerItem),
      High: minEggLevelForThreshold(selectedMonsterData.thresholds.High, targetBestPerItem),
      Over: minEggLevelForThreshold(selectedMonsterData.thresholds.Over, targetBestPerItem),
    };
  }, [selectedMonsterData, targetBestPerItem]);

  const targetPlanEggLevel = targetTotals.itemCount > 0 ? Math.ceil(targetTotals.itemCount / 10) : null;
  const targetTierHints = useMemo(() => {
    if (!selectedMonsterData) return [];
    const values = Array.from(new Set(targetAllowedFoods.map((item) => item.stats[selectedMonsterData.requiredStat]).filter((value) => value > 0)))
      .sort((a, b) => b - a)
      .slice(0, 3);
    return values.map((value) => ({
      perItem: value,
      minLevel: minEggLevelForThreshold(selectedMonsterData.thresholds.High, value),
    }));
  }, [selectedMonsterData, targetAllowedFoods]);

  const existingPerItemOptions = useMemo(() => {
    const values = Array.from(new Set(
      (data?.feedItems ?? [])
        .map((item) => item.stats[existingPlanStat])
        .filter((value) => value > 0)
    )).sort((a, b) => b - a);
    return values.map((value) => ({ value: String(value), label: `+${value}` }));
  }, [data, existingPlanStat]);

  useEffect(() => {
    if (!existingPerItemOptions.length) {
      setExistingBestPerItem("");
      return;
    }
    if (!existingPerItemOptions.some((option) => option.value === existingBestPerItem)) {
      setExistingBestPerItem(existingPerItemOptions[0].value);
    }
  }, [existingBestPerItem, existingPerItemOptions]);

  const existingBestPerItemNum = Number.parseInt(existingBestPerItem, 10) || 0;

  const existingEggResults = useMemo(() => {
    return (data?.monsters ?? [])
      .filter((monster) => monster.eggColor === selectedEggColor && monster.requiredStat === existingPlanStat)
      .map((monster) => {
        const thresholds = monster.thresholds;
        const limits = { Low: thresholds.Medium, Medium: thresholds.High, High: thresholds.Over };
        const bands = (["Low", "Medium", "High"] as const).map((band) => {
          const minimum = itemsNeededForThreshold(thresholds[band], existingBestPerItemNum);
          const limit = limits[band];
          const maximum = limit === null || existingBestPerItemNum <= 0
            ? eggItemCap
            : Math.min(eggItemCap, Math.floor((limit - 1) / existingBestPerItemNum));
          return { band, count: minimum !== null && minimum <= maximum ? { minimum, maximum } : null };
        });
        return { monster, bands };
      })
      .filter((row) => !showOnlyReachable || row.bands.some(({ count }) => count !== null))
      .sort((a, b) => a.monster.monsterName.localeCompare(b.monster.monsterName));
  }, [data, eggItemCap, existingPlanStat, existingBestPerItemNum, selectedEggColor, showOnlyReachable]);

  const sortedFeedItems = useMemo(() => {
    const items = [...(data?.feedItems ?? [])];
    items.sort((a, b) => {
      const aValue = feedSortBy === "EXP"
        ? a.exp
        : feedSortBy === "Copper"
          ? (a.copperCoins ?? -1)
          : a.stats[feedSortBy];
      const bValue = feedSortBy === "EXP"
        ? b.exp
        : feedSortBy === "Copper"
          ? (b.copperCoins ?? -1)
          : b.stats[feedSortBy];
      if (bValue !== aValue) return bValue - aValue;
      return a.name.localeCompare(b.name);
    });
    return items;
  }, [data, feedSortBy]);

  const visibleFeedRows = useMemo(() => {
    if (feedRowsToShow === "All") return sortedFeedItems;
    const limit = Number.parseInt(feedRowsToShow, 10);
    return sortedFeedItems.slice(0, Number.isFinite(limit) ? limit : 25);
  }, [feedRowsToShow, sortedFeedItems]);

  const updateFeedQuantityInput = (
    inputSetter: Dispatch<SetStateAction<FeedInputState>>,
    name: string,
    nextValue: string
  ) => {
    inputSetter((current) => ({ ...current, [name]: nextValue }));
  };

  const commitFeedQuantity = (
    setter: Dispatch<SetStateAction<FeedState>>,
    inputSetter: Dispatch<SetStateAction<FeedInputState>>,
    name: string,
    nextValue: string
  ) => {
    const trimmed = nextValue.trim();
    if (trimmed === "") {
      inputSetter((current) => ({ ...current, [name]: "" }));
      return;
    }
    const parsed = Math.max(0, Number.parseInt(trimmed, 10) || 0);
    setter((current) => ({ ...current, [name]: parsed }));
    inputSetter((current) => ({ ...current, [name]: String(parsed) }));
  };

  const removeFeed = (
    setter: Dispatch<SetStateAction<FeedState>>,
    name: string
  ) => {
    setter((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const addTargetFood = () => {
    if (!targetFoodToAdd) return;
    setTargetFeedState((current) => {
      const next = (current[targetFoodToAdd] ?? 0) + 1;
      setTargetFeedInputs((inputs) => ({ ...inputs, [targetFoodToAdd]: String(next) }));
      return {
        ...current,
        [targetFoodToAdd]: next,
      };
    });
    setTargetFoodToAdd("");
  };

  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">

            <div>
              <h1 className="text-2xl font-bold text-foreground">Egg feeding planner</h1>
              <Link href="/eggs" className="text-sm text-primary hover:underline">Pet thresholds</Link>
              <p className="text-sm text-muted-foreground">
                Plan from the pet you want or the egg you already have, then use feed items to see the likely band.
              </p>
            </div>
          </div>
        </div>

        <Card className="shadow-sm border-primary/20 mb-4">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BadgeInfo className="w-5 h-5 text-violet-500" />
              <CardTitle className="text-base">Planner Rules Used Right Now</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Egg item cap is treated as <span className="text-foreground font-medium">egg level x 10</span>.</p>
            <p>
              In <span className="text-foreground font-medium">I Want This Pet</span>, you can only add foods that boost the required stat for that pet.
            </p>
            <p>
              In <span className="text-foreground font-medium">I Have This Egg</span>, choose the stat and points your food adds to see how many items to feed.
            </p>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card className="shadow-sm">
            <CardContent className="py-8 text-sm text-muted-foreground">Loading egg and pet data...</CardContent>
          </Card>
        ) : error || !data ? (
          <Card className="shadow-sm border-destructive/30">
            <CardContent className="py-8 text-sm text-destructive">
              Could not load the Eggs & Pets data from game data.
            </CardContent>
          </Card>
        ) : (
          <>
            <Tabs value={mode} onValueChange={(value) => setMode(value as "target" | "existing")}>
              <TabsList className="mb-4 grid h-auto grid-cols-1 gap-3 bg-transparent p-0 sm:grid-cols-2">
                <TabsTrigger
                  value="target"
                  className={`h-auto rounded-xl border px-5 py-4 text-left transition-all ${
                    mode === "target"
                      ? "border-primary bg-primary text-primary-foreground shadow-md"
                      : "border-border bg-muted/30 text-foreground hover:bg-muted/60"
                  }`}
                >
                  <div className="w-full text-left">
                    <div className="text-base font-semibold">I Want This Pet</div>
                    <div className={`mt-1 text-xs leading-relaxed ${
                      mode === "target" ? "text-primary-foreground/85" : "text-muted-foreground"
                    }`}>
                      Start from the pet you want and build the feeding plan needed to reach it.
                    </div>
                  </div>
                </TabsTrigger>
                <TabsTrigger
                  value="existing"
                  className={`h-auto rounded-xl border px-5 py-4 text-left transition-all ${
                    mode === "existing"
                      ? "border-primary bg-primary text-primary-foreground shadow-md"
                      : "border-border bg-muted/30 text-foreground hover:bg-muted/60"
                  }`}
                >
                  <div className="w-full text-left">
                    <div className="text-base font-semibold">I Have This Egg</div>
                    <div className={`mt-1 text-xs leading-relaxed ${
                      mode === "existing" ? "text-primary-foreground/85" : "text-muted-foreground"
                    }`}>
                      Start from your current egg and see what pets it can realistically reach.
                    </div>
                  </div>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="target" className="mt-0 space-y-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-sky-500" />
                      <CardTitle className="text-base">How Do I Get This Pet?</CardTitle>
                    </div>
                    <CardDescription>
                      Pick the pet first, then add the foods you plan to feed it.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Desired pet</div>
                      <SearchableSelect
                        value={selectedMonster}
                        onChange={(value) => {
                          setSelectedMonster(value);
                          setTargetFeedState({});
                          setTargetFoodToAdd("");
                        }}
                        options={monsterOptions}
                        placeholder="Choose target pet..."
                        triggerClassName="h-9"
                      />
                    </div>

                    {selectedMonsterData && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                            <div className="text-xs text-muted-foreground">Egg color</div>
                            <div className="font-semibold text-foreground flex items-center gap-2">
                              {getEggIconByColor(selectedMonsterData.eggColor) && (
                                <img src={getEggIconByColor(selectedMonsterData.eggColor)!} alt="" className="h-6 w-6 shrink-0 object-contain" style={{ imageRendering: "pixelated" }} />
                              )}
                              {selectedMonsterData.eggColor}
                            </div>
                          </div>
                          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                            <div className="text-xs text-muted-foreground">Required stat</div>
                            <div className="font-semibold text-foreground">{selectedMonsterData.requiredStat}</div>
                          </div>
                          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                            <div className="text-xs text-muted-foreground">Starting skill</div>
                            <div className="font-semibold text-foreground"><EggTableIcon src={getSkillIcon(selectedMonsterData.startingSkill)} label={selectedMonsterData.startingSkill} /></div>
                          </div>
                          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                            <div className="text-xs text-muted-foreground">2nd skill item</div>
                            <div className="font-semibold text-foreground"><EggTableIcon src={getItemIcon(selectedMonsterData.secondSkillItem)} label={selectedMonsterData.secondSkillItem} /></div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                          <div className="text-sm font-medium text-foreground">
                            {targetMinLevels?.High
                              ? `${selectedMonsterData.eggColor} egg level ${targetMinLevels.High}+ for High`
                              : `${selectedMonsterData.eggColor} egg color confirmed`}
                          </div>
                          {targetTierHints.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {targetTierHints.map((hint) => (
                                <Badge key={hint.perItem} variant="secondary" className="text-[11px]">
                                  +{hint.perItem} food: {hint.minLevel ? `Lv ${hint.minLevel}+` : "n/a"}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {targetPlanEggLevel ? (
                            <div className="text-sm text-muted-foreground">
                              Your current food plan uses <span className="text-foreground font-medium">{targetTotals.itemCount}</span> items,
                              so it needs at least <span className="text-foreground font-medium">egg level {targetPlanEggLevel}+</span>.
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              Add foods to see your planned minimum egg level and reached band.
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-xs text-muted-foreground mb-2">
                            Add foods that raise {selectedMonsterData.requiredStat}
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <SearchableSelect
                              value={targetFoodToAdd}
                              onChange={setTargetFoodToAdd}
                              options={targetFoodOptions}
                              placeholder={`Choose ${selectedMonsterData.requiredStat} food...`}
                              className="flex-1"
                              triggerClassName="h-9"
                            />
                            <Button onClick={addTargetFood} className="sm:w-auto w-full">
                              <Plus className="w-4 h-4 mr-1" />Add Food
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {targetFeedRows.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                              No foods added yet.
                            </div>
                          ) : (
                            targetFeedRows.map(({ item, quantity }) => (
                              <div key={item.name} className="rounded-lg border border-border/60 bg-card px-3 py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      {getItemIcon(item.name) && (
                                        <img src={getItemIcon(item.name)!} alt="" className="h-6 w-6 shrink-0 object-contain" style={{ imageRendering: "pixelated" }} />
                                      )}
                                      <span className="font-medium text-foreground">{item.name}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {selectedMonsterData.requiredStat} +{item.stats[selectedMonsterData.requiredStat]} each
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      EXP {item.exp} | Copper {item.copperCoins ?? "-"} | Hatch {formatSignedSeconds(item.hatchTimeSeconds)}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <ThemedNumberInput
                                      min={0}
                                      value={targetFeedInputs[item.name] ?? String(quantity)}
                                      onRawChange={(nextValue) => {
                                        updateFeedQuantityInput(setTargetFeedInputs, item.name, nextValue);
                                        if (nextValue.trim() === "") {
                                          return;
                                        }
                                        const parsed = Math.max(0, Number.parseInt(nextValue, 10) || 0);
                                        setTargetFeedState((current) => ({ ...current, [item.name]: parsed }));
                                      }}
                                      onRawBlur={(value) => commitFeedQuantity(setTargetFeedState, setTargetFeedInputs, item.name, value)}
                                      onEnter={(value) => {
                                        commitFeedQuantity(setTargetFeedState, setTargetFeedInputs, item.name, value);
                                      }}
                                      className="w-24 h-8"
                                    />
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { removeFeed(setTargetFeedState, item.name); setTargetFeedInputs((current) => { const next = { ...current }; delete next[item.name]; return next; }); }}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{selectedMonsterData.requiredStat}: {targetTotals.stats[selectedMonsterData.requiredStat]}</Badge>
                          <Badge variant="secondary">Items: {targetTotals.itemCount}</Badge>
                          <Badge variant="secondary">EXP: {targetTotals.exp}</Badge>
                          <Badge variant="secondary">Copper: {targetTotals.copper}</Badge>
                          <Badge variant="secondary">Hatch: {formatSignedSeconds(targetTotals.hatchTimeSeconds)}</Badge>
                          <BandPill band={targetCurrentBand} />
                        </div>

                        <BandProgress
                          currentBand={targetCurrentBand}
                          thresholds={selectedMonsterData.thresholds}
                          currentTotal={targetTotals.stats[selectedMonsterData.requiredStat]}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="existing" className="mt-0 space-y-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Egg className="w-5 h-5 text-amber-500" />
                      <CardTitle className="text-base">What Can I Get From This Egg?</CardTitle>
                    </div>
                    <CardDescription>
                      Enter your egg colour and level, then pick the stat and points your food adds.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Egg color</div>
                        <SearchableSelect
                          value={selectedEggColor}
                          onChange={setSelectedEggColor}
                          options={data.eggColors.map((color) => ({ value: color, label: color, icon: getEggIconByColor(color) }))}
                          placeholder="Choose egg color..."
                          triggerClassName="h-9"
                          searchThreshold={6}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Egg level</div>
                        <ThemedNumberInput value={eggLevel} min={1} onRawChange={setEggLevel} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="secondary">Feeding limit: {eggItemCap} items</Badge>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={showOnlyReachable}
                          onChange={(e) => setShowOnlyReachable(e.target.checked)}
                          className="rounded border-border"
                        />
                        Hide pets I can’t reach with this food bonus
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Stat to raise</div>
                        <SearchableSelect
                          value={existingPlanStat}
                          onChange={(value) => setExistingPlanStat(value as EggStat)}
                          options={STATS.map((stat) => ({ value: stat, label: stat }))}
                          placeholder="Choose path..."
                          triggerClassName="h-9"
                          searchThreshold={8}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Points per food item</div>
                        <SearchableSelect
                          value={existingBestPerItem}
                          onChange={setExistingBestPerItem}
                          options={existingPerItemOptions}
                          placeholder="Choose best bonus..."
                          triggerClassName="h-9"
                          searchThreshold={10}
                        />
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Starting at 0 points, feed any number of items in the listed range to land in that band.
                      Each item in the plan adds {existingBestPerItemNum} {existingPlanStat} points. Hatching can still produce a different pet.
                    </p>
                    <ReferenceTable label="How many items to feed">
                      <thead><tr><th scope="col">Possible pet</th><th scope="col">Low</th><th scope="col">Medium</th><th scope="col">High</th></tr></thead>
                      <tbody>
                        {existingEggResults.map(({ monster, bands }) => (
                          <tr key={monster.monsterId}>
                            <th scope="row"><EggTableIcon src={getMonsterSpriteById(monster.monsterId)} label={monster.monsterName} /></th>
                            {bands.map(({ band, count }) => (
                              <td key={band} className="tabular-nums">
                                {count === null ? <span className="text-muted-foreground">Unreachable</span> :
                                  count.minimum === count.maximum ? count.minimum : count.minimum + "–" + count.maximum}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {!existingEggResults.length && <tr><td colSpan={4}>No pets match this egg colour, stat and food bonus.</td></tr>}
                      </tbody>
                    </ReferenceTable>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <Card className="shadow-sm mt-4">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-cyan-500" />
                  <CardTitle className="text-base">Feed Item Reference</CardTitle>
                </div>
                <CardDescription>
                  Sort by the stat you care about and choose how many rows to show at once.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Sort by</span>
                    <SearchableSelect
                      value={feedSortBy}
                      onChange={(value) => setFeedSortBy(value as FeedSortKey)}
                      options={[
                        { value: "Attack", label: "Attack" },
                        { value: "Defense", label: "Defense" },
                        { value: "Balanced", label: "Balanced" },
                        { value: "Special", label: "Special" },
                        { value: "EXP", label: "EXP" },
                        { value: "Copper", label: "Copper" },
                      ]}
                      placeholder="Sort stat..."
                      triggerClassName="h-9 w-[180px]"
                      searchThreshold={10}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows</span>
                    <SearchableSelect
                      value={feedRowsToShow}
                      onChange={setFeedRowsToShow}
                      options={[
                        { value: "10", label: "10" },
                        { value: "25", label: "25" },
                        { value: "50", label: "50" },
                        { value: "100", label: "100" },
                        { value: "All", label: "All" },
                      ]}
                      placeholder="Rows"
                      triggerClassName="h-9 w-[110px]"
                      searchThreshold={10}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.7fr_0.6fr_0.6fr_0.7fr] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border/60 bg-muted/20">
                    <div>Item</div>
                    <div>Attack</div>
                    <div>Defense</div>
                    <div>Balanced</div>
                    <div>Special</div>
                    <div>EXP</div>
                    <div>Copper</div>
                    <div>Hatch</div>
                  </div>
                  <div>
                    {visibleFeedRows.map((item) => (
                      <div
                        key={item.name}
                        className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.7fr_0.6fr_0.6fr_0.7fr] gap-3 px-3 py-2 text-sm border-b border-border/40 last:border-b-0"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {getItemIcon(item.name) && (
                            <img src={getItemIcon(item.name)!} alt="" className="h-6 w-6 shrink-0 object-contain" style={{ imageRendering: "pixelated" }} />
                          )}
                          <span className="font-medium text-foreground truncate">{item.name}</span>
                        </div>
                        <div>{item.stats.Attack || "-"}</div>
                        <div>{item.stats.Defense || "-"}</div>
                        <div>{item.stats.Balanced || "-"}</div>
                        <div>{item.stats.Special || "-"}</div>
                        <div>{item.exp || "-"}</div>
                        <div>{item.copperCoins ?? "-"}</div>
                        <div>{formatSignedSeconds(item.hatchTimeSeconds)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

