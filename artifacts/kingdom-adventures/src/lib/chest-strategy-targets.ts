import catalog from "@/game-data/chest-strategy-targets.json";
import type { StatGoal } from "@/lib/loadout-goal-planner";

export type ChestStrategyOption = {
  id: string;
  encounter: number;
  atk: number;
  spd: number;
  lck: number;
  mean: number;
  highest: number;
  n: number;
  source: string;
};

export const CHEST_STRATEGY_OPTIONS = catalog.options as ChestStrategyOption[];

/** Search flexibility is a player choice, not a measured combat tolerance. */
export function chestStrategyGoals(
  option: Pick<ChestStrategyOption, "atk" | "spd" | "lck">,
  tolerance: Record<"atk" | "spd" | "lck", number>,
): Record<string, StatGoal> {
  return Object.fromEntries((["atk", "spd", "lck"] as const).map((stat) => {
    const margin = Math.max(0, Math.trunc(Number.isFinite(tolerance[stat]) ? tolerance[stat] : 0));
    return [stat, { mode: "range", min: Math.max(0, option[stat] - margin), max: option[stat] + margin }];
  }));
}
