import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Calculator, ChevronDown, ChevronUp, Info, Minus, Skull } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ALL_AREA_LEVELS, XP_TERRAINS, XP_UP_BONUSES, getXpResult, nativeTerrainAtLevel, type XpTerrain } from "@/lib/monster-xp";
import { getSkillIcon } from "@/lib/skill-icons";

const terrainLabels: Record<XpTerrain, string> = {
  "Ground/dirt": "Ground / dug dirt",
  Grass: "Grass",
  Sand: "Sand",
  Rock: "Rock",
  Snow: "Snow",
  Swamp: "Swamp",
  Volcano: "Volcano",
};

const formatXp = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });

function ComparisonArrow({ value, comparison }: { value: number; comparison?: number }) {
  if (comparison == null || value === comparison) return <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-label="Equal" />;
  if (value > comparison) return <ArrowUp className="h-4 w-4 text-emerald-500" aria-label="Higher than comparison" />;
  return <ArrowDown className="h-4 w-4 text-red-500" aria-label="Lower than comparison" />;
}

function ResultCard({ result, comparison }: { result: ReturnType<typeof getXpResult>; comparison?: ReturnType<typeof getXpResult> }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-border/70 bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{terrainLabels[result.terrain]}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{result.monsters.length} combat monsters in the pool</p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-2xl font-bold text-violet-500"><ComparisonArrow value={result.averageXp} comparison={comparison?.averageXp} />{formatXp(result.averageXp)}</div>
            <div className="text-[11px] text-muted-foreground">average XP / kill</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted/40 p-2"><span className="text-muted-foreground">Range</span><div className="font-medium">{formatXp(result.minXp)} - {formatXp(result.maxXp)}</div></div>
          <div className="rounded-md bg-muted/40 p-2"><span className="text-muted-foreground">Avg. stat multiplier</span><div className="font-medium">{result.averageMultiplier.toFixed(3)}</div></div>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-xs">
          <div className="mb-2 font-medium">Average XP by stat per kill</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            {(["HP", "MP", "Vigor", "Atk", "Def", "Spd", "Luck"] as const).map((stat) => <div key={stat} className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{stat}</span><span className="flex items-center gap-1 font-medium"><ComparisonArrow value={result.statXp[stat]} comparison={comparison?.statXp[stat]} />{formatXp(result.statXp[stat])}</span></div>)}
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-full justify-between px-2 text-xs" onClick={() => setOpen((value) => !value)}>
          <span>Show eligible monsters</span>{open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
        {open && <div className="grid grid-cols-1 gap-1 border-t border-border/60 pt-2 text-xs sm:grid-cols-2">{result.monsters.map((monster) => <div key={monster.id} className="flex justify-between gap-2"><span>{monster.name}</span><span className="text-muted-foreground">{formatXp(30 * monster.averageMultiplier * result.level / 100 * result.bonusMultiplier)}</span></div>)}</div>}
      </CardContent>
    </Card>
  );
}

export default function MonsterXpPage() {
  const [level, setLevel] = useState<number | "">("");
  const [enabledXpUps, setEnabledXpUps] = useState<number[]>([]);
  const [showAll, setShowAll] = useState(false);
  const results = useMemo(() => level === "" ? [] : nativeTerrainAtLevel(level).map((terrain) => getXpResult(terrain, level, enabledXpUps)), [level, enabledXpUps]);
  const allRows = useMemo(() => ALL_AREA_LEVELS.flatMap((areaLevel) => nativeTerrainAtLevel(areaLevel).map((terrain) => ({ areaLevel, result: getXpResult(terrain, areaLevel, enabledXpUps) }))), [enabledXpUps]);

  const toggleXpUp = (skill: number) => setEnabledXpUps((current) => current.includes(skill) ? current.filter((value) => value !== skill) : [...current, skill].sort());

  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><Calculator className="h-5 w-5 text-violet-500" />Monster XP per kill</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Expected battle XP by area level and terrain. The game chooses one non-zero exp stat at random, so each monster uses the average of its non-zero exp values.</p>
          </div>
          <Skull className="hidden h-8 w-8 text-muted-foreground/30 sm:block" />
        </div>

        <Card className="mb-6 border-violet-500/20 bg-violet-500/5">
          <CardContent className="grid gap-5 p-4 md:grid-cols-[180px_1fr] md:items-end">
            <label className="text-sm font-medium">Area level<Input type="number" min={1} max={9999} placeholder="e.g. 3200" value={level} onChange={(event) => { const value = event.target.value; setLevel(value === "" ? "" : Math.max(1, Math.min(9999, Number(value)))); }} className="mt-1" /></label>
            <div>
              <div className="mb-2 text-sm font-medium">XP Up skills</div>
              <div className="flex flex-wrap gap-2">{([1, 2, 3] as const).map((skill) => { const icon = getSkillIcon(`Experience UP ${skill === 1 ? "I" : skill === 2 ? "II" : "III"}`); return <Button key={skill} type="button" variant={enabledXpUps.includes(skill) ? "default" : "outline"} size="sm" onClick={() => toggleXpUp(skill)}>{icon && <img src={icon} alt="" className="h-5 w-5 rounded-sm object-contain" />}XP Up {skill} <span className="ml-1 opacity-70">×{XP_UP_BONUSES[skill].toFixed(2)}</span></Button>; })}</div>
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" />XP Up bonuses multiply together. Active multiplier: ×{enabledXpUps.reduce((product, skill) => product * XP_UP_BONUSES[skill as 1 | 2 | 3], 1).toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>

        <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">{level === "" ? "Choose an area level" : `Level ${level} results`}</h2><p className="text-xs text-muted-foreground">Ground/dirt represents digging at this area level. Other rows appear when that biome exists at this exact level.</p><p className="mt-1 text-xs text-muted-foreground">Green arrows indicate a higher value than the other available terrain; red arrows indicate a lower value.</p></div></div>
        {level === "" ? <Card className="border-border/70 bg-card/80"><CardContent className="p-6 text-sm text-muted-foreground">Enter an area level to compare Ground/dirt with the biome available at that level.</CardContent></Card> : <div className="grid gap-4 md:grid-cols-2">{results.map((result) => <ResultCard key={result.terrain} result={result} comparison={results.find((other) => other.terrain !== result.terrain)} />)}</div>}

        <Card className="mt-6 border-border/70 bg-card/80">
          <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle className="text-base">All native area levels</CardTitle><p className="mt-1 text-xs text-muted-foreground">Combat-only pools. Type 1 entries from Monster.csv are excluded as farmable animals.</p></div><Button variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>{showAll ? "Hide table" : "Show table"}</Button></CardHeader>
          {showAll && <CardContent className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-border/60 text-xs text-muted-foreground"><th className="p-2">Area level</th><th className="p-2">Terrain</th><th className="p-2 text-right">Monsters</th><th className="p-2 text-right">Average XP / kill</th><th className="p-2 text-right">Range</th></tr></thead><tbody>{allRows.map(({ areaLevel, result }) => <tr key={`${areaLevel}-${result.terrain}`} className="border-b border-border/40"><td className="p-2 font-medium">{areaLevel}</td><td className="p-2">{terrainLabels[result.terrain]}</td><td className="p-2 text-right">{result.monsters.length}</td><td className="p-2 text-right font-medium text-violet-500">{formatXp(result.averageXp)}</td><td className="p-2 text-right text-muted-foreground">{formatXp(result.minXp)} - {formatXp(result.maxXp)}</td></tr>)}</tbody></table></CardContent>}
        </Card>
      </div>
    </div>
  );
}
