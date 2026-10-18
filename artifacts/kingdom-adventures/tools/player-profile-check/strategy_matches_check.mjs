import assert from "node:assert/strict";
import { compareProfileStrategies, isExactStrategyBuild, measuredStrategyTargetId, strategyMatchDeviation } from "../../src/lib/profile-strategy-matches.ts";
import { chestStrategyGoals, strategyOptionForProfileBuild } from "../../src/lib/chest-strategy-targets.ts";

const input = {
  characters: [{ id: "owned-resident", name: "Resident", available: true, eligible: true, input: {
    baseStats: { atk: 100, spd: 50, lck: 20, dex: 18 }, goals: {},
    slots: [{ slot: "Weapon", items: ["Owned Sword"] }],
    contribution: (_item, level) => ({ atk: level * 10, spd: 0, lck: 0 }),
  }}],
  inventory: [{ item: "Owned Sword", ownership: "owned", currentLevel: 1 }],
};
const targets = [{id:"exact",atk:110,spd:50,lck:20}, {id:"near",atk:115,spd:50,lck:20}, {id:"far-luck",atk:110,spd:50,lck:10}];
let result;
for await (const progress of compareProfileStrategies(input, targets, false)) result = progress;
assert.equal(result.complete,true);
assert.equal(result.matches.length,3);
assert.equal(strategyMatchDeviation(result.matches[0],targets[0]),0);
assert.equal(result.matches[0].build.picks[0].item,"Owned Sword");
assert.equal(result.matches[0].build.picks[0].level,1);
assert.ok(strategyMatchDeviation(result.matches[1],targets[1])<=0.1);
assert.equal(strategyMatchDeviation(result.matches[2],targets[2]),1,"double Luck must not be labeled nearby");
const upgradeTarget = {id:"upgrade",atk:200,spd:50,lck:20};
for await (const progress of compareProfileStrategies(input,[upgradeTarget],true)) result = progress;
assert.equal(strategyMatchDeviation(result.matches[0],upgradeTarget),0);
assert.equal(result.matches[0].build.addedLevels,9);
assert.equal(result.matches[0].build.requiredUpgrades[0].requiredLevel,10);
console.log("PASS profile comparison: exact owned gear, nearby stats, double-Luck mismatch and required upgrades.");

assert.ok(strategyMatchDeviation({ ...result.matches[0], build: { ...result.matches[0].build, stats: { atk: 200, spd: 50, lck: 20, dex: 49 } } }, upgradeTarget) > 1, 'DEX mismatch must prevent exact performance matching');

const originalMeasured = { id: "repro", encounter: 19, atk: 1112, spd: 516, lck: 281, dex: 18, mean: 12.4, highest: 26, n: 120, source: "fixed research team" };
const legalNearbyStats = { atk: 1156, spd: 509, lck: 302, dex: 17 };
const actualBuildOption = strategyOptionForProfileBuild(originalMeasured, legalNearbyStats);
assert.deepEqual([actualBuildOption.atk, actualBuildOption.spd, actualBuildOption.lck, actualBuildOption.dex], [1156,509,302,17]);
assert.equal(actualBuildOption.mean, undefined, "unmeasured reward must remain unknown, not a zero reward or inherited mean");
assert.equal(actualBuildOption.n, undefined, "unmeasured sample count must remain unknown");
assert.equal(actualBuildOption.highest, undefined, "unmeasured profile stats must not inherit the target record");
assert.match(actualBuildOption.status, /unmeasured/);
const window = chestStrategyGoals(actualBuildOption, { atk: 15, spd: 15, lck: 15 });
assert.deepEqual([window.atk.min, window.atk.max, window.spd.min, window.spd.max, window.lck.min, window.lck.max, window.dex.min, window.dex.max], [1141,1171,494,524,287,317,17,17], "profile search window must include the found build in all four stats");
const variantTarget = { id: measuredStrategyTargetId("E19", [1334,516,281,18]), atk: 1334, spd: 516, lck: 281, dex: 18 };
assert.equal(measuredStrategyTargetId("E19", [1334,516,281,18]), variantTarget.id, "same four-stat tuple shares one lazy check");
assert.notEqual(measuredStrategyTargetId("E19", [1334,516,281,17]), variantTarget.id, "DEX-distinct tuples receive separate checks");
assert.equal(isExactStrategyBuild({ ...result.matches[0].build, stats: legalNearbyStats }, variantTarget), false, "legal nearby tuple must not be labeled exact achievable");
console.log("PASS measured variant checks: unique tuple identity, exactness, nearby legal build target windows, and unmeasured reward separation.");
