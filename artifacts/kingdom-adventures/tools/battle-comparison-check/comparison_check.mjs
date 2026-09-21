/**
 * Deterministic contract check for the player-team comparison UI (`ka-battle-eval-1`).
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-comparison-check/comparison_check.mjs
 *
 * It runs the real site TypeScript modules (no bundler, no browser) against a synthetic comparison
 * envelope plus a recorded replay fixture, so the ranking presentation, the unranked reasons and
 * the winner-replay transfer are exercised without a live backend. Exit code 1 on any failure.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDefaultBattleSetup, createHumanUnit } from "@/lib/battle-setup";
import {
  COMPARISON_CAPS,
  applyGeneratedVariant,
  buildEvaluationRequest,
  buildSearchRequest,
  comparisonBudget,
  createComparisonCandidate,
  defaultComparisonSettings,
  deterministicSeedPairs,
  searchWinnerTransfer,
  storeSearchWinnerReplay,
  storeWinnerReplay,
  unsupportedSkillNotice,
  winnerTransfer,
} from "@/lib/battle-comparison";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const REPLAY_FIXTURE = path.join(
  WORKSPACE,
  "RE-evidence",
  "20260919-configurable-battle-setup",
  "run-battle-16.5",
  "replays",
  "S.json",
);

const checks = [];
const check = (name, condition, detail) => {
  checks.push({ name, ok: Boolean(condition), detail: detail ?? null });
  if (!condition) throw new Error(`check failed: ${name}${detail ? ` (${detail})` : ""}`);
};

const stats = (mean, samples, range = null) => ({
  samples,
  mean,
  variance: null,
  standardDeviation: null,
  standardError: null,
  descriptiveRange: range,
  interval95: null,
  interval95SuppressedReason: samples < 2 ? "a single sample cannot justify a statistical interval" : "user-chosen seeds",
  label: "descriptive sample variation over exactly the disclosed seed list",
});
const chest = (mean, samples, histogram, range = null) => ({
  histogram,
  statistics: stats(mean, samples, range),
  basis: "resolved runs only; a chest entity is not an inventory receipt",
});
const candidateResult = (id, mean, winProbability, extra = {}) => ({
  id,
  label: id,
  status: "measured",
  sweptKeysReplaced: [],
  rank: null,
  rankMetric: "expected dispatched chest entities per attempted fight",
  pooled: {
    runs: 2,
    resolvedRuns: 2,
    wins: Math.round(winProbability * 2),
    losses: 2 - Math.round(winProbability * 2),
    censored: 0,
    winProbability,
    lossProbability: 1 - winProbability,
    censoredProbability: 0,
    queuedChestCallbacks: chest(mean, 2, [{ count: 0, frequency: 1 }, { count: mean, frequency: 1 }]),
    dispatchedChests: chest(mean, 2, [{ count: 0, frequency: 1 }, { count: mean, frequency: 1 }]),
    retainedInventory: { state: "not modelled", counted: false, note: "never counted" },
    label: "sampling-only frequency",
  },
  levels: [],
  errors: [],
  ...extra,
});

function fixtureResult(replay) {
  const levels = [
    {
      level: { encounterId: 19, defeatCount: 0, level: 80, label: null },
      seeds: [[1, 2], [3, 4]],
      runs: 2,
      resolvedRuns: 2,
      wins: 1,
      losses: 1,
      censored: 0,
      winProbability: 0.5,
      lossProbability: 0.5,
      censoredProbability: 0,
      probabilities: { label: "sampling-only frequency", basis: "completed runs" },
      queuedChestCallbacks: chest(3, 2, [{ count: 1, frequency: 1 }, { count: 5, frequency: 1 }]),
      dispatchedChests: chest(3, 2, [{ count: 1, frequency: 1 }, { count: 5, frequency: 1 }]),
      retainedInventory: { state: "not modelled", counted: false, note: "never counted" },
      censoring: { censored: 0, note: "never converted into a zero-chest failure", stopReason: null },
      eventEvidence: { leavingEntries: 2, prizeEventRecords: 1, prizeTreasureIds: [7], source: "runner event records" },
      errors: [],
    },
  ];
  const winnerLevel = { ...levels[0], dispatchedChests: chest(1.25, 2, [{ count: 0, frequency: 1 }, { count: 5, frequency: 1 }]) };
  return {
    schema: "ka-battle-eval-1",
    status: "research-only; not certified for gear recommendations",
    request: { levels: [{ encounterId: 19, defeatCount: 0 }], seeds: [[1, 2], [3, 4]], tickLimit: 2000, limits: { maxRuns: 16 } },
    budget: { plannedRuns: 4, candidates: 2, levels: 1, seeds: 2, maxRuns: 16 },
    comparability: { scope: {}, groups: { "0": ["team-1"] }, rule: "identical levels/seeds/tick limit only" },
    candidates: [
      { ...candidateResult("team-1", 1.25, 0.5), rank: 1, levels: [winnerLevel] },
      { ...candidateResult("team-2", 0.5, 0.75), rank: 2, levels: [levels[0]] },
      {
        ...candidateResult("team-3", null, null),
        status: "partial",
        pooled: { ...candidateResult("team-3", null, null).pooled, dispatchedChests: chest(null, 0, []), winProbability: null },
        levels: [],
        errors: ["ScenarioError: skill 30 is not supported by the native runner"],
      },
    ],
    rankings: {
      metric: "expected dispatched chest entities per attempted fight (mean over every attempted run in the comparability group)",
      metricNote: "a loss dispatches exactly zero; chest collection stays unmodelled",
      perLevel: [
        {
          level: levels[0].level,
          ranked: [
            { id: "team-1", rank: 1, expectedDispatchedChestsPerAttempt: 1.25, winProbability: 0.5 },
            { id: "team-2", rank: 2, expectedDispatchedChestsPerAttempt: 0.5, winProbability: 0.75 },
          ],
          unranked: [
            { id: "team-3", status: "partial", reasons: ["1 run error(s): a candidate with errors is not comparable"], errors: ["ScenarioError: skill 30 is not supported by the native runner"] },
          ],
        },
      ],
      pooled: {
        ranked: [
          { id: "team-1", rank: 1, expectedDispatchedChestsPerAttempt: 1.25, winProbability: 0.5 },
          { id: "team-2", rank: 2, expectedDispatchedChestsPerAttempt: 0.5, winProbability: 0.75 },
        ],
        unranked: [
          { id: "team-3", status: "partial", reasons: ["1 run error(s): a candidate with errors is not comparable"], errors: ["ScenarioError: skill 30 is not supported by the native runner"] },
        ],
      },
    },
    ranking: ["team-1", "team-2"],
    unranked: [
      { id: "team-3", status: "partial", reasons: ["1 run error(s): a candidate with errors is not comparable"], errors: ["ScenarioError: skill 30 is not supported by the native runner"] },
    ],
    selected: {
      candidateId: "team-1",
      level: levels[0].level,
      seed: [1, 2],
      rank: 1,
      rankMetric: "expected dispatched chest entities per attempted fight",
      replaySelection: "pooled winner at its highest mean-dispatched-chest level, first seed",
    },
    replay,
    strategies: [
      {
        id: "multi-hit-leaving-callback-farm",
        title: "Repeated zero-HP boss Leaving callback farming",
        status: "mechanism explained; realising strategy inputs incomplete",
        mechanism: "a retained direct hit moves the boss back into Damaging and Leaving re-queues a prize callback",
        evidenceRule: "counted from the runner's own event records",
        sources: ["special-combat.md"],
        confirmableNow: ["whether a run reaches state 8 more than once"],
        incompleteInputs: ["the exact team that realises repeated re-entry"],
        notes: [],
      },
    ],
    caveats: ["research-mode model estimate", "the ranking objective is the expected dispatched chest entities per attempted fight"],
    support: { mode: "research", claim: "bounded evaluation of supplied candidates; not a global optimum", exactReplaySupported: false, recommendationsSupported: false },
    caps: { hardMaxRuns: 256, hardMaxTicks: 10000, hardMaxSeeds: 64, hardMaxCandidates: 32, hardMaxVariants: 32 },
  };
}

function main() {
  const settings = defaultComparisonSettings(19, 0);
  check("modest default budget", settings.sampleCount === 2 && settings.maxRuns === 16 && settings.levels.length === 1);

  const seedsA = deterministicSeedPairs(1000, 3);
  const seedsB = deterministicSeedPairs(1000, 3);
  check("seeds are deterministic", JSON.stringify(seedsA) === JSON.stringify(seedsB));
  check("seeds are distinct pairs", new Set(seedsA.map((pair) => pair.join(":"))).size === 3);

  const legal = createComparisonCandidate("team-1", "current team", createDefaultBattleSetup(19));
  check("validated setup becomes a candidate", legal.ok === true, legal.ok ? null : JSON.stringify(legal.errors));
  check("candidate scenario uses the research contract", legal.candidate.scenario.schema === "ka-special-combat-research-1");

  const empty = createDefaultBattleSetup(19);
  empty.playerTeam = [];
  const rejected = createComparisonCandidate("team-x", "empty", empty);
  check("ERROR setup is rejected, never stripped", rejected.ok === false && rejected.errors.length > 0);

  const two = legal.ok ? [legal.candidate, { ...legal.candidate, id: "team-2", label: "team-2" }] : [];
  const built = buildEvaluationRequest(settings, two);
  check("request is built for all candidates", built.ok === true && built.request.candidates.length === 2);
  check("request asks for the same deterministic seeds for every candidate", built.request.seeds.length === 2 && settings.sampleCount === 2);
  check("request carries the scenario contract", built.request.candidates[0].scenario.schema === "ka-special-combat-research-1");
  check("caps are mirrored", built.request.limits.maxCandidates === COMPARISON_CAPS.maxCandidates);
  check(
    "over-budget request is refused before any run",
    comparisonBudget({ ...settings, maxRuns: 1 }, 2).problems.some((problem) => problem.includes("exceed")),
  );
  check(
    "over-budget build returns problems, not a request",
    buildEvaluationRequest({ ...settings, maxRuns: 1 }, two).ok === false,
  );

  const replay = JSON.parse(readFileSync(REPLAY_FIXTURE, "utf8"));
  const result = fixtureResult(replay);

  const pooled = result.rankings.pooled;
  check("ranking objective is dispatched chests, not win probability", pooled.ranked[0].id === "team-1");
  check("lower win probability can still rank first", pooled.ranked[0].winProbability < pooled.ranked[1].winProbability);
  check("errored candidate never appears in the ranked ids", result.ranking.every((id) => id !== "team-3"));
  check("unranked candidate states its reason and its native error", result.unranked[0].reasons.length > 0 && result.unranked[0].errors[0].includes("not supported"));
  check("no candidate counts retained inventory", result.candidates.every((entry) => entry.pooled.retainedInventory.counted === false));
  check("statistics suppress an inferential interval", result.candidates[0].pooled.dispatchedChests.statistics.interval95 === null);

  const transfer = winnerTransfer(result, two);
  check("winner transfer picks the ranked winner", transfer && transfer.candidate.id === "team-1");
  check("winner transfer uses the winning candidate visualSetup", transfer.candidate.visualSetup === two[0].visualSetup);
  const stored = storeWinnerReplay(result, two, "Encounter 19");
  check("winner replay is stored with the winning visualSetup", stored.ok === true && stored.record.visualSetup === two[0].visualSetup, stored.ok ? null : stored.reason);
  const bad = storeWinnerReplay({ ...result, replay: { schema: "nope" } }, two, null);
  check("invalid winner replay is reported, never forced into the store", bad.ok === false && bad.reason.includes("rejected"));

  check(
    "native-unsupported skill notice is surfaced as an error",
    unsupportedSkillNotice([
      { category: "ERROR", code: "SKILL_NOT_SUPPORTED_BY_NATIVE_RUNNER", path: "unit", message: "skill 30 unsupported" },
    ])?.includes("skill 30 unsupported") === true,
  );

  // --- bounded strategy generation ---
  const pairSetup = { ...createDefaultBattleSetup(19) };
  pairSetup.playerTeam = [...pairSetup.playerTeam, createHumanUnit(2)];
  const pair = createComparisonCandidate("pair", "two units", pairSetup);
  check("two-unit candidate is legal for the search path", pair.ok === true, pair.ok ? null : JSON.stringify(pair.errors));
  const searchBuilt = buildSearchRequest(settings, [pair.candidate]);
  check(
    "search request uses the search schema with no explicit variants",
    searchBuilt.ok === true && searchBuilt.request.schema === "ka-battle-search-1"
      && searchBuilt.request.variants.length === 0
      && searchBuilt.request.strategy.formations === true
      && searchBuilt.request.strategy.maxVariantsPerCandidate === 8,
  );
  const baseVariant = { id: "base", kind: "base", label: "unchanged candidate", description: "as supplied", changes: {} };
  const baseApplied = applyGeneratedVariant(pair.candidate.setup, baseVariant);
  check("the unchanged candidate keeps its own setup", baseApplied.ok === true && baseApplied.setup === pair.candidate.setup);
  const nonPetNames = pair.candidate.setup.playerTeam
    .filter((unit) => !(unit.kind === "monster" && unit.petOwnerName))
    .map((unit) => unit.name);
  const formationVariant = {
    id: "generated-1",
    kind: "formation",
    label: "formation order",
    description: "ownUnits order reordered",
    changes: { ownUnitsOrder: [...nonPetNames].reverse() },
  };
  const applied = applyGeneratedVariant(pair.candidate.setup, formationVariant);
  check(
    "a generated formation variant reorders that candidate's own units only",
    applied.ok === true
      && applied.setup.playerTeam
        .filter((unit) => !(unit.kind === "monster" && unit.petOwnerName))
        .map((unit) => unit.name).join() === [...nonPetNames].reverse().join(),
  );
  check(
    "applying a variant never mutates the base candidate",
    pair.candidate.setup.playerTeam
      .filter((unit) => !(unit.kind === "monster" && unit.petOwnerName))
      .map((unit) => unit.name).join() === nonPetNames.join(),
  );
  const unknownUnit = applyGeneratedVariant(pair.candidate.setup, {
    ...formationVariant,
    changes: { ownUnitsOrder: ["Ghost"] },
  });
  check(
    "a variant that is not a permutation of this candidate's units is refused",
    unknownUnit.ok === false && unknownUnit.reason.includes("permutation"),
  );
  const skillSetup = {
    ...pair.candidate.setup,
    playerTeam: [{
      name: "Skilled",
      kind: "human",
      skills: [{ skillId: 37, invocationLevel: 1 }, { skillId: 109, invocationLevel: 2 }],
    }],
  };
  const skillVariant = {
    id: "generated-2",
    kind: "skillPriority",
    label: "skill priority",
    description: "Skilled skills reordered",
    changes: { skillOrder: [{ unit: "Skilled", skills: [109, 37], invocationLevels: [2, 1] }] },
  };
  const skillApplied = applyGeneratedVariant(skillSetup, skillVariant);
  check(
    "a skill variant keeps each skillId paired with its own invocation level",
    skillApplied.ok === true
      && JSON.stringify(skillApplied.setup.playerTeam[0].skills)
        === JSON.stringify([{ skillId: 109, invocationLevel: 2 }, { skillId: 37, invocationLevel: 1 }]),
  );
  check(
    "the skill variant left the base unit untouched",
    JSON.stringify(skillSetup.playerTeam[0].skills)
      === JSON.stringify([{ skillId: 37, invocationLevel: 1 }, { skillId: 109, invocationLevel: 2 }]),
  );
  const badSkills = applyGeneratedVariant(skillSetup, {
    ...skillVariant,
    changes: { skillOrder: [{ unit: "Skilled", skills: [109, 999], invocationLevels: [2, 1] }] },
  });
  check(
    "a skill variant that is not a permutation of the unit's own skills is refused",
    badSkills.ok === false && badSkills.reason.includes("permutation"),
  );

  const searchEnvelope = {
    ...result,
    schema: "ka-battle-search-1",
    claim: "bounded enumeration over the supplied candidates and generated variants; no global optimum is claimed",
    enumeration: {
      candidates: 1,
      variants: 0,
      combinations: 2,
      levels: 1,
      seeds: 2,
      plannedRuns: 4,
      variantIds: ["base", "generated-1"],
      variantPatchKeys: ["ownUnits"],
      rule: "per candidate: the unchanged candidate plus generated permutations of its own validated inputs",
      strategy: { formations: true, skillPriorities: true, maxVariantsPerCandidate: 8 },
      generated: {
        availableVariants: 1,
        generatedVariants: 1,
        rule: "per candidate bounded generation",
        perCandidate: {
          pair: {
            available: 1,
            generated: 1,
            truncated: false,
            cap: 8,
            formation: { enabled: true, arrangements: 1, classes: [], reason: null },
            skillPriorities: { enabled: true, arrangements: 0, units: [], reason: null },
            variants: [baseVariant, formationVariant],
          },
        },
      },
    },
    selected: {
      ...result.selected,
      candidateId: "pair",
      variantId: "generated-1",
      combinationId: "pair::generated-1",
    },
  };
  const searchTransfer = searchWinnerTransfer(searchEnvelope, [pair.candidate]);
  check(
    "search winner transfer binds the base candidate and its own generated variant",
    searchTransfer.ok === true && searchTransfer.candidate.id === "pair" && searchTransfer.variantId === "generated-1",
  );
  check(
    "search winner transfer renders the variant's own unit order, never an unrelated team",
    searchTransfer.ok === true
      && searchTransfer.visualSetup.units.map((unit) => unit.name).join()
        === [...nonPetNames].reverse().join(),
  );
  const searchStored = storeSearchWinnerReplay(searchEnvelope, [pair.candidate], "Encounter 19");
  check(
    "the search winner replay is stored with the winning variant's own appearance",
    searchStored.ok === true
      && searchStored.record.visualSetup.units.map((unit) => unit.name).join()
        === [...nonPetNames].reverse().join(),
    searchStored.ok ? null : searchStored.reason,
  );
  const missingVariant = storeSearchWinnerReplay(
    { ...searchEnvelope, selected: { ...searchEnvelope.selected, variantId: "generated-9" } },
    [pair.candidate],
    null,
  );
  check(
    "an undescribed winning variant is refused instead of rendering another team",
    missingVariant.ok === false && missingVariant.reason.includes("missing"),
  );

  const summary = {
    schema: "ka-battle-comparison-checks-1",
    checks: checks.length,
    failures: 0,
    ranking: pooled.ranked.map((entry) => entry.id),
    unranked: result.unranked.map((entry) => entry.id),
    winner: result.selected.candidateId,
    winnerVisualSetupBound: stored.ok === true,
    probed: [
      "ranking objective is expected dispatched chest entities, not win probability",
      "the same deterministic seeds are requested for every candidate",
      "over-budget requests are refused before any run",
      "an ERROR/censored/errored candidate is unranked with reasons and can never outrank a complete one",
      "retained inventory is never counted",
      "no inferential interval is shown for a user-chosen seed list",
      "the winner replay is stored with the winning candidate's own visualSetup",
      "a native-unsupported skill error is surfaced, never stripped",
      "a search request carries the strategy toggles and no caller-supplied variants",
      "a generated variant only reorders that candidate's own units and never mutates it",
      "a skill variant keeps every skillId paired with its own invocation level",
      "a variant that is not a permutation of the candidate's own inputs is refused",
      "the search winner replay uses the winning variant's own appearance, and an undescribed",
      "  winning variant is refused instead of rendering an unrelated team",
    ],
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  process.stdout.write(`${JSON.stringify({ schema: "ka-battle-comparison-checks-1", ok: false, error: String(error), checks })}\n`);
  process.exit(1);
}
