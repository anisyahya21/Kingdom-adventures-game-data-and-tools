import assert from "node:assert/strict";
import { compareProfileStrategies, strategyMatchDeviation } from "../../src/lib/profile-strategy-matches.ts";
import { normalizedMaxDeviationBound } from "../../src/lib/profile-loadout-goal-planner.ts";
import { normalizeFarmingSettings } from "../../src/lib/farming-planner.ts";

const bonuses = { "HP armor": { hp: 90 }, "MP armor": { mp: 90 }, "DEF armor": { def: 90 } };
const input = { characters: [{ id: "resident", name: "Resident", available: true, eligible: true,
  input: { baseStats: { atk: 100, spd: 50, lck: 20, dex: 18, hp: 10, mp: 10, def: 10 }, goals: {},
    slots: [{ slot: "Body", items: Object.keys(bonuses) }], contribution: (item) => bonuses[item] } }],
  inventory: Object.keys(bonuses).map((item) => ({ item, ownership: "owned", currentLevel: 1 })) };
const targets = [{ id: "exact-dps", atk: 100, spd: 50, lck: 20, dex: 18 }];
async function search(stats) {
  let result;
  for await (const page of compareProfileStrategies(input, targets, false, 10_000, stats)) result = page;
  return result.matches[0];
}
for (const stat of ["hp", "mp", "def"]) {
  const result = await search([stat]);
  assert.equal(result.complete, true, "an early exact DPS match must not stop survival optimization");
  assert.equal(result.builds.length, 1);
  assert.equal(result.builds[0].stats[stat], 100);
  assert.equal(result.builds[0].stats.atk, 100);
}
const tradeoffs = await search(["hp", "mp", "def"]);
assert.equal(tradeoffs.builds.length, 3, "all non-dominated survival choices remain visible");
for (const stat of ["hp", "mp", "def"]) assert.ok(tradeoffs.builds.some((build) => build.stats[stat] === 100));
assert.deepEqual(normalizeFarmingSettings({ maximizeStats: ["hp", "hp", "atk", "mp", null] }).maximizeStats, ["hp", "mp"]);
// A neutral-DPS equipment pair is invisible to empty-first coordinate descent:
// each item alone moves ATT away, but together they preserve it and improve survival.
const pairBonuses = { "Strong body": { atk: 10, hp: 100 }, "Balancing shield": { atk: -10, def: 100 } };
const paired = { characters: [{ ...input.characters[0], input: { ...input.characters[0].input,
  slots: [{ slot: "Body", items: ["Strong body"] }, { slot: "Shield", items: ["Balancing shield"] }],
  contribution: item => pairBonuses[item] } }], inventory: Object.keys(pairBonuses).map(item=>({item,ownership:"owned",currentLevel:1})) };
let earlyPair = false;
for await (const page of compareProfileStrategies(paired, targets, false, 24, ["hp", "def"])) {
  if (page.matches.some(match=>match.builds?.some(build=>build.stats.atk===100 && build.stats.hp===110 && build.stats.def===110))) earlyPair=true;
}
assert.ok(earlyPair, "survival warm starts must find the compensating pair within a bounded search");

// Regression for the observed Ninja tradeoff: a 3-ATT shortfall ties in largest normalized
// deviation, even though the Royal Robe loses one Luck. At that tie, requested HP/DEF maxima win.
const ninjaTradeoffBuilds = {
  "Durable Garment": { atk: 822, spd: 696, lck: 400, dex: 11, hp: 4226, def: 1726 },
  "Royal Robe": { atk: 822, spd: 696, lck: 399, dex: 11, hp: 4687, def: 2192 },
};
const ninjaTradeoff = { characters: [{ id: "ninja", name: "Ninja", available: true, eligible: true,
  input: { baseStats: { atk: 0, spd: 0, lck: 0, dex: 0, hp: 0, def: 0 }, goals: {},
    slots: [{ slot: "Body", items: Object.keys(ninjaTradeoffBuilds) }], contribution: (item) => ninjaTradeoffBuilds[item] } }],
  inventory: [
    { item: "Durable Garment", ownership: "owned", currentLevel: 1 },
    { item: "Royal Robe", ownership: "owned", currentLevel: 90 },
  ] };
const ninjaTarget = [{ id: "ninja-target", atk: 825, spd: 696, lck: 400, dex: 11 }];
const ninjaTargetStats = { atk: 825, spd: 696, lck: 400, dex: 11 };
assert.ok(Math.abs(normalizedMaxDeviationBound(
  { atk: 822, spd: 696, lck: 399, dex: 11 }, {}, {}, ninjaTargetStats,
) - 3 / 825) < 1e-12, "the nearest-search bound uses the largest stat deviation, not the sum");
assert.equal(
  strategyMatchDeviation({ build: { stats: ninjaTradeoffBuilds["Durable Garment"] } }, ninjaTarget[0]),
  strategyMatchDeviation({ build: { stats: ninjaTradeoffBuilds["Royal Robe"] } }, ninjaTarget[0]),
  "the UI closeness metric reports the same largest deviation for both options",
);
const survivalChoice = await searchProfileStrategies(ninjaTradeoff, ninjaTarget);
async function searchProfileStrategies(searchInput, targetsInput) {
  let result;
  for await (const page of compareProfileStrategies(searchInput, targetsInput, false, 1_000, ["hp", "def"])) result = page.matches[0];
  return result;
}
assert.ok(Math.abs(survivalChoice.build.targetDistance - 3 / 825) < 1e-12);
assert.deepEqual([survivalChoice.build.stats.atk, survivalChoice.build.stats.spd, survivalChoice.build.stats.lck, survivalChoice.build.stats.dex,
  survivalChoice.build.stats.hp, survivalChoice.build.stats.def], [822, 696, 399, 11, 4687, 2192]);
assert.ok(survivalChoice.builds.some((build) => build.picks.some((pick) => pick.item === "Royal Robe" && pick.level === 90)), "the survival-favoring equally-close option remains in the requested HP/DEF frontier");
assert.ok(survivalChoice.builds.some((build) => build.picks.some((pick) => pick.item === "Durable Garment" && pick.level === 1)), "the distinct 400-Luck tuple remains available despite its survival disadvantage");
console.log("PASS: HP, MP and DEF maximize after exact DPS match; largest-deviation tie preserves the HP/DEF-favoring Ninja option; settings validated.");
