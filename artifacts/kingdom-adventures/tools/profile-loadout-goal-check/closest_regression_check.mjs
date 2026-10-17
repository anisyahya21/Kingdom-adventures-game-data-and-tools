import assert from "node:assert/strict";
import { searchProfileGoalBuildPages } from "../../src/lib/profile-loadout-goal-planner.ts";

// Synthetic reproduction of the reported failure: irrelevant resistance contexts,
// empty head/shield choices, and upgrade levels that improve HP/MP/DEF only.
const targets = { atk: 1062, spd: 725, lck: 628 };
const base = {
  id: "same-resident", name: "Synthetic resident", available: true, eligible: true,
  skillItems: { "Bow Resistance": ["Bow"] },
  input: {
    baseStats: { atk: 389, spd: 541, lck: 627, hp: 2803, mp: 710, def: 451, dex: 13 },
    goals: { hp: { mode: "maximize" }, mp: { mode: "maximize" }, def: { mode: "maximize" }, dex: { mode: "max", max: 20 } },
    maxLevel: 2,
    slots: [{ slot: "Weapon", items: ["Sword"] }, { slot: "Head", items: ["Helmet"] }, { slot: "Shield", items: ["Shield"] }],
    contribution: (item, level) => item === "Sword" ? { atk: 673, spd: 184, lck: 1 }
      : item === "Helmet" ? { hp: 50 * level, mp: 20 * level, def: 100 * level }
      : { hp: 10 * level, mp: 30 * level, def: 50 * level },
  },
};
const input = { characters: [[], ["Bow Resistance"], ["Bow Resistance"]].map((skills) => ({ ...base, skills })), inventory: ["Sword", "Helmet", "Shield"].map((item) => ({ item, ownership: "owned", currentLevel: 1 })) };
const options = { nearestTargets: targets, inventoryPolicy: "owned-upgrades", includeCurrentBuilds: true, maxSearchNodes: 4 };
const iterator = searchProfileGoalBuildPages(input, options);
let pauses = 0, final, previousNodes = -1;
for await (const page of iterator) {
  if (page.limited) {
    assert.ok(page.searchNodes > previousNodes, "refinement must advance the same cursor");
    previousNodes = page.searchNodes; pauses++;
    options.maxSearchNodes += 25;
  }
  if (page.complete) final = page;
}
assert.ok(pauses > 0);
assert.ok(final.complete);
const winner = final.builds[0];
assert.equal(winner.targetDistance, 0);
assert.ok(winner.picks.some((pick) => pick.item === "Helmet" && pick.level === 2));
assert.ok(winner.picks.some((pick) => pick.item === "Shield" && pick.level === 2));
assert.deepEqual(winner.skills, [], "unused Bow Resistance must be removed");
assert.equal(winner.stats.mp, 810);
assert.equal(winner.stats.def, 751);
assert.equal(winner.stats.hp, 2923);
const keys = final.builds.map((build) => [build.characterId, ...["atk", "spd", "lck", "hp", "mp", "def", "dex"].map((stat) => build.stats[stat])].join("|"));
assert.equal(new Set(keys).size, keys.length, "equivalent skill/level outcomes must be grouped");
console.log(`Passed: useful helmet/shield upgrades, unused-skill removal, ${keys.length} distinct outcomes, ${pauses} resumable pauses.`);
