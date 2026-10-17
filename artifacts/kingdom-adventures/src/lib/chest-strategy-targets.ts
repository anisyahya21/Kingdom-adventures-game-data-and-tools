import catalog from "@/game-data/chest-strategy-targets.json";
import type { StatGoal } from "@/lib/loadout-goal-planner";
import { exactStrategyGoals } from "@/lib/chest-strategy-goals";

export type ChestStrategyOption = {
  id: string;
  encounter: number;
  atk: number;
  spd: number;
  lck: number;
  /** Defaults to the catalog's measured DEX18 baseline. */
  dex?: number;
  mean: number;
  highest: number;
  n: number;
  source: string;
  status?: string;
  seedRange?: number[];
  lowAtMost1?: number;
  defeats?: number;
};

export const CHEST_STRATEGY_OPTIONS = catalog.options as ChestStrategyOption[];

/** Keep a legal profile build separate from measured rewards unless its exact tuple exists. */
export function strategyOptionForProfileBuild(
  option: ChestStrategyOption,
  stats: Record<string, number>,
  evidence?: Pick<ChestStrategyOption, "mean" | "highest" | "n" | "lowAtMost1" | "defeats" | "seedRange"> | null,
): ChestStrategyOption {
  return {
    ...option,
    atk: stats.atk, spd: stats.spd, lck: stats.lck, dex: stats.dex,
    mean: evidence?.mean ?? 0,
    highest: evidence?.highest ?? 0,
    n: evidence?.n ?? 0,
    lowAtMost1: evidence?.lowAtMost1,
    defeats: evidence?.defeats,
    seedRange: evidence?.seedRange,
    source: evidence ? `Fixed research team · seeds ${evidence.seedRange?.join("–") ?? "unknown"}` : "Legal profile build; reward not measured",
    status: evidence ? "Exact profile build tuple has measured reward evidence" : "Profile build tuple; reward unmeasured",
  };
}

/** Search flexibility is a player choice, not a measured combat tolerance. */
export function chestStrategyGoals(
  option: Pick<ChestStrategyOption, "atk" | "spd" | "lck" | "dex">,
  tolerance: Record<"atk" | "spd" | "lck", number>,
): Record<string, StatGoal> {
  // Catalog rewards were measured at DEX18. Exact measured variants carry their own DEX.
  return exactStrategyGoals(option, tolerance);
}
