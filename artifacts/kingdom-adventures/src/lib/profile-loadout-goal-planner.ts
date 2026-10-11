import type {
  PlannerInput,
  PlannerPick,
  StatGoal,
} from "@/lib/loadout-goal-planner";

export type ProfileStatGoal = StatGoal | { mode: "maximize" };
export type ProfileGoalMode = ProfileStatGoal["mode"];

/** One profile character/build context prepared with the ordinary builder rules. */
export type ProfileGoalSearchCharacter = {
  id: string;
  name: string;
  skills?: string[];
  skillItems?: Record<string, string[]>;
  /** The candidate job/rank, when the caller is searching more than the saved one. */
  jobName?: string;
  rank?: string;
  /** Caller preflights availability, job/rank access, valuables, and builder gear access here. */
  input: Omit<PlannerInput, "goals"> & { goals: Record<string, ProfileStatGoal | undefined> };
  available: boolean;
  eligible: boolean;
};

/** One account-wide equipment type and its recorded shared upgrade level. */
export type ProfileGoalInventoryItem = {
  item: string;
  ownership: "owned" | "unowned" | "unknown";
  currentLevel: number | null;
  quantity?: number;
};

export type ProfileGoalSearchInput = {
  characters: ProfileGoalSearchCharacter[];
  inventory: ProfileGoalInventoryItem[];
};

export type ProfileGoalBuild = {
  characterId: string;
  characterName: string;
  skills?: string[];
  jobName?: string;
  rank?: string;
  /** Empty slots are omitted. Item levels are recorded current levels or requested upgrades. */
  picks: PlannerPick[];
  stats: Record<string, number>;
  /** Sum of levels added across selected items; always 0 in the owned-current pass. */
  addedLevels: number;
  /** Sum of relative deviations from the selected measured DPS point. */
  targetDistance?: number;
  requiredUpgrades: Array<{ item: string; currentLevel: number; requiredLevel: number; addedLevels: number }>;
};

export type ProfileGoalSearchPage = {
  builds: ProfileGoalBuild[];
  /** Matching builds found since this search started, including pages already consumed. */
  matchingBuilds: number;
  /** Profile-level slot choices visited so far; this is a real count, not an estimate. */
  searchNodes: number;
  inventoryPolicy: "owned-current" | "owned-upgrades";
  completedCharacters: number;
  totalCharacters: number;
  complete: boolean;
  cancelled?: boolean;
  limited?: boolean;
  /** Maximization pages are provisional until the search has been exhausted. */
  optimizing?: boolean;
};

export type ProfileGoalSearchOptions = {
  /** `owned-upgrades` explores every integer level from the recorded level through the builder cap. */
  inventoryPolicy?: "owned-current" | "owned-upgrades";
  /** Include current-only builds in the upgrade search. Legacy upgrade-only callers keep false. */
  includeCurrentBuilds?: boolean;
  /** Maximum matching builds retained in one yielded page. Default: 50. */
  pageSize?: number;
  /** Maximum DFS nodes processed before yielding to the event loop. Default: 1,000. */
  nodeSliceSize?: number;
  signal?: AbortSignal;
  nearestTargets?: Record<string, number>;
  maxSearchNodes?: number;
};

type OwnedLevel = { level: number; quantity: number };
type Candidate = { item: string; currentLevel: number; level: number; contribution: Record<string, number> };
type SearchEvent = { kind: "node" } | { kind: "build"; build: ProfileGoalBuild };

function clampPositiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(value!)));
}

function ownedCurrentLevels(inventory: ProfileGoalInventoryItem[]): Map<string, OwnedLevel> {
  const items = new Map<string, OwnedLevel>();
  for (const row of inventory) {
    if (row.ownership !== "owned" || !row.item.trim()) continue;
    if (!Number.isInteger(row.currentLevel) || row.currentLevel! < 1 || row.currentLevel! > 99) continue;
    if (row.quantity !== undefined && (!Number.isInteger(row.quantity) || row.quantity < 1)) continue;
    const previous = items.get(row.item);
    const level = row.currentLevel!;
    const quantity = row.quantity ?? 1;
    if (!previous) {
      items.set(row.item, { level, quantity });
    } else {
      // A profile normally has one shared-level stack per item type. If duplicate rows arrive,
      // preserve the model's conservative shared level and combined owned-copy count.
      items.set(row.item, {
        level: Math.max(previous.level, level),
        quantity: Math.min(999, previous.quantity + quantity),
      });
    }
  }
  return items;
}

function goalKeys(goals: Record<string, ProfileStatGoal | undefined>): string[] {
  return Object.keys(goals).filter((stat) => goals[stat] !== undefined);
}

function isSatisfied(goal: ProfileStatGoal | undefined, value: number): boolean {
  if (!goal) return true;
  if (goal.mode === "maximize") return true;
  if (goal.mode === "min") return value >= (goal.min ?? 0);
  if (goal.mode === "max") return value <= (goal.max ?? 0);
  return value >= (goal.min ?? -Infinity) && value <= (goal.max ?? Infinity);
}

function addValues(target: Record<string, number>, values: Record<string, number>, direction = 1): void {
  for (const [stat, value] of Object.entries(values)) {
    target[stat] = (target[stat] ?? 0) + direction * value;
  }
}

function canStillSatisfy(
  goals: Record<string, ProfileStatGoal | undefined>,
  keys: string[],
  stats: Record<string, number>,
  minimumRemaining: Record<string, number>,
  maximumRemaining: Record<string, number>,
): boolean {
  for (const stat of keys) {
    const goal = goals[stat];
    const current = stats[stat] ?? 0;
    const lowest = current + (minimumRemaining[stat] ?? 0);
    const highest = current + (maximumRemaining[stat] ?? 0);
    if (goal?.mode === "min" && highest < (goal.min ?? 0)) return false;
    if (goal?.mode === "max" && lowest > (goal.max ?? 0)) return false;
    if (goal?.mode === "range" && (highest < (goal.min ?? -Infinity) || lowest > (goal.max ?? Infinity))) return false;
  }
  return true;
}

function* enumerateCharacter(
  character: ProfileGoalSearchCharacter,
  ownedLevels: Map<string, OwnedLevel>,
  inventoryPolicy: "owned-current" | "owned-upgrades",
  includeCurrentBuilds: boolean,
  dominatedUpperBound: (stats: Record<string, number>) => boolean,
  nearestTargets: Record<string, number> = {},
  distanceBound: (stats: Record<string, number>, low: Record<string, number>, high: Record<string, number>) => boolean = () => false,
): Generator<SearchEvent> {
  const input = character.input;
  const keys = [...new Set([...goalKeys(input.goals), ...Object.keys(nearestTargets)])];
  if (keys.length === 0) return;
  const objectives = keys.filter((stat) => input.goals[stat]?.mode === "maximize");

  const contributionCache = new Map<string, Record<string, number>>();
  const contributionOf = (item: string, level: number) => {
    const cacheKey = `${item}|${level}`;
    const cached = contributionCache.get(cacheKey);
    if (cached) return cached;
    const value = input.contribution(item, level) ?? {};
    contributionCache.set(cacheKey, value);
    return value;
  };

  const slots = input.slots.map(({ slot, items }) => {
    const unique = [...new Set(items)];
    const candidates: Candidate[] = [];
    for (const item of unique) {
      const owned = ownedLevels.get(item);
      if (!owned) continue;
      const requestedMax = Number.isFinite(input.maxLevel) ? Math.floor(input.maxLevel!) : 99;
      const maxLevel = Math.max(owned.level, Math.min(99, Math.max(1, requestedMax)));
      const lastLevel = inventoryPolicy === "owned-upgrades" ? maxLevel : owned.level;
      for (let level = owned.level; level <= lastLevel; level += 1) {
        candidates.push({ item, currentLevel: owned.level, level, contribution: contributionOf(item, level) });
      }
    }
    candidates.sort((a, b) => {
      const gain = objectives.reduce((sum, stat) => sum + (b.contribution[stat] ?? 0) - (a.contribution[stat] ?? 0), 0);
      return gain || (a.item < b.item ? -1 : a.item > b.item ? 1 : a.level - b.level);
    });
    return { slot, candidates };
  });

  // Safe independent slot bounds. They may overestimate what remains possible when an item name
  // is duplicated across slots, which only reduces pruning and never hides a valid build.
  const minimumRemaining: Array<Record<string, number>> = Array.from({ length: slots.length + 1 }, () => ({}));
  const maximumRemaining: Array<Record<string, number>> = Array.from({ length: slots.length + 1 }, () => ({}));
  const allStats = new Set<string>([
    ...keys,
    ...Object.keys(input.baseStats),
    ...slots.flatMap(({ candidates }) => candidates.flatMap(({ contribution }) => Object.keys(contribution))),
  ]);
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    const nextMin = minimumRemaining[index + 1];
    const nextMax = maximumRemaining[index + 1];
    const slotCandidates = slots[index].candidates;
    const minHere: Record<string, number> = {};
    const maxHere: Record<string, number> = {};
    for (const stat of allStats) {
      let low = 0;
      let high = 0;
      for (const candidate of slotCandidates) {
        const value = candidate.contribution[stat] ?? 0;
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
      minHere[stat] = low + (nextMin[stat] ?? 0);
      maxHere[stat] = high + (nextMax[stat] ?? 0);
    }
    minimumRemaining[index] = minHere;
    maximumRemaining[index] = maxHere;
  }

  const runningStats = { ...input.baseStats };
  const picks: PlannerPick[] = [];
  const usedItems = new Set<string>();

  function* visit(index: number): Generator<SearchEvent> {
    yield { kind: "node" };
    if (!canStillSatisfy(input.goals, keys, runningStats, minimumRemaining[index], maximumRemaining[index])) return;
    if (distanceBound(runningStats, minimumRemaining[index], maximumRemaining[index])) return;
    if (objectives.length && dominatedUpperBound(Object.fromEntries(objectives.map((stat) => [stat, (runningStats[stat] ?? 0) + (maximumRemaining[index][stat] ?? 0)])))) return;

    if (index === slots.length) {
      const requiredUpgrades = picks.flatMap((pick) => {
        const currentLevel = ownedLevels.get(pick.item)?.level ?? pick.level;
        return pick.level > currentLevel
          ? [{ item: pick.item, currentLevel, requiredLevel: pick.level, addedLevels: pick.level - currentLevel }]
          : [];
      });
      const addedLevels = requiredUpgrades.reduce((sum, upgrade) => sum + upgrade.addedLevels, 0);
      const upgradePass = inventoryPolicy === "owned-upgrades";
      if (keys.every((stat) => isSatisfied(input.goals[stat], runningStats[stat] ?? 0)) && (!upgradePass || includeCurrentBuilds || addedLevels > 0)) {
        yield {
          kind: "build",
          build: {
            characterId: character.id,
            characterName: character.name,
            skills: (character.skills ?? []).filter((skill) => !character.skillItems?.[skill] || picks.some((pick) => character.skillItems![skill].includes(pick.item))),
            ...(character.jobName ? { jobName: character.jobName } : {}),
            ...(character.rank ? { rank: character.rank } : {}),
            picks: picks.map((pick) => ({ ...pick })),
            stats: { ...runningStats },
            addedLevels,
            requiredUpgrades,
          },
        };
      }
      return;
    }

    const { slot, candidates } = slots[index];
    // Empty slots come first, so a character already meeting the target appears before gear-heavy
    // alternatives. All branches are still visited unless their remaining stat bounds prove them
    // impossible.
    if (!objectives.length) yield* visit(index + 1);
    for (const candidate of candidates) {
      if (usedItems.has(candidate.item)) continue;
      usedItems.add(candidate.item);
      picks.push({ slot, item: candidate.item, level: candidate.level });
      addValues(runningStats, candidate.contribution);
      yield* visit(index + 1);
      addValues(runningStats, candidate.contribution, -1);
      picks.pop();
      usedItems.delete(candidate.item);
    }
    if (objectives.length) yield* visit(index + 1);
  }

  // Seed the frontier with legal coordinate-improved builds before deep DFS.
  // This quickly considers weapons/head/shield instead of returning only the
  // empty-first branches when a large search hits its provisional budget.
  if (Object.keys(nearestTargets).length) {
    const selected: Array<Candidate | undefined> = slots.map(() => undefined);
    const score = (stats: Record<string, number>) => Object.entries(nearestTargets).reduce((sum, [stat, target]) => sum + Math.abs((stats[stat] ?? 0) - target) / Math.max(1, target), 0)
      + keys.reduce((sum, stat) => {
        const goal = input.goals[stat], value = stats[stat] ?? 0;
        if (!goal || goal.mode === "maximize") return sum;
        const lo = goal.mode === "max" ? -Infinity : goal.min ?? -Infinity;
        const hi = goal.mode === "min" ? Infinity : goal.max ?? Infinity;
        return sum + 1000 * Math.max(0, lo - value, value - hi);
      }, 0);
    for (let pass = 0; pass < 2; pass++) {
      for (let index = 0; index < slots.length; index++) {
        if (selected[index]) addValues(runningStats, selected[index]!.contribution, -1);
        const occupied = new Set(selected.filter((entry, at) => at !== index && entry).map((entry) => entry!.item));
        let best: Candidate | undefined;
        let bestStats = { ...runningStats }, bestScore = score(runningStats);
        for (const candidate of slots[index].candidates) {
          yield { kind: "node" };
          if (occupied.has(candidate.item)) continue;
          const stats = { ...runningStats }; addValues(stats, candidate.contribution);
          const value = score(stats);
          const improvesObjectives = objectives.every((stat) => (stats[stat] ?? 0) >= (bestStats[stat] ?? 0)) && objectives.some((stat) => (stats[stat] ?? 0) > (bestStats[stat] ?? 0));
          if (value < bestScore || (value === bestScore && improvesObjectives)) { best = candidate; bestStats = stats; bestScore = value; }
        }
        selected[index] = best;
        if (best) addValues(runningStats, best.contribution);
      }
      picks.splice(0, picks.length, ...selected.flatMap((candidate, index) => candidate ? [{ slot: slots[index].slot, item: candidate.item, level: candidate.level }] : []));
      yield* visit(slots.length);
    }
    for (const key of Object.keys(runningStats)) delete runningStats[key];
    Object.assign(runningStats, input.baseStats);
    picks.length = 0;
  }
  yield* visit(0);
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Enumerate every target-satisfying gear combination that uses only owned equipment at its
 * profile-recorded shared level, or (when requested) at every integer level through the builder
 * cap. The upgrade pass reports every required level increase and omits current-only builds.
 * Theoretical and unowned equipment are never invented.
 *
 * The async pages let the UI render progress and cancel long searches. `searchNodes` counts DFS
 * states, and `complete` is false on every partial page; there is no silent result cap.
 */
export async function* searchProfileGoalBuildPages(
  search: ProfileGoalSearchInput,
  options: ProfileGoalSearchOptions = {},
): AsyncGenerator<ProfileGoalSearchPage> {
  const pageSize = clampPositiveInteger(options.pageSize, 50, 500);
  const nodeSliceSize = clampPositiveInteger(options.nodeSliceSize, 1_000, 20_000);
  const inventoryPolicy = options.inventoryPolicy ?? "owned-current";
  const ownedLevels = ownedCurrentLevels(search.inventory);
  const builds: ProfileGoalBuild[] = [];
  const objectives = [...new Set(search.characters.flatMap((character) => Object.entries(character.input.goals).filter(([, goal]) => goal?.mode === "maximize").map(([stat]) => stat)))];
  const nearestTargets = options.nearestTargets ?? {};
  const nearest = Object.keys(nearestTargets).length > 0;
  const optimizing = objectives.length > 0 || nearest;
  const distance = (stats: Record<string, number>) => Object.entries(nearestTargets).reduce((sum, [stat, target]) => sum + Math.abs((stats[stat] ?? 0) - target) / Math.max(1, target), 0);
  const frontier: ProfileGoalBuild[] = [];
  // Keep nondominated stat tradeoffs. Equal stat vectors prefer fewer added levels, then fewer items.
  const dominates = (a: Record<string, number>, b: Record<string, number>) => objectives.every((stat) => (a[stat] ?? 0) >= (b[stat] ?? 0)) && objectives.some((stat) => (a[stat] ?? 0) > (b[stat] ?? 0));
  const sameVector = (a: ProfileGoalBuild, b: ProfileGoalBuild) => objectives.every((stat) => (a.stats[stat] ?? 0) === (b.stats[stat] ?? 0));
  const cheaper = (a: ProfileGoalBuild, b: ProfileGoalBuild) => a.addedLevels < b.addedLevels || (a.addedLevels === b.addedLevels && (a.picks.length < b.picks.length || (a.picks.length === b.picks.length && (a.skills?.length ?? 0) <= (b.skills?.length ?? 0))));
  const consider = (build: ProfileGoalBuild) => {
    if (nearest) {
      build.targetDistance = distance(build.stats);
      const relevantStats = [...new Set([...Object.keys(nearestTargets), ...objectives, ...goalKeys(search.characters[0]?.input.goals ?? {})])].sort();
      const identity = (entry: ProfileGoalBuild) => `${entry.characterId}|${entry.jobName}|${entry.rank}|${relevantStats.map((stat) => `${stat}:${entry.stats[stat] ?? 0}`).join("|")}`;
      const equivalent = frontier.findIndex((entry) => identity(entry) === identity(build));
      if (equivalent >= 0) {
        if (!cheaper(build, frontier[equivalent])) return;
        frontier.splice(equivalent, 1);
      }
      // Closeness has priority. At equal distance, honor every requested maximize
      // stat using Pareto dominance rather than silently preferring empty slots.
      if (frontier.some((entry) => entry.targetDistance === build.targetDistance && dominates(entry.stats, build.stats))) return;
      for (let index = frontier.length - 1; index >= 0; index--) {
        if (frontier[index].targetDistance === build.targetDistance && dominates(build.stats, frontier[index].stats)) frontier.splice(index, 1);
      }
      frontier.push(build);
      frontier.sort((a, b) => a.targetDistance! - b.targetDistance! || a.addedLevels - b.addedLevels || a.picks.length - b.picks.length || (a.skills?.length ?? 0) - (b.skills?.length ?? 0));
      if (frontier.length > 40) frontier.pop();
      return;
    }
    if (frontier.some((entry) => dominates(entry.stats, build.stats) || (sameVector(entry, build) && cheaper(entry, build)))) return;
    for (let index = frontier.length - 1; index >= 0; index -= 1) {
      if (dominates(build.stats, frontier[index].stats) || sameVector(build, frontier[index])) frontier.splice(index, 1);
    }
    frontier.push(build);
  };
  let searchNodes = 0;
  let completedCharacters = 0;
  let matchingBuilds = 0;
  let sliceNodes = 0;

  if (options.signal?.aborted) {
    yield { builds, matchingBuilds, searchNodes, inventoryPolicy, completedCharacters, totalCharacters: search.characters.length, complete: false, cancelled: true };
    return;
  }

  // Keep an independent DFS cursor for every candidate context and advance one event at a time.
  // This lets a later profile character/job/rank produce a result before an earlier context's
  // combinatorial search finishes, while each iterator still visits its full search space.
  const states = search.characters.map((character) => {
    if (!character.available || !character.eligible) {
      completedCharacters += 1;
      return { iterator: null as Generator<SearchEvent> | null, done: true };
    }
    return { iterator: enumerateCharacter(character, ownedLevels, inventoryPolicy, options.includeCurrentBuilds ?? false, (upper) => !nearest && frontier.some((entry) => dominates(entry.stats, upper)), nearestTargets, (stats, low, high) => {
      if (!nearest || frontier.length < 40) return false;
      const bound = Object.entries(nearestTargets).reduce((sum, [stat, target]) => {
        const lo = (stats[stat] ?? 0) + (low[stat] ?? 0), hi = (stats[stat] ?? 0) + (high[stat] ?? 0);
        return sum + Math.max(0, lo - target, target - hi) / Math.max(1, target);
      }, 0);
      return bound > frontier[frontier.length - 1].targetDistance!;
    }), done: false };
  });
  let nextStateIndex = 0;
  let unfinished = states.filter((state) => !state.done).length;

  while (unfinished > 0) {
    if (options.signal?.aborted) {
      yield { builds: optimizing ? frontier.slice(0, pageSize) : builds, matchingBuilds: optimizing ? frontier.length : matchingBuilds, searchNodes, inventoryPolicy, completedCharacters, totalCharacters: search.characters.length, complete: false, cancelled: true, optimizing };
      return;
    }

    if (nearest && options.maxSearchNodes && searchNodes >= options.maxSearchNodes) {
      yield { builds: [...frontier], matchingBuilds: frontier.length, searchNodes, inventoryPolicy, completedCharacters, totalCharacters: search.characters.length, complete: false, limited: true, optimizing: true };
      continue;
    }
    const state = states[nextStateIndex];
    nextStateIndex = (nextStateIndex + 1) % states.length;
    if (state.done || !state.iterator) continue;

    const next = state.iterator.next();
    if (next.done) {
      state.done = true;
      unfinished -= 1;
      completedCharacters += 1;
      continue;
    }
    if (next.value.kind === "node") {
      searchNodes += 1;
      sliceNodes += 1;
    } else {
      if (optimizing) consider(next.value.build);
      else builds.push(next.value.build);
      matchingBuilds += 1;
    }

    if (builds.length >= pageSize || sliceNodes >= nodeSliceSize) {
      yield { builds: optimizing ? frontier.slice(0, pageSize) : builds.splice(0), matchingBuilds: optimizing ? frontier.length : matchingBuilds, searchNodes, inventoryPolicy, completedCharacters, totalCharacters: search.characters.length, complete: false, optimizing };
      sliceNodes = 0;
      await yieldToEventLoop();
    }
  }

  if (optimizing) {
    // Final pages expose the entire frontier, without a hidden result cap.
    for (let offset = 0; offset < Math.max(1, frontier.length); offset += pageSize) {
      yield { builds: frontier.slice(offset, offset + pageSize), matchingBuilds: frontier.length, searchNodes, inventoryPolicy, completedCharacters, totalCharacters: search.characters.length, complete: offset + pageSize >= frontier.length, optimizing };
    }
  } else yield { builds, matchingBuilds, searchNodes, inventoryPolicy, completedCharacters, totalCharacters: search.characters.length, complete: true };
}
