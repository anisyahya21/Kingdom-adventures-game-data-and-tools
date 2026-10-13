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

/** Search flexibility is a player choice, not a measured combat tolerance. */
export function chestStrategyGoals(
  option: Pick<ChestStrategyOption, "atk" | "spd" | "lck" | "dex">,
  tolerance: Record<"atk" | "spd" | "lck", number>,
): Record<string, StatGoal> {
  // Catalog rewards were measured at DEX18. Exact measured variants carry their own DEX.
  return exactStrategyGoals(option, tolerance);
}
