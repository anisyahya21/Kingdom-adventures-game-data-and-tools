import assert from "node:assert/strict";
import { searchProfileGoalBuildPages } from "../../src/lib/profile-loadout-goal-planner.ts";

const targets = { atk: 17, spd: 11, lck: 7 };
const character = {
  id: "nearest", name: "nearest", available: true, eligible: true,
  input: { baseStats: { atk: 2, spd: 1, lck: 1 }, goals: {}, maxLevel: 8,
    slots: [{ slot: "Weapon", items: ["a", "b"] }, { slot: "Head", items: ["c"] }, { slot: "Body", items: ["d"] }],
    contribution: (item, level) => ({ atk: level * (item === "b" ? 2 : 1), spd: item === "c" ? level : 0, lck: item === "d" ? level : 0 }) },
};
const inventory = ["a", "b", "c", "d"].map((item) => ({ item, ownership: "owned", currentLevel: 1 }));
const all = [];
const exhaustive = { ...character, input: { ...character.input, goals: { atk: { mode: "min", min: 0 } } } };
for await (const page of searchProfileGoalBuildPages({ characters: [exhaustive], inventory }, { inventoryPolicy: "owned-upgrades", includeCurrentBuilds: true })) all.push(...page.builds);
const score = (build) => Object.entries(targets).reduce((sum, [stat, target]) => sum + Math.abs(build.stats[stat] - target) / target, 0);
all.sort((a, b) => score(a) - score(b) || a.addedLevels - b.addedLevels || a.picks.length - b.picks.length);
let final;
for await (const page of searchProfileGoalBuildPages({ characters: [character], inventory }, { nearestTargets: targets, inventoryPolicy: "owned-upgrades", includeCurrentBuilds: true, maxSearchNodes: 1_000_000 })) final = page;
assert.equal(final.complete, true);
assert.equal(final.builds.length, 40);
assert.deepEqual(final.builds.map((b) => [b.targetDistance, b.addedLevels, b.picks.length]), all.slice(0, 40).map((b) => [score(b), b.addedLevels, b.picks.length]));
for (const build of final.builds) assert.ok(all.some((entry) => JSON.stringify(entry.picks) === JSON.stringify(build.picks)));
let limited;
for await (const page of searchProfileGoalBuildPages({ characters: [character], inventory }, { nearestTargets: targets, maxSearchNodes: 1 })) limited = page;
assert.equal(limited.limited, true);
assert.equal(limited.complete, false);
assert.equal(limited.searchNodes, 1);
console.log(`Nearest top 40 matches exhaustive ranking of ${all.length} builds; step limit is explicitly provisional.`);
