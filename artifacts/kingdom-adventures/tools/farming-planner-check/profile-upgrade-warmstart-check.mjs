import assert from "node:assert/strict";
import { compareProfileStrategies } from "../../src/lib/profile-strategy-matches.ts";

const input = {
  characters: [{ id: "profile-a", name: "Profile A", available: true, eligible: true, input: {
    baseStats: { atk: 100, spd: 50, lck: 20, dex: 18, hp: 100, def: 10 }, goals: {},
    slots: [{ slot: "Body", items: ["Owned body"] }],
    contribution: (_item, level) => ({ hp: level * 10, atk: 0 }),
  } }],
  inventory: [{ item: "Owned body", ownership: "owned", currentLevel: 1 }],
};
const target = [{ id: "profile-target", atk: 100, spd: 50, lck: 20, dex: 18 }];

async function run(searchInput, targets, upgrades, budget, maximize = ["hp"]) {
  let result;
  for await (const page of compareProfileStrategies(searchInput, targets, upgrades, budget, maximize)) result = page.matches[0];
  return result;
}

const smallUpgradeSearch = await run(input, target, true, 100);
assert.ok(smallUpgradeSearch.builds?.length > 0, "owned-current candidates remain available if the bounded upgrade pass is still warming");
assert.ok(smallUpgradeSearch.searchNodes <= 100, "both passes share the caller's one per-target cap");
assert.equal(smallUpgradeSearch.complete, false, "a bounded unfinished upgrade pass remains provisional");
assert.ok(smallUpgradeSearch.builds.some((build) => build.picks.some((pick) => pick.item === "Owned body" && pick.level === 1)),
  "the exact owned-current package is never discarded by the upgrade pass");

const largeUpgradeSearch = await run(input, target, true, 1_000);
assert.ok(largeUpgradeSearch.searchNodes <= 1_000, "larger search still respects its total per-target node cap");
assert.ok(largeUpgradeSearch.builds.some((build) => build.picks.some((pick) => pick.item === "Owned body" && pick.level === 1)),
  "larger upgrade search retains the owned-current baseline");
assert.ok(Math.max(...largeUpgradeSearch.builds.map((build) => build.stats.hp)) >= Math.max(...smallUpgradeSearch.builds.map((build) => build.stats.hp)),
  "additional upgrade budget may improve the frontier without losing the current candidate");

const currentOnly = await run(input, target, false, 1_000);
assert.equal(currentOnly.complete, true, "upgrades-disabled search keeps its existing exhaustive behavior");
assert.deepEqual(currentOnly.builds.map((build) => build.picks[0]?.level ?? null), [1], "upgrades-disabled result contains only owned current levels");
const exactOwnedUpgradeSearch = await run(input, target, true, 1_000, []);
assert.equal(exactOwnedUpgradeSearch.complete, true, "an exact current-level tuple proves existence without wasting the remaining upgrade budget");
assert.ok(exactOwnedUpgradeSearch.builds.length > 0);

const paired = {
  characters: [
    { ...input.characters[0], id: "hp-heavy", input: { ...input.characters[0].input, baseStats: { ...input.characters[0].input.baseStats, hp: 200, def: 10 }, slots: [{ slot: "Body", items: ["HP body"] }], contribution: (_item, level) => ({ hp: level * 10 }) } },
    { ...input.characters[0], id: "def-heavy", input: { ...input.characters[0].input, baseStats: { ...input.characters[0].input.baseStats, hp: 100, def: 20 }, slots: [{ slot: "Body", items: ["DEF body"] }], contribution: (_item, level) => ({ def: level * 10 }) } },
  ],
  inventory: [
    { item: "HP body", ownership: "owned", currentLevel: 1 },
    { item: "DEF body", ownership: "owned", currentLevel: 1 },
  ],
};
const fairProfiles = await run(paired, target, true, 1_000, ["hp", "def"]);
assert.ok(fairProfiles.searchNodes <= 1_000, "multiple-character passes share one target budget");
assert.ok(fairProfiles.builds.some((build) => build.characterId === "hp-heavy"));
assert.ok(fairProfiles.builds.some((build) => build.characterId === "def-heavy"), "round-robin character search retains a non-dominated second profile");

console.log(JSON.stringify({
  status: "passed",
  small: { nodes: smallUpgradeSearch.searchNodes, complete: smallUpgradeSearch.complete, candidates: smallUpgradeSearch.builds.length, bestHp: Math.max(...smallUpgradeSearch.builds.map((build) => build.stats.hp)) },
  large: { nodes: largeUpgradeSearch.searchNodes, complete: largeUpgradeSearch.complete, candidates: largeUpgradeSearch.builds.length, bestHp: Math.max(...largeUpgradeSearch.builds.map((build) => build.stats.hp)) },
  upgradesDisabled: { nodes: currentOnly.searchNodes, complete: currentOnly.complete, candidates: currentOnly.builds.length },
}));
