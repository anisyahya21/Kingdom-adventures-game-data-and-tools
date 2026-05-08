import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemedNumberInput } from "@/components/ui/themed-number-input";
import { matchesLooseSearch } from "@/lib/search-normalize";
import { WAIRO_DUNGEON_LOOT_GROUP } from "@/lib/special-boss-loot";
import {
  wairoRunEnergy,
  encounterExpectedDrops,
  getAllWairoItems,
  type Difficulty,
} from "@/lib/farming-calc";

const ALL_ITEMS = getAllWairoItems();

type ResultRow = {
  difficulty: Difficulty;
  energyPerRun: number;
  expectedPerRun: number;
  energyPerItem: number;
  runsForN: number;
  totalEnergy: number;
};

export function WairoFarmingCalculator() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [maxEnergy, setMaxEnergy] = useState(500);
  const [mines, setMines] = useState(0);
  const [desired, setDesired] = useState(1);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredItems = useMemo(
    () => (query.trim() ? ALL_ITEMS.filter((i) => matchesLooseSearch(i, query)) : ALL_ITEMS),
    [query],
  );

  function selectItem(item: string) {
    setSelectedItem(item);
    setQuery(item);
    setOpen(false);
  }

  const costFactor = Math.max(50 * mines, maxEnergy);
  const minesDominating = 50 * mines > maxEnergy;

  const results = useMemo((): ResultRow[] => {
    if (!selectedItem) return [];
    return WAIRO_DUNGEON_LOOT_GROUP.encounters
      .flatMap((enc) => {
        const energyPerRun = wairoRunEnergy(enc.difficulty, mines, maxEnergy);
        const expectedPerRun = encounterExpectedDrops(enc, selectedItem);
        if (expectedPerRun <= 0) return [];
        const energyPerItem = energyPerRun / expectedPerRun;
        const runsForN = Math.ceil(desired / expectedPerRun);
        return [
          {
            difficulty: enc.difficulty,
            energyPerRun,
            expectedPerRun,
            energyPerItem,
            runsForN,
            totalEnergy: runsForN * energyPerRun,
          } satisfies ResultRow,
        ];
      })
      .sort((a, b) => a.energyPerItem - b.energyPerItem);
  }, [selectedItem, maxEnergy, mines, desired]);

  const best = results[0] ?? null;

  function fmtEnergy(n: number) {
    return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
  }

  return (
    <Card id="wairo-farming-calc" className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="w-4 h-4 text-primary" />
          Farming Calculator
        </CardTitle>
        <CardDescription>
          Expected energy cost to farm a specific drop. Wairo energy cost scales with your max energy and mine count.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inputs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Item combobox */}
          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Target item
            </label>
            <div className="relative" ref={dropRef}>
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter" && filteredItems.length > 0) selectItem(filteredItems[0]);
                }}
                placeholder="Search item…"
                className={`h-9 pr-9 ${open ? "rounded-b-none border-primary ring-1 ring-primary" : ""}`}
                role="combobox"
                aria-expanded={open}
                aria-controls="wairo-item-results"
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen((o) => !o);
                }}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded text-primary hover:bg-primary/10"
                aria-label={open ? "Close item list" : "Open item list"}
              >
                <svg
                  className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                  viewBox="0 0 12 12"
                  fill="none"
                >
                  <path
                    d="M2 4l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {open && (
                <div
                  id="wairo-item-results"
                  className="absolute left-0 right-0 top-full z-50 max-h-64 overflow-y-auto rounded-b-md border border-t-0 border-primary bg-popover shadow-lg"
                >
                  {filteredItems.length === 0 ? (
                    <div className="px-3 py-3 text-center text-xs text-muted-foreground">
                      No matching items
                    </div>
                  ) : (
                    filteredItems.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectItem(item);
                        }}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                          item === selectedItem ? "bg-primary/10 font-medium text-foreground" : ""
                        }`}
                      >
                        <span className="truncate">{item}</span>
                        {item === selectedItem && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Max energy
            </label>
            <ThemedNumberInput value={maxEnergy} min={1} onValueChange={setMaxEnergy} />
            <div className="text-[10px] text-muted-foreground">Storage + town hall total</div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Energy mines
            </label>
            <ThemedNumberInput value={mines} min={0} max={50} onValueChange={setMines} />
            <div className="text-[10px] text-muted-foreground">0 – 50</div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Items wanted
            </label>
            <ThemedNumberInput value={desired} min={1} onValueChange={setDesired} />
          </div>
        </div>

        {/* Cost factor info */}
        <div className="rounded-md border bg-muted/20 px-3 py-2 space-y-2 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">Energy / run formula: </span>
            <span className="font-mono">base × max(50 × mines, max_energy) / 100</span>
          </div>
          <div className="grid gap-1">
            <div>
              Step 1 — inner max:{" "}
              <span className="font-mono">
                max(50 × {mines}, {maxEnergy.toLocaleString()}) = {costFactor.toLocaleString()}
              </span>
              {minesDominating ? (
                <span className="ml-2 text-amber-600 dark:text-amber-400">mines are dominating</span>
              ) : (
                <span className="ml-2">(max energy cap wins)</span>
              )}
            </div>
            <div>
              Step 2 — multiplier:{" "}
              <span className="font-mono">
                {costFactor.toLocaleString()} / 100 = {(costFactor / 100).toFixed(2)}
              </span>
            </div>
            <div className="pt-1 grid gap-0.5">
              {(["Easy", "Normal", "Hard", "Extreme"] as Difficulty[]).map((d) => {
                const bases: Record<Difficulty, number> = { Easy: 60, Normal: 65, Hard: 70, Extreme: 80 };
                const base = bases[d];
                const cost = Math.max(base * costFactor / 100, 1);
                return (
                  <div key={d}>
                    <span className="font-medium text-foreground">{d}:</span>{" "}
                    <span className="font-mono">
                      {base} × {(costFactor / 100).toFixed(2)} = {cost % 1 === 0 ? cost.toLocaleString() : cost.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Results */}
        {!selectedItem ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Select a target item above to see farming efficiency across Wairo Dungeon difficulties.
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {selectedItem} does not drop in any Wairo Dungeon difficulty.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Difficulty</th>
                  <th className="px-3 py-2 text-right font-medium">Energy / run</th>
                  <th className="px-3 py-2 text-right font-medium">Avg / run</th>
                  <th className="px-3 py-2 text-right font-medium">Energy / item</th>
                  <th className="px-3 py-2 text-right font-medium">Runs for {desired}</th>
                  <th className="px-3 py-2 text-right font-medium">Total energy</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => {
                  const isBest = row === best;
                  return (
                    <tr
                      key={row.difficulty}
                      className={`border-t border-border/60 ${isBest ? "bg-green-500/10" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[11px]">
                            {row.difficulty}
                          </Badge>
                          {isBest && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-green-500/50 text-green-600 dark:text-green-400"
                            >
                              Best
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtEnergy(row.energyPerRun)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {row.expectedPerRun >= 0.001
                          ? row.expectedPerRun.toFixed(4)
                          : row.expectedPerRun.toExponential(2)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-semibold ${
                          isBest ? "text-green-600 dark:text-green-400" : "text-foreground"
                        }`}
                      >
                        {Math.round(row.energyPerItem).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {row.runsForN.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {Math.round(row.totalEnergy).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {results.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Energy / run = base cost × max(50 × mines, max energy) ÷ 100. Each run picks one of two loot tables at random (50/50 assumed).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
