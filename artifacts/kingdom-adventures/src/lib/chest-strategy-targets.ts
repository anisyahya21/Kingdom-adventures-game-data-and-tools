import catalog from "@/game-data/chest-strategy-targets.json";
import type { StatGoal } from "@/lib/loadout-goal-planner";
import { exactStrategyGoals } from "@/lib/chest-strategy-goals";

export type ChestStrategyOption = {
  id: string;
  encounter: number;
  atk: number;
  spd: number;
  lck: number;
  /** Explicit DEX used by this measured configuration. */
  dex: number;
  mean: number;
  highest: number;
  n: number;
  median?: number;
  source: string;
  status?: string;
  seedRange?: number[];
  lowAtMost1?: number;
  defeats?: number;
  setupId?: string;
  mpMode?: "sufficient";
  meanDpsMp?: number;
  meanHealerMp?: number;
  sourceCohort?: string;
};

type StrategyEvidenceKey = "mean" | "highest" | "n" | "median" | "lowAtMost1" | "defeats" | "seedRange" | "setupId" | "mpMode" | "meanDpsMp" | "meanHealerMp" | "sourceCohort";
export type ChestStrategyOptionTarget = Omit<ChestStrategyOption, StrategyEvidenceKey> & Partial<Pick<ChestStrategyOption, StrategyEvidenceKey>>;

export const CHEST_STRATEGY_OPTIONS = catalog.options as ChestStrategyOption[];

/** Keep a legal profile build separate from measured rewards unless its exact tuple exists. */
export function strategyOptionForProfileBuild(
  option: ChestStrategyOption,
  stats: Record<string, number>,
  evidence?: Partial<Pick<ChestStrategyOption, StrategyEvidenceKey>> | null,
): ChestStrategyOptionTarget {
  return {
    ...option,
    atk: stats.atk, spd: stats.spd, lck: stats.lck, dex: stats.dex,
    mean: evidence?.mean,
    highest: evidence?.highest,
    n: evidence?.n,
    median: evidence?.median,
    lowAtMost1: evidence?.lowAtMost1,
    defeats: evidence?.defeats,
    seedRange: evidence?.seedRange,
    setupId: evidence?.setupId,
    mpMode: evidence?.mpMode,
    meanDpsMp: evidence?.meanDpsMp,
    meanHealerMp: evidence?.meanHealerMp,
    sourceCohort: evidence?.sourceCohort,
    source: evidence ? `Fixed research team · seeds ${evidence.seedRange?.join("–") ?? "unknown"}` : "Legal profile build; reward not measured",
    status: evidence ? "Exact profile build tuple has measured reward evidence" : "Profile build tuple; reward unmeasured",
  };
}

/** Search flexibility is a player choice, not a measured combat tolerance. */
export function chestStrategyGoals(
  option: Pick<ChestStrategyOption, "atk" | "spd" | "lck" | "dex">,
  tolerance: Record<"atk" | "spd" | "lck", number>,
): Record<string, StatGoal> {
  // Every catalog target carries its explicitly measured four-stat tuple.
  return exactStrategyGoals(option, tolerance);
}
