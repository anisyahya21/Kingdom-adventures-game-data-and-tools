import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EQUIPMENT_CATALOG, EQUIPMENT_EXCHANGE_ROWS } from "@/lib/generated-equipment-data";

type KairoEquipmentName =
  | "A/ Kairo Sword"
  | "A/ Kairo Hammer"
  | "A/ Kairo Lance"
  | "A/ Kairo Bow"
  | "A/ Kairo Gun";

type SmithyBand = "f_to_c" | "b_or_higher";
type RequirementMode = "auto" | "manual";

type EquipmentCatalogItem = (typeof EQUIPMENT_CATALOG)[number];
type ExchangeRow = (typeof EQUIPMENT_EXCHANGE_ROWS)[number];

const KAIRO_OUTPUTS: KairoEquipmentName[] = [
  "A/ Kairo Sword",
  "A/ Kairo Hammer",
  "A/ Kairo Lance",
  "A/ Kairo Bow",
  "A/ Kairo Gun",
];

const SMITHY_LEVEL_ROWS = [
  { level: 5, f_to_c: { kairo: 1, diamond: 10 }, b_or_higher: { kairo: 1, diamond: 100 } },
  { level: 10, f_to_c: { kairo: 1, diamond: 30 }, b_or_higher: { kairo: 1, diamond: 150 } },
  { level: 20, f_to_c: { kairo: 1, diamond: 50 }, b_or_higher: { kairo: 2, diamond: 200 } },
  { level: 30, f_to_c: { kairo: 1, diamond: 75 }, b_or_higher: { kairo: 2, diamond: 250 } },
  { level: 40, f_to_c: { kairo: 1, diamond: 100 }, b_or_higher: { kairo: 3, diamond: 300 } },
  { level: 50, f_to_c: { kairo: 1, diamond: 125 }, b_or_higher: { kairo: 3, diamond: 400 } },
  { level: 60, f_to_c: { kairo: 1, diamond: 150 }, b_or_higher: { kairo: 4, diamond: 500 } },
  { level: 70, f_to_c: { kairo: 1, diamond: 200 }, b_or_higher: { kairo: 4, diamond: 600 } },
  { level: 80, f_to_c: { kairo: 1, diamond: 300 }, b_or_higher: { kairo: 5, diamond: 700 } },
  { level: 90, f_to_c: { kairo: 2, diamond: 400 }, b_or_higher: { kairo: 5, diamond: 800 } },
] as const;

const BREAK_LEVELS = SMITHY_LEVEL_ROWS.map((row) => row.level);
const RANK_TOGGLES = ["F", "E", "D", "C", "B", "A", "S"] as const;
const STORAGE_KEY = "ka-equipment-exchange-state-v1";

const PLAYER_EQUIPMENT = (EQUIPMENT_CATALOG as readonly EquipmentCatalogItem[]).filter((item) =>
  /^[FSABCDEG]\s*\//i.test(item.name),
);

function isValidTradeValue(value: number, start: number, step: number) {
  if (!Number.isFinite(value) || value < start) return false;
  return (value - start) % step === 0;
}

function formatRankBand(rank: string) {
  return ["F", "E", "D", "C"].includes(rank) ? "Class F to C" : "B or higher";
}

function smithyBandForRank(rank: string): SmithyBand {
  return ["F", "E", "D", "C"].includes(rank) ? "f_to_c" : "b_or_higher";
}

function getSmithyRequirement(levels: number[], band: SmithyBand) {
  return levels.reduce(
    (acc, level) => {
      const row = SMITHY_LEVEL_ROWS.find((item) => item.level === level);
      if (!row) return acc;
      acc.kairo += row[band].kairo;
      acc.diamond += row[band].diamond;
      return acc;
    },
    { kairo: 0, diamond: 0 },
  );
}

function summarizeKairoCounts(items: EquipmentCatalogItem[], targetLevel = 99) {
  const counts: Record<KairoEquipmentName, number> = {
    "A/ Kairo Sword": 0,
    "A/ Kairo Hammer": 0,
    "A/ Kairo Lance": 0,
    "A/ Kairo Bow": 0,
    "A/ Kairo Gun": 0,
  };
  let diamond = 0;

  for (const item of items) {
    const levels = BREAK_LEVELS.filter((level) => level <= targetLevel);
    const requirement = getSmithyRequirement(levels, smithyBandForRank(item.rankLabel));
    counts[item.requiredKairo as KairoEquipmentName] += requirement.kairo;
    diamond += requirement.diamond;
  }

  return {
    counts,
    totalKairo: Object.values(counts).reduce((sum, value) => sum + value, 0),
    diamond,
    equipmentCount: items.length,
  };
}

function getCheapestCopperBuyForTarget(target: KairoEquipmentName, count: number) {
  const entries = (EQUIPMENT_EXCHANGE_ROWS as readonly ExchangeRow[]).filter(
    (entry) => entry.outputName === target && entry.tradable,
  );
  if (entries.length === 0 || count <= 0) return 0;

  const states = entries.map((entry) => ({
    entry,
    currentExchange: entry.startPrice,
  }));

  let totalBuy = 0;
  for (let i = 0; i < count; i += 1) {
    let best = states[0];
    let bestCombined = Number.POSITIVE_INFINITY;
    for (const state of states) {
      const combined = state.entry.buyPrice + state.currentExchange;
      if (
        combined < bestCombined ||
        (combined === bestCombined && state.entry.buyPrice < best.entry.buyPrice) ||
        (combined === bestCombined &&
          state.entry.buyPrice === best.entry.buyPrice &&
          state.entry.inputName < best.entry.inputName)
      ) {
        best = state;
        bestCombined = combined;
      }
    }
    totalBuy += best.entry.buyPrice;
    best.currentExchange += best.entry.priceStep;
  }

  return totalBuy;
}

function summarizeCopperCoinRoute(items: EquipmentCatalogItem[], targetLevel = 99) {
  const summary = summarizeKairoCounts(items, targetLevel);
  return KAIRO_OUTPUTS.reduce((sum, output) => sum + getCheapestCopperBuyForTarget(output, summary.counts[output]), 0);
}

export default function EquipmentExchangeCalculator() {
  const [target, setTarget] = useState<KairoEquipmentName>("A/ Kairo Gun");
  const [targetCount, setTargetCount] = useState(10);
  const [requirementMode, setRequirementMode] = useState<RequirementMode>("auto");
  const [ownedKairo, setOwnedKairo] = useState(0);
  const [equipmentQuery, setEquipmentQuery] = useState("");
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | "">("");
  const [currentLevel, setCurrentLevel] = useState(1);
  const [targetLevel, setTargetLevel] = useState(99);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceRankFilters, setSourceRankFilters] = useState<Set<string>>(new Set());
  const [sourceGivesFilters, setSourceGivesFilters] = useState<Set<string>>(new Set());
  const [givesDropdownOpen, setGivesDropdownOpen] = useState(false);
  const givesDropdownRef = useRef<HTMLDivElement>(null);
  const [currentPriceInputs, setCurrentPriceInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (givesDropdownRef.current && !givesDropdownRef.current.contains(e.target as Node)) {
        setGivesDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  const [funFactRanks, setFunFactRanks] = useState<Set<string>>(new Set(RANK_TOGGLES));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as {
        target?: KairoEquipmentName;
        targetCount?: number;
        requirementMode?: RequirementMode;
        ownedKairo?: number;
        equipmentQuery?: string;
        selectedEquipmentId?: number | "";
        currentLevel?: number;
        targetLevel?: number;
        sourceQuery?: string;
        currentPriceInputs?: Record<number, string>;
        funFactRanks?: string[];
      };
      if (saved.target) setTarget(saved.target);
      if (typeof saved.targetCount === "number") setTargetCount(saved.targetCount);
      if (saved.requirementMode) setRequirementMode(saved.requirementMode);
      if (typeof saved.ownedKairo === "number") setOwnedKairo(saved.ownedKairo);
      if (typeof saved.equipmentQuery === "string") setEquipmentQuery(saved.equipmentQuery);
      if (typeof saved.selectedEquipmentId === "number" || saved.selectedEquipmentId === "") setSelectedEquipmentId(saved.selectedEquipmentId);
      if (typeof saved.currentLevel === "number") setCurrentLevel(saved.currentLevel);
      if (typeof saved.targetLevel === "number") setTargetLevel(saved.targetLevel);
      if (typeof saved.sourceQuery === "string") setSourceQuery(saved.sourceQuery);
      if (saved.currentPriceInputs) setCurrentPriceInputs(saved.currentPriceInputs);
      if (saved.funFactRanks?.length) setFunFactRanks(new Set(saved.funFactRanks));
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        target,
        targetCount,
        requirementMode,
        ownedKairo,
        equipmentQuery,
        selectedEquipmentId,
        currentLevel,
        targetLevel,
        sourceQuery,
        currentPriceInputs,
        funFactRanks: Array.from(funFactRanks),
      }),
    );
  }, [
    currentLevel,
    currentPriceInputs,
    equipmentQuery,
    funFactRanks,
    ownedKairo,
    requirementMode,
    selectedEquipmentId,
    sourceQuery,
    target,
    targetCount,
    targetLevel,
  ]);

  const selectedEquipment = useMemo(
    () => PLAYER_EQUIPMENT.find((item) => item.id === selectedEquipmentId) ?? null,
    [selectedEquipmentId],
  );

  useEffect(() => {
    if (!selectedEquipment) return;
    setTarget(selectedEquipment.requiredKairo as KairoEquipmentName);
  }, [selectedEquipment]);

  const equipmentOptions = useMemo(() => {
    const q = equipmentQuery.trim().toLowerCase();
    if (!q) return PLAYER_EQUIPMENT;
    const parts = q.split(/\s+/).filter(Boolean);
    return PLAYER_EQUIPMENT.filter((item) => {
      const name = item.name.toLowerCase();
      return parts.every((part) => name.includes(part));
    });
  }, [equipmentQuery]);

  const displayedEquipmentId = useMemo(() => {
    if (!equipmentQuery.trim()) return selectedEquipmentId;
    if (selectedEquipmentId !== "" && equipmentOptions.some((item) => item.id === selectedEquipmentId)) {
      return selectedEquipmentId;
    }
    return equipmentOptions[0]?.id ?? "";
  }, [equipmentOptions, equipmentQuery, selectedEquipmentId]);

  useEffect(() => {
    if (!equipmentQuery.trim()) return;
    const firstMatch = equipmentOptions[0];
    if (!firstMatch) return;
    const currentStillVisible = equipmentOptions.some((item) => item.id === selectedEquipmentId);
    if (!currentStillVisible) {
      setSelectedEquipmentId(firstMatch.id);
    }
  }, [equipmentOptions, equipmentQuery, selectedEquipmentId]);

  const normalizedCurrentLevel = Math.max(1, Math.min(99, currentLevel));
  const normalizedTargetLevel = Math.max(normalizedCurrentLevel, Math.min(99, targetLevel));

  const requiredBreakLevels = useMemo(
    () => BREAK_LEVELS.filter((level) => level >= normalizedCurrentLevel && level < normalizedTargetLevel),
    [normalizedCurrentLevel, normalizedTargetLevel],
  );

  const selectedRequirement = useMemo(() => {
    if (!selectedEquipment) return { kairo: 0, diamond: 0 };
    return getSmithyRequirement(requiredBreakLevels, smithyBandForRank(selectedEquipment.rankLabel));
  }, [requiredBreakLevels, selectedEquipment]);

  const autoNeededKairo = useMemo(
    () => Math.max(0, selectedRequirement.kairo - Math.max(0, ownedKairo)),
    [ownedKairo, selectedRequirement.kairo],
  );

  useEffect(() => {
    if (requirementMode === "auto" && selectedEquipment) {
      setTargetCount(autoNeededKairo);
    }
  }, [autoNeededKairo, requirementMode, selectedEquipment]);

  const entries = useMemo(
    () => (EQUIPMENT_EXCHANGE_ROWS as readonly ExchangeRow[]).filter((entry) => entry.tradable),
    [],
  );

  const routeEntries = useMemo(
    () => entries.filter((entry) => entry.outputName === target),
    [entries, target],
  );

  const parsedCurrentPrices = useMemo(() => {
    const parsed: Record<number, number> = {};
    for (const entry of routeEntries) {
      const raw = currentPriceInputs[entry.inputId];
      if (raw == null || raw.trim() === "") continue;
      const next = Number(raw);
      if (isValidTradeValue(next, entry.startPrice, entry.priceStep)) {
        parsed[entry.inputId] = next;
      }
    }
    return parsed;
  }, [currentPriceInputs, routeEntries]);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (sourceRankFilters.size > 0) result = result.filter((e) => sourceRankFilters.has(e.rankLabel));
    if (sourceGivesFilters.size > 0) result = result.filter((e) => sourceGivesFilters.has(e.outputName));
    const q = sourceQuery.trim().toLowerCase();
    if (q) result = result.filter((e) => e.inputName.toLowerCase().includes(q));
    return result;
  }, [entries, sourceQuery, sourceRankFilters, sourceGivesFilters]);

  const route = useMemo(() => {
    const safeTargetCount = Math.max(0, targetCount);
    const states = routeEntries.map((entry) => ({
      entry,
      currentExchange: parsedCurrentPrices[entry.inputId] ?? entry.startPrice,
      used: 0,
      totalBuy: 0,
      totalExchange: 0,
    }));

    const picks: Array<{ item: string; tradeCost: number; buyCost: number; totalCost: number }> = [];
    let totalBuy = 0;
    let totalExchange = 0;

    for (let i = 0; i < safeTargetCount; i += 1) {
      let best = states[0];
      let bestCombined = Number.POSITIVE_INFINITY;
      for (const state of states) {
        const combined = state.entry.buyPrice * state.currentExchange;
        if (
          combined < bestCombined ||
          (combined === bestCombined && state.currentExchange < best.currentExchange) ||
          (combined === bestCombined &&
            state.currentExchange === best.currentExchange &&
            state.entry.inputName < best.entry.inputName)
        ) {
          best = state;
          bestCombined = combined;
        }
      }

      const tradeCost = best.entry.buyPrice * best.currentExchange;
      best.used += 1;
      best.totalBuy += tradeCost;
      best.totalExchange += best.currentExchange;
      totalBuy += tradeCost;
      totalExchange += best.currentExchange;
      picks.push({
        item: best.entry.inputName,
        tradeCost: best.currentExchange,
        buyCost: best.entry.buyPrice,
        totalCost: tradeCost,
      });
      best.currentExchange += best.entry.priceStep;
    }

    const usedEntries = states
      .filter((state) => state.used > 0)
      .map((state) => ({ ...state, nextExchange: state.currentExchange }))
      .sort((a, b) => {
        if (b.used !== a.used) return b.used - a.used;
        return a.entry.inputName.localeCompare(b.entry.inputName);
      });

    return {
      totalBuy,
      totalExchange,
      totalCombined: totalBuy + totalExchange,
      usedEntries,
      picks,
    };
  }, [routeEntries, parsedCurrentPrices, targetCount]);

  const funFactItems = useMemo(
    () => PLAYER_EQUIPMENT.filter((item) => funFactRanks.has(item.rankLabel as (typeof RANK_TOGGLES)[number])),
    [funFactRanks],
  );
  const funFacts = useMemo(() => summarizeKairoCounts(funFactItems), [funFactItems]);
  const allGameFacts = useMemo(() => summarizeKairoCounts(PLAYER_EQUIPMENT), []);
  const allAFacts = useMemo(() => summarizeKairoCounts(PLAYER_EQUIPMENT.filter((item) => item.rankLabel === "A")), []);
  const allSFacts = useMemo(() => summarizeKairoCounts(PLAYER_EQUIPMENT.filter((item) => item.rankLabel === "S")), []);
  const allGameCopper = useMemo(() => summarizeCopperCoinRoute(PLAYER_EQUIPMENT), []);
  const allACopper = useMemo(() => summarizeCopperCoinRoute(PLAYER_EQUIPMENT.filter((item) => item.rankLabel === "A")), []);
  const allSCopper = useMemo(() => summarizeCopperCoinRoute(PLAYER_EQUIPMENT.filter((item) => item.rankLabel === "S")), []);
  const funFactsCopper = useMemo(() => summarizeCopperCoinRoute(funFactItems), [funFactItems]);

  const resetVisible = () => {
    setCurrentPriceInputs((prev) => {
      const next = { ...prev };
      for (const entry of routeEntries) delete next[entry.inputId];
      return next;
    });
  };

  const toggleFunFactRank = (rank: string) => {
    setFunFactRanks((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });
  };

  const stepTradePrice = (entry: ExchangeRow, direction: -1 | 1) => {
    setCurrentPriceInputs((prev) => {
      const currentRaw = prev[entry.inputId];
      const parsed = currentRaw && currentRaw.trim() !== "" ? Number(currentRaw) : entry.startPrice;
      const validCurrent = isValidTradeValue(parsed, entry.startPrice, entry.priceStep) ? parsed : entry.startPrice;
      const nextValue = direction === -1 ? Math.max(entry.startPrice, validCurrent - entry.priceStep) : validCurrent + entry.priceStep;
      return {
        ...prev,
        [entry.inputId]: String(nextValue),
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-bold tracking-tight">Equipment Exchange</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Trade eligible equipment into A-rank Kairo gear. This page uses the corrected mined copper coin buy-price column,
          decoded exchange start prices and steps, and the EN Master Smithy requirement table.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-teal-500/20 bg-teal-500/5 p-4">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-200">
          Lower-rank items can be exchanged. Each source item tracks its own live trade price. If you enter a current trade
          value, it must match that item&apos;s valid ladder: start price + (step x number of past trades).
        </div>

        <div className="space-y-3 rounded-md border border-border bg-background/50 p-3">
          <div>
            <h2 className="text-sm font-semibold">Master Smithy helper</h2>
            <p className="text-xs text-muted-foreground">
              Pick the equipment you are leveling, your current level, and your target level. The calculator will figure out
              how many Kairo pieces and diamonds are needed to break the required caps. The highest break point is level 90,
              even though the final item level is 99.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px_120px_120px]">
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Equipment search</label>
              <Input
                value={equipmentQuery}
                onChange={(e) => setEquipmentQuery(e.target.value)}
                placeholder="Type part of an equipment name"
                className="h-9"
              />
              <select
                value={displayedEquipmentId === "" ? "" : String(displayedEquipmentId)}
                onChange={(e) => setSelectedEquipmentId(e.target.value ? Number(e.target.value) : "")}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select equipment...</option>
                {equipmentOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <div className="text-[10px] text-muted-foreground">
                Search matches partial words in any order, like `swift bow` or `magic staff`.
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Current level</label>
              <Input
                type="number"
                min={1}
                max={99}
                value={currentLevel}
                onChange={(e) => setCurrentLevel(Number(e.target.value) || 1)}
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Target level</label>
              <Input
                type="number"
                min={1}
                max={99}
                value={targetLevel}
                onChange={(e) => setTargetLevel(Number(e.target.value) || 1)}
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Kairo you own</label>
              <Input
                type="number"
                min={0}
                value={ownedKairo}
                onChange={(e) => setOwnedKairo(Math.max(0, Number(e.target.value) || 0))}
                className="h-9"
              />
            </div>
          </div>

          {selectedEquipment && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Card>
                  <CardContent className="p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Equipment</div>
                    <div className="mt-1 text-sm font-semibold">{selectedEquipment.name}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Required piece</div>
                    <div className="mt-1 text-sm font-semibold">{selectedEquipment.requiredKairo.replace("A/ ", "")}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Kairo needed</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">{autoNeededKairo}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Diamond cost</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">{selectedRequirement.diamond}</div>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                Breaks count whenever your current level is still inside that cap. Example: if your item is level 5 and you want
                to go higher, you still need the level 5 break. If you already own some Kairo pieces, they are subtracted here.
              </div>
            </>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Target Kairo piece</label>
            <div className="flex flex-wrap gap-2">
              {KAIRO_OUTPUTS.map((output) => (
                <button
                  key={output}
                  type="button"
                  onClick={() => setTarget(output)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    target === output ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {output}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border bg-background/50 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Kairo target mode</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRequirementMode("auto")}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  requirementMode === "auto" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                }`}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => setRequirementMode("manual")}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  requirementMode === "manual" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                }`}
              >
                Manual override
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {requirementMode === "auto" ? "Kairo needed" : "Manual Kairo needed"}
              </label>
              <Input
                type="number"
                min={0}
                value={targetCount}
                onChange={(e) => setTargetCount(Math.max(0, Number(e.target.value) || 0))}
                className="h-9"
                disabled={requirementMode === "auto"}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total copper coins</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{route.totalBuy}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total items to trade</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{route.totalExchange}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Full route total</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{route.totalCombined}</div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Best route summary</h2>
            <div className="text-xs text-muted-foreground">
              {route.usedEntries.length} source item{route.usedEntries.length === 1 ? "" : "s"} used
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {route.usedEntries.map((state) => (
              <div key={state.entry.inputId} className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{state.entry.inputName}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-semibold">Buy {state.totalExchange}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">marks done &amp; updates rate ➜</span>
                      <button
                        type="button"
                        title="Mark as bought & traded — updates your trade rate and reduces target"
                        onClick={() => {
                          setCurrentPriceInputs((prev) => ({ ...prev, [state.entry.inputId]: String(state.nextExchange) }));
                          if (requirementMode === "auto") {
                            setOwnedKairo((prev) => prev + state.used);
                          } else {
                            setTargetCount((prev) => Math.max(0, prev - state.used));
                          }
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-green-500/50 bg-green-500/10 text-sm font-bold text-green-600 hover:bg-green-500/20 dark:text-green-400"
                      >
                        ✓
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{state.totalExchange} × {state.entry.buyPrice}¢ = {state.totalBuy}¢ total &nbsp;·&nbsp; used {state.used}×</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">Rate after: <span className="font-medium text-foreground">{state.nextExchange}</span></div>
              </div>
            ))}
          </div>
        </div>

        <details className="rounded-md border border-border bg-background/40">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">Show per-trade route</summary>
          <div className="border-t border-border px-3 py-2">
            <p className="mb-2 text-[11px] text-muted-foreground">Each line is one exchange. You buy that many copies of the item, then trade them all for 1 Kairo weapon.</p>
            <div className="grid gap-1">
              {route.picks.map((pick, index) => (
                <div key={`${pick.item}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate">
                    {index + 1}. {pick.item}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {pick.tradeCost} × {pick.buyCost}¢ = <span className="font-medium text-foreground">{pick.totalCost}¢</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </details>

        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source items</h2>
            <div className="flex gap-2 sm:items-center">
              <Input
                value={sourceQuery}
                onChange={(e) => setSourceQuery(e.target.value)}
                placeholder="Filter source items"
                className="h-8 text-xs sm:w-48"
              />
              <button
                type="button"
                onClick={resetVisible}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Reset current trades
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Rank:</span>
              {RANK_TOGGLES.map((rank) => (
                <button
                  key={rank}
                  type="button"
                  onClick={() => setSourceRankFilters((prev) => { const next = new Set(prev); next.has(rank) ? next.delete(rank) : next.add(rank); return next; })}
                  className={`rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                    sourceRankFilters.has(rank) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {rank}
                </button>
              ))}
              {sourceRankFilters.size > 0 && (
                <button type="button" onClick={() => setSourceRankFilters(new Set())} className="text-[10px] text-muted-foreground hover:text-foreground underline">clear</button>
              )}
            </div>
            <div className="relative flex items-center gap-1" ref={givesDropdownRef}>
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Gives:</span>
              <button
                type="button"
                onClick={() => setGivesDropdownOpen((o) => !o)}
                className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium hover:bg-muted"
              >
                {sourceGivesFilters.size === 0
                  ? "All"
                  : sourceGivesFilters.size === 1
                  ? [...sourceGivesFilters][0].replace("A/ ", "")
                  : `${[...sourceGivesFilters][0].replace("A/ ", "")} +${sourceGivesFilters.size - 1}`}
                <svg className="h-3 w-3 opacity-60" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {sourceGivesFilters.size > 0 && (
                <button type="button" onClick={() => setSourceGivesFilters(new Set())} className="text-[10px] text-muted-foreground hover:text-foreground underline">clear</button>
              )}
              {givesDropdownOpen && (
                <div
                  className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-md border border-border bg-popover shadow-md"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {KAIRO_OUTPUTS.map((output) => (
                    <label
                      key={output}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary"
                        checked={sourceGivesFilters.has(output)}
                        onChange={() => setSourceGivesFilters((prev) => { const next = new Set(prev); next.has(output) ? next.delete(output) : next.add(output); return next; })}
                      />
                      {output.replace("A/ ", "")}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[480px] sm:min-w-[840px] border-collapse text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-left font-medium">Rank</th>
                  <th className="px-3 py-2 text-left font-medium">Gives</th>
                  <th className="px-3 py-2 text-right font-medium">Buy price</th>
                  <th className="px-3 py-2 text-right font-medium">Start trade price</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Step</th>
                  <th className="px-3 py-2 text-right font-medium">Your current trade</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Total copper cost</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry, index) => {
                  const raw = currentPriceInputs[entry.inputId] ?? String(entry.startPrice);
                  const parsed = Number(raw);
                  const isValid = raw.trim() === "" || isValidTradeValue(parsed, entry.startPrice, entry.priceStep);
                  const current = isValid && raw.trim() !== "" ? parsed : entry.startPrice;
                  return (
                    <tr key={entry.inputId} className="border-t border-border">
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{index + 1}</td>
                      <td className="px-3 py-2 font-medium">{entry.inputName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{entry.rankLabel}</td>
                      <td className="px-3 py-2 text-muted-foreground">{entry.outputName.replace("A/ ", "")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{entry.buyPrice}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{entry.startPrice}</td>
                      <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">+{entry.priceStep}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => stepTradePrice(entry, -1)}
                            className="h-8 w-8 rounded-md border border-border text-sm font-medium hover:bg-muted"
                          >
                            -
                          </button>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={raw}
                            onChange={(e) =>
                              setCurrentPriceInputs((prev) => ({
                                ...prev,
                                [entry.inputId]: e.target.value.replace(/[^0-9]/g, ""),
                              }))
                            }
                            className={`h-8 w-14 text-right tabular-nums ${isValid ? "" : "border-red-500"}`}
                          />
                          <button
                            type="button"
                            onClick={() => stepTradePrice(entry, 1)}
                            className="h-8 w-8 rounded-md border border-border text-sm font-medium hover:bg-muted"
                          >
                            +
                          </button>
                        </div>
                        {!isValid && (
                          <div className="mt-1 text-[10px] text-red-500">
                            Must follow {entry.startPrice} + n x {entry.priceStep}
                          </div>
                        )}
                      </td>
                      <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{current * entry.buyPrice}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-border bg-background/50 p-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Fun facts</h2>
            <p className="text-xs text-muted-foreground">
              Total Kairo gear and diamonds needed to unlock smithy breaks across bigger equipment collections.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardContent className="p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">All game equipment</div>
                <div className="mt-1 text-sm font-semibold">{allGameFacts.totalKairo} Kairo</div>
                <div className="text-xs text-muted-foreground">
                  {allGameFacts.diamond} diamonds across {allGameFacts.equipmentCount} items
                </div>
                <div className="text-xs text-muted-foreground">Cheapest buy route: {allGameCopper} copper coins</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Every S-rank item</div>
                <div className="mt-1 text-sm font-semibold">{allSFacts.totalKairo} Kairo</div>
                <div className="text-xs text-muted-foreground">
                  {allSFacts.diamond} diamonds across {allSFacts.equipmentCount} items
                </div>
                <div className="text-xs text-muted-foreground">Cheapest buy route: {allSCopper} copper coins</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Every A-rank item</div>
                <div className="mt-1 text-sm font-semibold">{allAFacts.totalKairo} Kairo</div>
                <div className="text-xs text-muted-foreground">
                  {allAFacts.diamond} diamonds across {allAFacts.equipmentCount} items
                </div>
                <div className="text-xs text-muted-foreground">Cheapest buy route: {allACopper} copper coins</div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Custom combination by rank</div>
            <div className="flex flex-wrap gap-2">
              {RANK_TOGGLES.map((rank) => (
                <button
                  key={rank}
                  type="button"
                  onClick={() => toggleFunFactRank(rank)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                    funFactRanks.has(rank) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {rank}
                </button>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
              <Card>
                <CardContent className="p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Custom total</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">{funFacts.totalKairo} Kairo</div>
                  <div className="text-xs text-muted-foreground">
                    {funFacts.diamond} diamonds across {funFacts.equipmentCount} items
                  </div>
                  <div className="text-xs text-muted-foreground">Cheapest buy route: {funFactsCopper} copper coins</div>
                </CardContent>
              </Card>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {KAIRO_OUTPUTS.map((output) => (
                  <div key={output} className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs">
                    <div className="font-medium">{output.replace("A/ ", "")}</div>
                    <div className="mt-1 tabular-nums text-muted-foreground">{funFacts.counts[output]}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
