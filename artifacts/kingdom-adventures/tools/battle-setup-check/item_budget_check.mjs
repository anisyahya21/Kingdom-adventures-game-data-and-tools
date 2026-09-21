/**
 * Focused item-budget contract check (no browser, no backend).
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-setup-check/item_budget_check.mjs
 *
 * Covers the four player-facing integration claims that a plain typecheck cannot:
 *   1. item round-trip: a setup with items/itemStock/item inputs survives serialize -> import and
 *      validates with zero ERRORs; the adapter emits the same rows and the explicit `target: "all"`;
 *      a legacy setup still emits no `items` key and keeps `holyHerbStock` (old payloads preserved);
 *   2. fail-closed validation: undeclared row, missing stock, wrong target scope, unsupported effect;
 *   3. the canonical Large Potion row is the Item.txt id 27 row (re-read from the source table), so
 *      no recovery row is invented, and the app's user-preset copy equals the user-reference preset;
 *   4. the comparison common budget: candidates must share items/itemStock/inputs/holyHerbStock and the
 *      declared source profile, and a winner replay exposes uses/remaining instead of hiding a spend.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_RECOVERY_ITEMS,
  LARGE_POTION_ITEM,
  canonicalRecoveryItem,
  createDefaultBattleSetup,
  createHumanUnit,
  importBattleSetup,
  serializeBattleSetup,
  validateBattleSetup,
} from "@/lib/battle-setup";
import { battleSetupToCombatScenario } from "@/lib/battle-setup-adapter";
import {
  buildEvaluationRequest,
  comparisonItemBudget,
  comparisonPolicyKey,
  comparisonPolicyProblems,
  createComparisonCandidate,
  defaultComparisonSettings,
} from "@/lib/battle-comparison";
import {
  USER_WAIRO_PRESET,
  userWairoPresetLoadouts,
} from "@/lib/user-wairo-preset";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");

const checks = [];
/** Key-order-insensitive JSON equality (the setup serializer sorts keys). */
const canon = (value) => {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canon(value[key])]));
  }
  return value;
};

/** JSON-equality check: `check(name, actual, expected)`; the same convention as the browser harness. */
const check = (name, actual, expected) => {
  const ok = JSON.stringify(canon(actual)) === JSON.stringify(canon(expected));
  const detail = ok ? null : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  checks.push({ name, ok, detail });
  if (!ok) throw new Error(`check failed: ${name} (${detail})`);
};
const errors = (setup) => validateBattleSetup(setup).filter((issue) => issue.category === "ERROR");
const errorCodes = (setup) => errors(setup).map((issue) => issue.code);

/* 1. Round-trip + adapter ------------------------------------------------- */

const largePotion = LARGE_POTION_ITEM;
check("canonical Large Potion row resolves", Boolean(largePotion), true);

const withItems = createDefaultBattleSetup(19);
withItems.holyHerbStock = 3;
withItems.items = { [largePotion.name]: { ...largePotion.row } };
withItems.itemStock = { [largePotion.name]: 2 };
withItems.inputs = [
  { tick: 10, phase: "before_fighters", type: "holy_herb" },
  { tick: 25, phase: "after_fighters", type: "item", item: largePotion.name, target: "all" },
];

check("item setup validates with zero ERRORs", errorCodes(withItems), []);

const reimported = importBattleSetup(serializeBattleSetup(withItems));
check("item setup round-trips through serialize/import", Boolean(reimported.setup), true);
check("import keeps the declared item row", reimported.setup?.items?.[largePotion.name], largePotion.row);
check("import keeps the finite item stock", reimported.setup?.itemStock?.[largePotion.name], 2);
check("import keeps the holy herb budget", reimported.setup?.holyHerbStock, 3);
check(
  "import keeps the scheduled item input",
  reimported.setup?.inputs?.[1],
  { tick: 25, phase: "after_fighters", type: "item", item: largePotion.name, target: "all" },
);
check("reimported setup still has zero ERRORs", errorCodes(reimported.setup), []);

const { scenario } = battleSetupToCombatScenario(structuredClone(withItems));
check("adapter emits the explicit item rows", scenario.items?.[largePotion.name], largePotion.row);
check("adapter emits the finite item stock", scenario.itemStock?.[largePotion.name], 2);
check("adapter emits the item input with the all-residents target", scenario.inputs[1], {
  tick: 25,
  phase: "after_fighters",
  type: "item",
  item: largePotion.name,
  target: "all",
});

const legacy = createDefaultBattleSetup(19);
const legacyScenario = battleSetupToCombatScenario(structuredClone(legacy)).scenario;
check("legacy setup has holyHerbStock 0 by default", legacyScenario.holyHerbStock, 0);
check("legacy setup emits no items key", "items" in legacyScenario, false);
check("legacy setup emits no itemStock key", "itemStock" in legacyScenario, false);
check("legacy setup keeps an empty input list", legacyScenario.inputs, []);

/* 2. Fail-closed validation ---------------------------------------------- */

const undeclared = structuredClone(withItems);
undeclared.inputs = [{ tick: 5, phase: "before_fighters", type: "item", item: "Small Potion", target: "all" }];
check("undeclared item row is an ERROR", errorCodes(undeclared).includes("ITEM_INPUT_UNDECLARED"), true);

const missingStock = structuredClone(withItems);
missingStock.itemStock = {};
check("missing stock entry is an ERROR", errorCodes(missingStock).includes("ITEM_INPUT_NO_STOCK"), true);

const badTarget = structuredClone(withItems);
badTarget.inputs = [{ tick: 5, phase: "before_fighters", type: "item", item: largePotion.name, target: "single" }];
check("a single-resident target is refused", errorCodes(badTarget).includes("ITEM_INPUT_TARGET_SCOPE"), true);

const unsupported = structuredClone(withItems);
unsupported.items = { [largePotion.name]: { bonusCategory: 2, bonusType: 0, bonusMinValue: 1, bonusMaxValue: 1 } };
check("an unsupported effect is refused", errorCodes(unsupported).includes("ITEM_EFFECT_UNSUPPORTED"), true);

const malformedHerb = structuredClone(withItems);
malformedHerb.holyHerbStock = -1;
check("a negative herb budget is refused", errorCodes(malformedHerb).includes("HOLY_HERB_STOCK_MALFORMED"), true);

/* 3. Canonical rows + preset fidelity ------------------------------------ */

const itemTxt = readFileSync(
  path.join(WORKSPACE, "RE-evidence", "20260911-treasure", "xls-original", "English.lproj", "Item.txt"),
  "utf8",
);
const row27 = itemTxt.split(/\r?\n/).find((line) => line.startsWith("27\t"));
check("Item.txt has the id 27 row", Boolean(row27), true);
const columns = row27.split("\t");
check("Large Potion is the Item.txt id 27 name", columns[1], largePotion.name);
check("Large Potion bonusCategory matches Item.txt", Number(columns[18]), largePotion.row.bonusCategory);
check("Large Potion bonusType matches Item.txt", Number(columns[19]), largePotion.row.bonusType);
check("Large Potion bonusMinValue matches Item.txt", Number(columns[20]), largePotion.row.bonusMinValue);
check("Large Potion bonusMaxValue matches Item.txt", Number(columns[21]), largePotion.row.bonusMaxValue);
check(
    "every catalogue row resolves by its canonical name",
    CANONICAL_RECOVERY_ITEMS.every((entry) => canonicalRecoveryItem(entry.name) === entry),
    true,
  );

const presetOnDisk = JSON.parse(
  readFileSync(path.join(WORKSPACE, "RE-evidence", "20260920-user-wairo-strategy", "preset.json"), "utf8"),
);
const presetInApp = JSON.parse(readFileSync(path.join(APP, "src/game-data/user-wairo-preset.json"), "utf8"));
check("the app preset copy equals the user-reference preset (no invented stats)", presetInApp, presetOnDisk);
check("the app preset module exposes the same schema", USER_WAIRO_PRESET.schema, presetOnDisk.schema);

const presetLoadouts = userWairoPresetLoadouts();
const ninja = presetLoadouts.find((loadout) => loadout.name.includes("Ninja"));
check("the preset expands to the real 6 units (Ninja + healer + 4 Scholar)", presetLoadouts.length, 6);
check("every expanded preset unit has a unique name", new Set(presetLoadouts.map((loadout) => loadout.name)).size, 6);
check("every expanded preset unit has a unique id", new Set(presetLoadouts.map((loadout) => loadout.id)).size, 6);
check(
  "the party order stays Ninja, healer, then the four Scholar fodder",
  presetLoadouts.map((loadout) => loadout.jobName),
  ["Ninja", "Wizard", "Scholar", "Scholar", "Scholar", "Scholar"],
);
check(
  "the grouped 'Scholar Fodder 1-4' row expands to four 0-awakening fodder",
  presetLoadouts.filter((loadout) => loadout.jobName === "Scholar").map((loadout) => loadout.awakening),
  [0, 0, 0, 0],
);
check("the expanded preset carries the explicit count-4 Scholar contract", USER_WAIRO_PRESET.loadouts["Scholar Fodder 1-4"]?.count, 4);
check("preset Ninja training levels are unchanged", ninja?.statLevels, presetOnDisk.loadouts["Ninja (A aw20)"].statLevels);
check("preset Ninja equipment is unchanged", ninja?.equipment, presetOnDisk.loadouts["Ninja (A aw20)"].equipment);
check("preset Ninja skills are unchanged", ninja?.skills, presetOnDisk.loadouts["Ninja (A aw20)"].skills);
check("preset loads no scheduled inputs (timing stays declared)", USER_WAIRO_PRESET.runner.inputs, []);
check("preset holy herb budget stays 0 (baseline)", USER_WAIRO_PRESET.runner.holyHerbStock, 0);

/* 4. Comparison common budget -------------------------------------------- */

const teamA = createDefaultBattleSetup(19);
const teamB = createDefaultBattleSetup(19);
teamB.playerTeam = [createHumanUnit(1), createHumanUnit(2)];
check("a different roster still shares the declared policy key", comparisonPolicyKey(teamA), comparisonPolicyKey(teamB));

const candidateA = createComparisonCandidate("team-1", "A", teamA);
const candidateB = createComparisonCandidate("team-2", "B", teamB);
check("both candidates convert", candidateA.ok && candidateB.ok, true);

const sharedRequest = buildEvaluationRequest(defaultComparisonSettings(19, 0), [candidateA.candidate, candidateB.candidate]);
check("an identical policy builds a comparison request", sharedRequest.ok, true);
if (sharedRequest.ok) {
  const scenarios = sharedRequest.request.candidates.map((entry) => entry.scenario);
  check("every candidate carries the same herb stock", scenarios.map((s) => s.holyHerbStock), [0, 0]);
  check("every candidate carries the same (empty) item stock", scenarios.map((s) => s.itemStock ?? null), [null, null]);
  check("the request carries the declared source profile", Boolean(scenarios[0].startProfile?.kind), true);
}

const stockCandidate = createComparisonCandidate("team-3", "C", structuredClone(withItems));
check("the item candidate converts", stockCandidate.ok, true);
const mixed = buildEvaluationRequest(defaultComparisonSettings(19, 0), [
  candidateA.candidate,
  stockCandidate.candidate,
]);
check("a different item policy is rejected", mixed.ok, false);
check(
  "the rejection names the policy mismatch",
  (mixed.problems ?? []).some((problem) => problem.includes("different input/source policy")),
  true,
);
check(
  "comparisonPolicyProblems also reports the mismatch directly",
  comparisonPolicyProblems([candidateA.candidate, stockCandidate.candidate]).length,
  1,
);

/* The default finish policy is "at-horizon"; flip to the diagnostic victory cut so the key must change. */
const finishFlip = createComparisonCandidate("team-4", "D", { ...structuredClone(teamA), finishPolicy: "on-verdict" });
check("finishFlip candidate converts", finishFlip.ok, true);
check(
  "the declared finish policy is part of the comparison key",
  comparisonPolicyKey(finishFlip.candidate.scenario) !== comparisonPolicyKey(candidateA.candidate.scenario),
  true,
);

/** Minimal structurally valid replay so the budget extractor reads real engine item fields. */
const replay = {
  schema: "ka-battle-replay-1",
  source: { exporter: "check", runner: "check", scenarioSchema: "ka-special-combat-research-1", note: "" },
  setupSummary: {
    encounterId: 19,
    defeatCount: 0,
    mathSeed: 1,
    libSeed: 2,
    tickLimit: 100,
    holyHerbStock: 3,
    inputs: [],
    ownUnitCount: 1,
    enemyUnitCount: 1,
    prePlacement: [],
    items: { [largePotion.name]: { ...largePotion.row } },
    itemStock: { [largePotion.name]: 2 },
  },
  encounter: {
    encounterId: 19,
    title: null,
    level: 80,
    defeatCount: 0,
    followerSelectionDraws: 0,
    formationOrder: [],
    ownFormationOrder: [],
    enemyMonsterIds: [],
  },
  units: [
    {
      unitId: "ally:0",
      entityId: 1,
      side: "ally",
      skillIds: [],
      invocationLevels: [],
      startHp: 100,
      startMp: 50,
    },
  ],
  ticks: 0,
  events: [],
  finalState: {
    verdict: 1,
    battleState: 0,
    battleFrame: 0,
    ticks: 0,
    stopReason: "verdict",
    censored: false,
    prizeCallbacks: 0,
    mathDraws: 0,
    libDraws: 0,
    rngFinalState: null,
    retainedRewards: null,
    initializationMode: "declared",
    units: [{ unitId: "ally:0", entityId: 1, side: "ally", rosterIndex: 0, hp: 100, mp: 50, state: 0, stateName: null, commands: 0, cell: [0, 0] }],
    cellsDerivedFrom: "check",
  },
  catalog: { stateNames: {}, skills: {}, equipment: {} },
  metrics: {},
  holyHerbRemaining: 1,
  itemRemaining: { [largePotion.name]: 1 },
  itemUses: [{ item: largePotion.name, tick: 25, phase: "after_fighters", used: true, remaining: 1 }],
  receipts: null,
  runnerLimits: [],
  notes: [],
  missing: [],
};
const envelope = {
  selected: { candidateId: "team-3" },
  replay,
};
const budget = comparisonItemBudget(envelope, [stockCandidate.candidate]);
check("the comparison exposes the winner's herb remaining", budget.winner?.holyHerbRemaining, 1);
check("the comparison exposes the winner's item uses", budget.winner?.items?.[0]?.uses, 1);
check("the comparison exposes the winner's item remaining", budget.winner?.items?.[0]?.remaining, 1);

const failed = checks.filter((entry) => !entry.ok);
console.log(
  JSON.stringify(
    { checks: checks.length, failed: failed.map((entry) => entry.name), details: failed.map((entry) => entry.detail) },
    null,
    1,
  ),
);
if (failed.length > 0) process.exitCode = 1;
