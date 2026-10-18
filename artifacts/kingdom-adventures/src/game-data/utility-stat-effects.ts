import type { StatKey } from "@/game-data/stat-parameter-ids";

/** Code-backed world-work consumers; evidence: skill-catalog-audit.md,
 * skills-and-utility-stats.md and wagon-and-fog.md. Not an exhaustive combat guide.
 */
export const UTILITY_STAT_EFFECTS: { key: StatKey; name: string; effect: string; training: string }[] = [
  { key: "vig", name: "Vigor", effect: "A resident's activity reserve. Empty Vigor halves ordinary travel speed unless the dash branch applies, including All-Out Sprint.", training: "A larger reserve supports longer activity; Auto Recovery Vigor restores 5 points per pulse. Deployment instead spends Energy, a separate resource; Deployment Discount reduces that Energy cost." },
  { key: "int", name: "Intelligence", effect: "Must meet a product's crafting requirement. Treasure analysis uses a work divisor of max(1, floor(INT / 5)).", training: "Crafting requirements are thresholds. The analysis divisor increases in steps of 5 INT from 10 onward; this divisor is not a universal workshop-speed bonus." },
  { key: "dex", name: "Dexterity", effect: "Adds its value to structure HP on a repair work update. Wasteland-restoration work uses DEX scaled by a random 80–120%, with Agriculturist doubling the result.", training: "More DEX increases work per update, until the target's remaining work is finished. Travel, work cadence and available jobs remain separate limits." },
  { key: "gth", name: "Gathering", effect: "Raises the collection-success roll from 10% at 0 to 40% at 999. With Agriculturist, it also lowers eligible crop production's time rate by 10–50 percentage points.", training: "999 reaches the top of these two curves. Extra Gathering gives no further benefit in these paths; it does not turn this collection roll into guaranteed success. This is not a global stat cap or a bonus to every workshop." },
  { key: "mov", name: "Move", effect: "Limits cargo amounts for wagon transport, ordinary lifting and construction-material supply. One point permits one material unit, one deposited coin, or one matching stored item in the inspected wagon paths. It does not determine walking speed.", training: "For positive Move, each wagon pickup takes min(Move, stock in the selected source container). A box with 3 million copper coins gives Move coins per pickup until nearly empty. A warehouse with 300 identical items can give all 300 only when Move reaches 300." },
  { key: "hrt", name: "Heart", effect: "Deals damage to fog each clearing pulse and feeds survey success calculations. It does not itself enlarge fog-clearing range.", training: "Fog needs ceil(remaining HP / Heart) pulses. Once Heart can clear a target in one pulse, more Heart cannot clear that target faster. Survey thresholds depend on the survey and prior successes." },
];

// Graph.Easing strength 0: original float32 divide, multiply and add, then trunc.
function nativeLinear(start: number, end: number, term: number, input: number) {
  if (input < 0) return start;
  if (input >= term) return end;
  const ratio = Math.fround(Math.fround(input) / Math.fround(term));
  return Math.max(start, Math.min(end, Math.trunc(Math.fround(Math.fround(Math.fround(end - start) * ratio) + start))));
}
export function freshFogHp(areaLevel: number): number {
  const level = Math.max(1, Math.trunc(areaLevel));
  const mappedLevel = nativeLinear(1, 100, 499, level - 1);
  return nativeLinear(100, 1000, 99, mappedLevel - 1);
}
export function fogPulses(hp: number, heart: number): number | null {
  if (hp <= 0) return 0;
  return heart > 0 ? Math.ceil(hp / heart) : null;
}
export function wagonMaterialLoad(move: number, stock: number): number {
  return Math.max(0, Math.min(Math.trunc(move), Math.trunc(stock)));
}
