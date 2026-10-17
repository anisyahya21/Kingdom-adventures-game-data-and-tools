type SearchTolerance = Record<"atk" | "spd" | "lck", number>;
type StrategyStats = Pick<{ atk: number; spd: number; lck: number; dex?: number }, "atk" | "spd" | "lck" | "dex">;

/** Map one exact strategy tuple and optional search margins to four stat ranges. */
export function exactStrategyGoals(option: StrategyStats, tolerance: SearchTolerance) {
  const goals = Object.fromEntries(([
    ["atk", option.atk],
    ["spd", option.spd],
    ["lck", option.lck],
  ] as const).map(([stat, value]) => {
    const margin = Math.max(0, Math.trunc(Number.isFinite(tolerance[stat]) ? tolerance[stat] : 0));
    return [stat, { mode: "range" as const, min: Math.max(0, value - margin), max: value + margin }];
  }));
  const dex = option.dex ?? 18;
  return { ...goals, dex: { mode: "range" as const, min: dex, max: dex } };
}
