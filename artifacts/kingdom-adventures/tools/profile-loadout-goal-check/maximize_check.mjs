import assert from "node:assert/strict";
import { searchProfileGoalBuildPages } from "../../src/lib/profile-loadout-goal-planner.ts";

const gear = {
  vitality: (level) => ({ hp: 8 * level, def: 1, mp: -level, spd: 2 }),
  guard: (level) => ({ hp: 2 * level, def: 5 * level, mp: 2, spd: 1 }),
  mana: (level) => ({ hp: -level, def: 1, mp: 7 * level, spd: 2 }),
  unowned: (level) => ({ hp: 999 * level, def: 999, mp: 999 }),
};
const base = { hp: 10, def: 2, mp: 4, spd: 0 };
const slots = [{ slot: "Weapon", items: ["vitality", "guard", "unowned"] }, { slot: "Accessory", items: ["mana", "guard"] }];
const inventory = Object.keys(gear).map((item) => ({ item, ownership: item === "unowned" ? "unowned" : "owned", currentLevel: 1, quantity: 1 }));
const input = (goals) => ({ inventory, characters: [
  { id: "a", name: "Resident A", eligible: true, available: true, input: { baseStats: base, goals, slots, contribution: (item, level) => gear[item](level), maxLevel: 3 } },
  { id: "blocked", name: "Unavailable", eligible: true, available: false, input: { baseStats: { hp: 9999, def: 9999, mp: 9999 }, goals, slots: [], contribution: () => ({}) } },
] });
const collect = async (search, options = {}) => {
  const pages = [];
  for await (const page of searchProfileGoalBuildPages(search, { nodeSliceSize: 4, ...options })) pages.push(page);
  assert.equal(pages.at(-1).complete, true);
  return pages;
};
// Independent exhaustive oracle: no pruning or implementation helpers.
function oracle(goals, upgrade) {
  const all = [];
  function visit(index, stats, used, cost) {
    if (index === slots.length) {
      if (Object.entries(goals).every(([stat, goal]) => goal.mode === "maximize" || (goal.mode === "min" ? stats[stat] >= goal.min : goal.mode === "max" ? stats[stat] <= goal.max : stats[stat] >= goal.min && stats[stat] <= goal.max))) all.push({ stats, cost });
      return;
    }
    visit(index + 1, stats, used, cost);
    for (const item of slots[index].items) {
      if (item === "unowned" || used.includes(item)) continue;
      for (let level = 1; level <= (upgrade ? 3 : 1); level++) {
        const next = { ...stats };
        for (const [stat, value] of Object.entries(gear[item](level))) next[stat] = (next[stat] ?? 0) + value;
        visit(index + 1, next, [...used, item], cost + level - 1);
      }
    }
  }
  visit(0, base, [], 0);
  const objectives = Object.keys(goals).filter((stat) => goals[stat].mode === "maximize");
  const front = all.filter((b) => !all.some((a) => objectives.every((stat) => a.stats[stat] >= b.stats[stat]) && objectives.some((stat) => a.stats[stat] > b.stats[stat])));
  return [...new Set(front.map((b) => objectives.map((stat) => b.stats[stat]).join(",")))].sort();
}
let cases = 0;
for (const upgrade of [false, true]) for (const objectives of [["hp"], ["def"], ["mp"], ["hp", "def", "mp"]]) for (const spdCap of [0, 2, 4]) {
  const goals = Object.fromEntries(objectives.map((stat) => [stat, { mode: "maximize" }]));
  goals.spd = { mode: "max", max: spdCap };
  const pages = await collect(input(goals), { inventoryPolicy: upgrade ? "owned-upgrades" : "owned-current", includeCurrentBuilds: true, pageSize: 500 });
  const final = pages.at(-1);
  assert.deepEqual(final.builds.map((b) => objectives.map((stat) => b.stats[stat]).join(",")).sort(), oracle(goals, upgrade));
  assert.ok(final.builds.every((b) => b.characterId === "a" && b.picks.every((pick) => pick.item !== "unowned")));
  cases++;
}
const ordinary = await collect(input({ hp: { mode: "min", min: 10 }, spd: { mode: "range", min: 0, max: 4 } }));
assert.ok(ordinary.flatMap((page) => page.builds).some((b) => b.picks.length === 0));
const upgradeOnly = await collect(input({ hp: { mode: "min", min: 10 } }), { inventoryPolicy: "owned-upgrades" });
assert.ok(upgradeOnly.flatMap((page) => page.builds).every((b) => b.addedLevels > 0));
const combined = await collect(input({ hp: { mode: "min", min: 10 } }), { inventoryPolicy: "owned-upgrades", includeCurrentBuilds: true });
assert.ok(combined.flatMap((page) => page.builds).some((b) => b.addedLevels === 0));
assert.ok(combined.flatMap((page) => page.builds).some((b) => b.addedLevels > 0));
const goals = { hp: { mode: "maximize" }, def: { mode: "maximize" }, mp: { mode: "maximize" } };
const pages = await collect(input(goals), { inventoryPolicy: "owned-upgrades", includeCurrentBuilds: true, pageSize: 1 });
const completedPages = pages.filter((p) => p.completedCharacters === p.totalCharacters);
assert.deepEqual(completedPages.flatMap((p) => p.builds).map((b) => [b.stats.hp, b.stats.def, b.stats.mp].join(",")).sort(), oracle(goals, true));
const controller = new AbortController();
const iterator = searchProfileGoalBuildPages(input(goals), { signal: controller.signal, nodeSliceSize: 1 });
await iterator.next(); controller.abort();
const cancelled = await iterator.next();
assert.equal(cancelled.value.cancelled, true);
assert.equal(cancelled.value.complete, false);
console.log(JSON.stringify({ status: "passed", exhaustiveComparisons: cases, regression: ["hard constraints", "multiple-stat tradeoffs", "ownership", "unavailable residents", "upgrade opt-in", "legacy upgrade-only pass", "pagination", "cancellation"] }));
