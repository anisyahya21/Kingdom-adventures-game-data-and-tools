import { normalizedMaxDeviation, searchProfileGoalBuildPages, type ProfileGoalBuild, type ProfileGoalSearchInput } from "./profile-loadout-goal-planner";

export type StrategyMatchTarget = { id: string; atk: number; spd: number; lck: number; dex?: number };
export type ProfileStrategyMatch = { id: string; build: ProfileGoalBuild | null; complete: boolean; searchNodes: number; builds?: ProfileGoalBuild[] };
export function measuredStrategyTargetId(encounter: string | number, stats: readonly number[]): string {
  if (stats.length !== 4 || stats.some((value) => !Number.isSafeInteger(value))) throw new Error("Measured strategy targets require four integer stats.");
  return `measured:${encounter}:${stats.join(":")}`;
}

export function isExactStrategyBuild(build: ProfileGoalBuild | null, target: StrategyMatchTarget): boolean {
  return !!build && build.stats.atk === target.atk && build.stats.spd === target.spd && build.stats.lck === target.lck && build.stats.dex === (target.dex ?? 18);
}

export function strategyMatchDeviation(match: ProfileStrategyMatch, target: StrategyMatchTarget): number {
  if (!match.build) return Infinity;
  return normalizedMaxDeviation(match.build.stats, {
    atk: target.atk, spd: target.spd, lck: target.lck, dex: target.dex ?? 18,
  });
}

const MAX_CURRENT_LEVEL_WARM_START_NODES = 5_000;
const MAX_STRATEGY_MATCH_BUILDS = 40;

function profileBuildKey(build: ProfileGoalBuild): string {
  return JSON.stringify([
    build.characterId,
    build.jobName,
    build.rank,
    [...build.picks].map(({ slot, item, level }) => [slot, item, level]).sort((a, b) =>
      String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])) || Number(a[2]) - Number(b[2])),
    build.skills ?? [],
  ]);
}

function mergeStrategyFrontiers(
  frontiers: readonly ProfileGoalBuild[][],
  target: StrategyMatchTarget,
  maximizeStats: Array<"hp" | "mp" | "def">,
): ProfileGoalBuild[] {
  const byIdentity = new Map<string, ProfileGoalBuild>();
  for (const frontier of frontiers) {
    for (const build of frontier) {
      const key = profileBuildKey(build);
      if (!byIdentity.has(key)) byIdentity.set(key, build);
    }
  }
  const builds = [...byIdentity.values()];
  const deviation = (build: ProfileGoalBuild) => strategyMatchDeviation({ id: target.id, build, complete: false, searchNodes: 0 }, target);
  const dominatesSurvival = (a: ProfileGoalBuild, b: ProfileGoalBuild) =>
    maximizeStats.length > 0
    && maximizeStats.every((stat) => (a.stats[stat] ?? 0) >= (b.stats[stat] ?? 0))
    && maximizeStats.some((stat) => (a.stats[stat] ?? 0) > (b.stats[stat] ?? 0));
  const survivalRanks = new Map(builds.map((build) => [build, builds.reduce((count, other) =>
    count + Number(other !== build && deviation(other) === deviation(build) && dominatesSurvival(other, build)), 0)]));
  return builds.sort((a, b) =>
    deviation(a) - deviation(b)
    || (a.targetDistance ?? deviation(a)) - (b.targetDistance ?? deviation(b))
    || (survivalRanks.get(a) ?? 0) - (survivalRanks.get(b) ?? 0)
    || (a.addedLevels ?? 0) - (b.addedLevels ?? 0)
    || a.picks.length - b.picks.length
    || profileBuildKey(a).localeCompare(profileBuildKey(b)));
}

function strategyContextKey(build: ProfileGoalBuild): string {
  return JSON.stringify([build.characterId, build.jobName, build.rank, build.skills ?? []]);
}

function limitStrategyFrontier(
  frontiers: readonly ProfileGoalBuild[][],
  target: StrategyMatchTarget,
  maximizeStats: Array<"hp" | "mp" | "def">,
): ProfileGoalBuild[] {
  const ranked = mergeStrategyFrontiers(frontiers, target, maximizeStats);
  if (ranked.length <= MAX_STRATEGY_MATCH_BUILDS) return ranked;
  const selected = new Set<ProfileGoalBuild>();
  const contexts = new Set<string>();
  for (const build of ranked) {
    const context = strategyContextKey(build);
    if (contexts.has(context)) continue;
    contexts.add(context);
    selected.add(build);
    if (selected.size >= MAX_STRATEGY_MATCH_BUILDS) break;
  }
  for (const build of ranked) {
    if (selected.size >= MAX_STRATEGY_MATCH_BUILDS) break;
    selected.add(build);
  }
  return ranked.filter((build) => selected.has(build));
}

function primaryCurrentContexts(characters: ProfileGoalSearchInput["characters"]): ProfileGoalSearchInput["characters"] {
  const groups = new Map<string, ProfileGoalSearchInput["characters"][number]>();
  for (const character of characters) {
    if (!character.available || !character.eligible) continue;
    const key = JSON.stringify([character.id, character.jobName, character.rank]);
    const previous = groups.get(key);
    const skills = character.skills ?? [];
    const previousSkills = previous?.skills ?? [];
    if (!previous || skills.length < previousSkills.length
      || skills.length === previousSkills.length && skills.join("\u0000").localeCompare(previousSkills.join("\u0000")) < 0) {
      groups.set(key, character);
    }
  }
  return [...groups.values()];
}

/** Reuse the legal owned-gear planner; a bounded search never proves that a target is impossible. */
export async function* compareProfileStrategies(input: ProfileGoalSearchInput, targets: StrategyMatchTarget[], upgrades: boolean, maxSearchNodes = 1_000_000, maximizeStats: Array<"hp" | "mp" | "def"> = []) {
  const search = { ...input, characters: input.characters.map((character) => ({ ...character, input: { ...character.input, goals: Object.fromEntries(maximizeStats.filter((stat) => ["hp", "mp", "def"].includes(stat)).map((stat) => [stat, { mode: "maximize" as const }])) } })) };
  const matches: ProfileStrategyMatch[] = [];
  for (const target of targets) {
    if (upgrades && Number.isFinite(maxSearchNodes) && maxSearchNodes > 0) {
      const currentBudget = Math.min(MAX_CURRENT_LEVEL_WARM_START_NODES, Math.floor(maxSearchNodes));
      const currentContexts = primaryCurrentContexts(search.characters);
      const currentFrontiers: ProfileGoalBuild[][] = [];
      let currentNodes = 0;
      let plannerBudget = currentBudget;

      for (let contextIndex = 0; contextIndex < currentContexts.length && plannerBudget > 0; contextIndex += 1) {
        const character = currentContexts[contextIndex];
        const contextsLeft = currentContexts.length - contextIndex;
        const contextBudget = Math.max(1, Math.ceil(plannerBudget / contextsLeft));
        let contextNodes = 0;
        let contextFrontier: ProfileGoalBuild[] = [];
        for await (const page of searchProfileGoalBuildPages({ characters: [character], inventory: search.inventory }, {
          nearestTargets: { atk: target.atk, spd: target.spd, lck: target.lck, dex: target.dex ?? 18 },
          inventoryPolicy: "owned-current", includeCurrentBuilds: true,
          maxSearchNodes: contextBudget, pageSize: 40, nodeSliceSize: 20_000,
        })) {
          contextNodes = page.searchNodes;
          contextFrontier = page.builds;
          if (page.complete || page.limited || page.cancelled) break;
        }
        if (contextFrontier.length) currentFrontiers.push(contextFrontier);
        currentNodes += contextNodes;
        plannerBudget = Math.max(0, plannerBudget - contextNodes);

        if (contextIndex === currentContexts.length - 1 || plannerBudget <= 0) {
          const currentFrontier = limitStrategyFrontier(currentFrontiers, target, maximizeStats);
          yield {
            matches: [...matches, { id: target.id, build: currentFrontier[0] ?? null, complete: false, searchNodes: currentNodes, builds: currentFrontier }],
            completed: matches.length, total: targets.length, complete: false,
          };
        }
      }

      let currentFrontier = limitStrategyFrontier(currentFrontiers, target, maximizeStats);
      const currentExactFound = !maximizeStats.length && currentFrontier.some((build) =>
        strategyMatchDeviation({ id: target.id, build, complete: false, searchNodes: 0 }, target) === 0);
      if (currentExactFound) {
        const combined = limitStrategyFrontier([currentFrontier], target, maximizeStats);
        matches.push({ id: target.id, build: combined[0] ?? null, complete: true, searchNodes: currentNodes, builds: combined });
        continue;
      }

      const remainingBudget = Math.max(0, Math.floor(maxSearchNodes) - currentNodes);
      let upgradeFrontier: ProfileGoalBuild[] = [];
      let upgradeNodes = 0;
      let upgradeComplete = false;
      let exactBuildFound = false;
      if (remainingBudget > 0) {
        for await (const page of searchProfileGoalBuildPages(search, {
          nearestTargets: { atk: target.atk, spd: target.spd, lck: target.lck, dex: target.dex ?? 18 },
          inventoryPolicy: "owned-upgrades", includeCurrentBuilds: true,
          maxSearchNodes: remainingBudget, pageSize: 40, nodeSliceSize: 20_000,
        })) {
          upgradeFrontier = page.builds;
          upgradeNodes = page.searchNodes;
          upgradeComplete = page.complete;
          const combined = limitStrategyFrontier([currentFrontier, upgradeFrontier], target, maximizeStats);
          const best = combined[0] ?? null;
          exactBuildFound = !maximizeStats.length && combined.some((build) => strategyMatchDeviation({ id: target.id, build, complete: false, searchNodes: 0 }, target) === 0);
          yield {
            matches: [...matches, { id: target.id, build: best, complete: false, searchNodes: currentNodes + upgradeNodes, builds: combined }],
            completed: matches.length, total: targets.length, complete: false,
          };
          if (page.complete || page.limited || page.cancelled || exactBuildFound) break;
        }
      }
      const combined = limitStrategyFrontier([currentFrontier, upgradeFrontier], target, maximizeStats);
      const complete = upgradeComplete || exactBuildFound;
      matches.push({ id: target.id, build: combined[0] ?? null, complete, searchNodes: currentNodes + upgradeNodes, builds: combined });
      continue;
    }
    let match: ProfileStrategyMatch = { id: target.id, build: null, complete: false, searchNodes: 0 };
    let alternatives: ProfileGoalBuild[] = [];
    let finalFrontier = false;
    for await (const page of searchProfileGoalBuildPages(search, {
      nearestTargets: { atk: target.atk, spd: target.spd, lck: target.lck, dex: target.dex ?? 18 },
      inventoryPolicy: upgrades ? "owned-upgrades" : "owned-current", includeCurrentBuilds: upgrades,
      maxSearchNodes, pageSize: 40, nodeSliceSize: 20_000,
    })) {
      if (maximizeStats.length) {
        if (!page.limited && page.completedCharacters === page.totalCharacters) {
          if (!finalFrontier) { alternatives = []; finalFrontier = true; }
          alternatives.push(...page.builds);
        } else alternatives = page.builds;
      }
      const best = (maximizeStats.length ? alternatives : page.builds).reduce<ProfileGoalBuild | null>((current, build) => {
        if (!current) return build;
        const deviation = (candidate: ProfileGoalBuild) => strategyMatchDeviation({ ...match, build: candidate }, target);
        const betterSurvival = maximizeStats.every((stat) => (build.stats[stat] ?? 0) >= (current.stats[stat] ?? 0))
          && maximizeStats.some((stat) => (build.stats[stat] ?? 0) > (current.stats[stat] ?? 0));
        return deviation(build) < deviation(current)
          || deviation(build) === deviation(current) && (
            (build.targetDistance ?? Infinity) < (current.targetDistance ?? Infinity)
            || (build.targetDistance ?? Infinity) === (current.targetDistance ?? Infinity) && betterSurvival
          ) ? build : current;
      }, maximizeStats.length ? null : match.build);
      match = { id: target.id, build: best, complete: page.complete, searchNodes: page.searchNodes, ...(maximizeStats.length ? { builds: alternatives } : {}) };
      yield { matches: [...matches, match], completed: matches.length, total: targets.length, complete: false };
      // An exact match proves existence without exhausting every gear combination.
      if ((!maximizeStats.length && best && strategyMatchDeviation(match, target) === 0) || page.complete || page.limited) break;
    }
    matches.push(match);
  }
  yield { matches, completed: targets.length, total: targets.length, complete: true };
}
