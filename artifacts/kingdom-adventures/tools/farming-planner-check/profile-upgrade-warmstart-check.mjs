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

const accountLikeCharacters = [];
const accountLikeInventory = [];
const accountLikeBonuses = new Map();
for (const [characterId, hp, def] of [["profile-ninja", 100, 30], ["profile-samurai", 130, 20]]) {
  const slotItems = ["Weapon", "Body", "Accessory"].map((slot, slotIndex) => {
    const names = Array.from({ length: 24 }, (_, itemIndex) => `${characterId} ${slot} ${itemIndex}`);
    for (let itemIndex = 0; itemIndex < names.length; itemIndex += 1) {
      const item = names[itemIndex];
      accountLikeInventory.push({ item, ownership: "owned", currentLevel: 40 + (itemIndex % 10) });
      accountLikeBonuses.set(item, slotIndex === 0 ? { atk: itemIndex - 12, hp: 20 } : slotIndex === 1 ? { def: itemIndex, hp: 10 } : { spd: itemIndex - 12, hp: 5 });
    }
    return { slot, items: names };
  });
  const skillSets = [[], ...Array.from({ length: 9 }, (_, index) => [`${characterId} resistance ${index}`])];
  for (const skills of skillSets) {
    accountLikeCharacters.push({
      id: characterId, name: characterId, jobName: characterId === "profile-ninja" ? "Ninja" : "Samurai", rank: "A", skills,
      skillItems: Object.fromEntries(skills.map((skill) => [skill, [slotItems[0].items[0]]])), available: true, eligible: true,
      input: {
        baseStats: { atk: 700, spd: 500, lck: 100, dex: 11, hp, def }, goals: {}, slots: slotItems,
        contribution: (item) => accountLikeBonuses.get(item),
      },
    });
  }
}
let fullAccountContexts;
for await (const page of compareProfileStrategies({ characters: accountLikeCharacters, inventory: accountLikeInventory },
  [{ id: "full-profile-target", atk: 700, spd: 500, lck: 100, dex: 11 }], true, 5_000, ["hp", "def"])) fullAccountContexts = page.matches[0];
assert.ok(fullAccountContexts.searchNodes <= 5_000, "2-character x 10-skill-context comparison stays within its original total target cap");
assert.deepEqual(new Set(fullAccountContexts.builds.filter((build) => build.addedLevels === 0 && build.picks.length >= 2).map((build) => build.characterId)),
  new Set(["profile-ninja", "profile-samurai"]), "primary full-current searches retain multi-slot builds from both actual profile-character groups");
assert.ok(fullAccountContexts.builds.some((build) => build.addedLevels === 0 && build.skills?.length === 0),
  "the current-level pass selects the fewest-required-skills context before broader upgrade contexts");

console.log(JSON.stringify({
  status: "passed",
  small: { nodes: smallUpgradeSearch.searchNodes, complete: smallUpgradeSearch.complete, candidates: smallUpgradeSearch.builds.length, bestHp: Math.max(...smallUpgradeSearch.builds.map((build) => build.stats.hp)) },
  large: { nodes: largeUpgradeSearch.searchNodes, complete: largeUpgradeSearch.complete, candidates: largeUpgradeSearch.builds.length, bestHp: Math.max(...largeUpgradeSearch.builds.map((build) => build.stats.hp)) },
  upgradesDisabled: { nodes: currentOnly.searchNodes, complete: currentOnly.complete, candidates: currentOnly.builds.length },
  fullAccountContexts: { nodes: fullAccountContexts.searchNodes, complete: fullAccountContexts.complete, totalContexts: accountLikeCharacters.length,
    candidates: fullAccountContexts.builds.length, currentMultiSlotCharacters: [...new Set(fullAccountContexts.builds.filter((build) => build.addedLevels === 0 && build.picks.length >= 2).map((build) => build.characterId))] },
}));
