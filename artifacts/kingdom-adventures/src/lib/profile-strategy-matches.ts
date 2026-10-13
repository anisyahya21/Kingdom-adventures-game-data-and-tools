import { searchProfileGoalBuildPages, type ProfileGoalBuild, type ProfileGoalSearchInput } from "./profile-loadout-goal-planner";

export type StrategyMatchTarget = { id: string; atk: number; spd: number; lck: number };
export type ProfileStrategyMatch = { id: string; build: ProfileGoalBuild | null; complete: boolean; searchNodes: number };
export function strategyMatchDeviation(match: ProfileStrategyMatch, target: StrategyMatchTarget): number {
  if (!match.build) return Infinity;
  return Math.max(...(["atk", "spd", "lck"] as const).map((stat) => Math.abs(match.build!.stats[stat] - target[stat]) / Math.max(1, target[stat])));
}

/** Reuse the legal owned-gear planner; a bounded search never proves that a target is impossible. */
export async function* compareProfileStrategies(input: ProfileGoalSearchInput, targets: StrategyMatchTarget[], upgrades: boolean, maxSearchNodes = 1_000_000) {
  const search = { ...input, characters: input.characters.map((character) => ({ ...character, input: { ...character.input, goals: {} } })) };
  const matches: ProfileStrategyMatch[] = [];
  for (const target of targets) {
    let match: ProfileStrategyMatch = { id: target.id, build: null, complete: false, searchNodes: 0 };
    for await (const page of searchProfileGoalBuildPages(search, {
      nearestTargets: { atk: target.atk, spd: target.spd, lck: target.lck },
      inventoryPolicy: upgrades ? "owned-upgrades" : "owned-current", includeCurrentBuilds: upgrades,
      maxSearchNodes, pageSize: 40, nodeSliceSize: 20_000,
    })) {
      const best = page.builds.reduce<ProfileGoalBuild | null>((current, build) => {
        if (!current) return build;
        const deviation = (candidate: ProfileGoalBuild) => strategyMatchDeviation({ ...match, build: candidate }, target);
        return deviation(build) < deviation(current) || deviation(build) === deviation(current) && (build.targetDistance ?? Infinity) < (current.targetDistance ?? Infinity) ? build : current;
      }, match.build);
      match = { id: target.id, build: best, complete: page.complete, searchNodes: page.searchNodes };
      yield { matches: [...matches, match], completed: matches.length, total: targets.length, complete: false };
      // An exact match proves existence without exhausting every gear combination.
      if ((best && strategyMatchDeviation(match, target) === 0) || page.complete || page.limited) break;
    }
    matches.push(match);
  }
  yield { matches, completed: targets.length, total: targets.length, complete: true };
}
