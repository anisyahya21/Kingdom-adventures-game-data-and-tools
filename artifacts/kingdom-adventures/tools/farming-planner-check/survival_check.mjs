import assert from "node:assert/strict";
import { compareProfileStrategies } from "../../src/lib/profile-strategy-matches.ts";
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
console.log("PASS: HP, MP and DEF maximize after exact DPS match; all three survival tradeoffs preserved; settings validated.");
