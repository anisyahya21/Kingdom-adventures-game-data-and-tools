import assert from "node:assert/strict";
import { searchProfileGoalBuildPages } from "@/lib/profile-loadout-goal-planner";

function character(id, baseStats, goals, slots, values, extra = {}) {
  return {
    id, name: id, available: true, eligible: true, input: {
      baseStats, goals, slots,
      contribution: (item, level) => values[item]?.[level] ?? {},
    },
    ...extra,
  };
}

async function collect(search, options = {}) {
  const pages = [];
  const builds = [];
  for await (const page of searchProfileGoalBuildPages(search, options)) {
    pages.push(page);
    builds.push(...page.builds);
  }
  return { pages, builds };
}

// Exhaustive tiny oracle: compare the planner's complete results against every legal slot
// assignment, including empty slots and the rule that an equipment type can only appear once.
function brute(characterRow, inventory, { upgrades = false, maxLevel = 99 } = {}) {
  const owned = new Map(inventory.filter((row) => row.ownership === "owned" && Number.isInteger(row.currentLevel) && row.currentLevel >= 1 && row.currentLevel <= 99)
    .map((row) => [row.item, row.currentLevel]));
  const input = characterRow.input;
  const out = [];
  const used = new Set();
  const picks = [];
  const stats = { ...input.baseStats };
  const visit = (index) => {
    if (index === input.slots.length) {
      for (const [stat, goal] of Object.entries(input.goals)) {
        const value = stats[stat] ?? 0;
        const ok = goal.mode === "min" ? value >= goal.min
          : goal.mode === "max" ? value <= goal.max
            : value >= goal.min && value <= goal.max;
        if (!ok) return;
      }
      out.push(JSON.stringify({ picks, stats }));
      return;
    }
    const { slot, items } = input.slots[index];
    visit(index + 1);
    for (const item of new Set(items)) {
      const currentLevel = owned.get(item);
      if (currentLevel === undefined || used.has(item)) continue;
      used.add(item);
      const lastLevel = upgrades ? Math.max(currentLevel, Math.min(99, maxLevel)) : currentLevel;
      for (let level = currentLevel; level <= lastLevel; level += 1) {
        const contribution = input.contribution(item, level);
        picks.push({ slot, item, level });
        for (const [stat, value] of Object.entries(contribution)) stats[stat] = (stats[stat] ?? 0) + value;
        visit(index + 1);
        for (const [stat, value] of Object.entries(contribution)) stats[stat] -= value;
        picks.pop();
      }
      used.delete(item);
    }
  };
  visit(0);
  return out.sort();
}

const inventory = [
  { item: "positive", ownership: "owned", currentLevel: 2, quantity: 1 },
  { item: "negative", ownership: "owned", currentLevel: 3, quantity: 1 },
  { item: "unowned", ownership: "unowned", currentLevel: 8 },
  { item: "unknown", ownership: "unknown", currentLevel: 9 },
  { item: "bad-level", ownership: "owned", currentLevel: 100 },
];
const values = {
  positive: { 2: { hp: 4, atk: -2 } },
  negative: { 3: { hp: -3, atk: 5 } },
};

const cases = [
  character("multi-goal", { hp: 5, atk: 5 }, {
    hp: { mode: "range", min: 6, max: 9 }, atk: { mode: "min", min: 3 },
  }, [{ slot: "weapon", items: ["positive", "unowned", "unknown", "bad-level"] }, { slot: "body", items: ["negative"] }], values),
  character("max-and-negative", { hp: 10, atk: 4 }, {
    hp: { mode: "max", max: 7 }, atk: { mode: "range", min: 2, max: 4 },
  }, [{ slot: "weapon", items: ["positive", "negative"] }], values),
  character("already-met", { hp: 6, atk: 3 }, {
    hp: { mode: "min", min: 6 }, atk: { mode: "max", max: 3 },
  }, [{ slot: "weapon", items: ["positive"] }], values),
];

for (const row of cases) {
  const { pages, builds } = await collect({ characters: [row], inventory }, { pageSize: 1, nodeSliceSize: 2 });
  const actual = builds.map((build) => JSON.stringify({ picks: build.picks, stats: build.stats })).sort();
  assert.deepEqual(actual, brute(row, inventory), `${row.id}: all matching combinations match brute force`);
  assert.equal(pages.at(-1).complete, true, `${row.id}: final page marks completion`);
  assert.ok(builds.every((build) => build.picks.every((pick) => pick.level === inventory.find((entry) => entry.item === pick.item).currentLevel)), `${row.id}: keeps recorded current levels`);
  assert.ok(pages.length > 1, `${row.id}: page continuation exercised`);
}

const allCharacters = await collect({
  characters: [cases[0], { ...cases[0], id: "unavailable", available: false }, { ...cases[0], id: "ineligible", eligible: false }],
  inventory,
}, { pageSize: 500, nodeSliceSize: 20_000 });
assert.ok(allCharacters.builds.length > 0);
assert.ok(allCharacters.builds.every((build) => build.characterId === "multi-goal"), "all available eligible character matches are retained; excluded characters are skipped");
assert.equal(allCharacters.pages.at(-1).completedCharacters, 3);

// Round-robin scheduling must surface a quick later character while an earlier search has a
// combinatorial tree. With the former character-at-a-time loop the first yielded page was empty.
const manyItems = Array.from({ length: 12 }, (_, index) => `slot-item-${index}`);
const manyInventory = manyItems.map((item) => ({ item, ownership: "owned", currentLevel: 4 }));
const manyValues = Object.fromEntries(manyItems.map((item) => [item, { 4: { hp: 1 } }]));
const slow = character("slow-first", { hp: 0 }, { hp: { mode: "min", min: 12 } },
  manyItems.map((item, index) => ({ slot: `slot-${index}`, items: [item] })), manyValues,
  { available: true, eligible: true });
const quick = character("quick-second", { hp: 12 }, { hp: { mode: "min", min: 12 } }, [], manyValues,
  { available: true, eligible: true });
const interleaved = searchProfileGoalBuildPages({ characters: [slow, quick], inventory: manyInventory }, { pageSize: 1, nodeSliceSize: 20_000 });
const firstInterleavedPage = await interleaved.next();
assert.equal(firstInterleavedPage.done, false);
assert.equal(firstInterleavedPage.value.builds[0]?.characterId, "quick-second", "later quick character is visible before the earlier combinatorial search completes");
await interleaved.return();

const impossible = character("impossible", { hp: 1 }, { hp: { mode: "min", min: 100 } }, [{ slot: "weapon", items: ["positive"] }], values);
const pruned = await collect({ characters: [impossible], inventory }, { nodeSliceSize: 20_000 });
assert.equal(pruned.builds.length, 0);
assert.equal(pruned.pages.at(-1).complete, true);
assert.equal(pruned.pages.at(-1).searchNodes, 1, "impossible branch is rejected by safe remaining-stat bounds at root");

const upgradeInventory = [
  { item: "upgradeable", ownership: "owned", currentLevel: 2, quantity: 1 },
  { item: "not-owned", ownership: "unowned", currentLevel: 1 },
  { item: "unknown-level", ownership: "owned", currentLevel: null },
];
const upgradeCharacter = character("upgrade-case", { hp: 0 }, { hp: { mode: "range", min: 3, max: 4 } },
  [{ slot: "weapon", items: ["upgradeable", "not-owned", "unknown-level"] }],
  { upgradeable: { 1: { hp: 1 }, 2: { hp: 2 }, 3: { hp: 3 }, 4: { hp: 4 }, 5: { hp: 5 } } });
upgradeCharacter.input.maxLevel = 4;
const currentOnly = await collect({ characters: [upgradeCharacter], inventory: upgradeInventory }, { inventoryPolicy: "owned-current", pageSize: 20 });
assert.equal(currentOnly.builds.length, 0, "owned-current excludes an unmet target without proposing upgrades");
const upgradePass = await collect({ characters: [upgradeCharacter], inventory: upgradeInventory }, { inventoryPolicy: "owned-upgrades", pageSize: 1 });
assert.equal(upgradePass.pages.length, 3, "all upgrade matches and the final completion marker continue across pages");
assert.equal(upgradePass.pages[0].complete, false);
assert.equal(upgradePass.pages[1].complete, false);
assert.equal(upgradePass.pages[2].complete, true);
assert.deepEqual(upgradePass.pages.map((page) => page.matchingBuilds), [1, 2, 2], "matching count accumulates across consumed pages");
assert.deepEqual(upgradePass.builds.map((build) => JSON.stringify({ picks: build.picks, stats: build.stats })).sort(),
  brute(upgradeCharacter, upgradeInventory, { upgrades: true, maxLevel: 4 }).filter((entry) => {
    const parsed = JSON.parse(entry);
    return parsed.picks.some((pick) => pick.level > 2);
  }).sort(), "capped upgrade search exactly matches brute force");
assert.deepEqual(upgradePass.builds.map((build) => [build.picks[0]?.level, build.addedLevels, build.requiredUpgrades]), [
  [3, 1, [{ item: "upgradeable", currentLevel: 2, requiredLevel: 3, addedLevels: 1 }]],
  [4, 2, [{ item: "upgradeable", currentLevel: 2, requiredLevel: 4, addedLevels: 2 }]],
], "upgrade pass enumerates each matching level, never downgrades, excludes unowned/unknown, and reports exact added levels");
assert.ok(upgradePass.builds.every((build) => build.picks.every((pick) => pick.item === "upgradeable" && pick.level >= 2 && pick.level <= 4)), "upgrade candidates stay within recorded-to-cap levels");

const targetMetNow = character("current-is-enough", { hp: 0 }, { hp: { mode: "min", min: 2 } },
  [{ slot: "weapon", items: ["upgradeable"] }], { upgradeable: { 2: { hp: 2 }, 3: { hp: 3 }, 4: { hp: 4 } } });
targetMetNow.input.maxLevel = 4;
const upgradesOnly = await collect({ characters: [targetMetNow], inventory: upgradeInventory }, { inventoryPolicy: "owned-upgrades", pageSize: 20 });
assert.deepEqual(upgradesOnly.builds.map((build) => build.picks[0]?.level), [3, 4], "upgrade pass omits current-only build while preserving actual upgrade options");

const controller = new AbortController();
const iterator = searchProfileGoalBuildPages({ characters: [cases[0]], inventory }, { pageSize: 500, nodeSliceSize: 1, signal: controller.signal });
const firstPage = await iterator.next();
assert.equal(firstPage.done, false);
assert.equal(firstPage.value.complete, false);
controller.abort();
const cancelledPage = await iterator.next();
assert.equal(cancelledPage.done, false);
assert.equal(cancelledPage.value.cancelled, true, "abort is observable after event-loop continuation");

console.log("profile-loadout-goal planner checks passed");
