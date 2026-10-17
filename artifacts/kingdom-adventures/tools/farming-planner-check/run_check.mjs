import assert from "node:assert/strict";
import { ENCOUNTER_VARIANTS } from "../../src/lib/battle-setup.ts";
import { DEFAULT_FARMING_SETTINGS, farmingConsumableStock, normalizeFarmingSettings, switchEncounterFamily, ENCOUNTER_FAMILIES } from "../../src/lib/farming-planner.ts";
import { FARMING_FAVORITES_KEY, readFarmingFavorites, saveFarmingFavorite, favoriteToLoadout, removeFarmingFavorite } from "../../src/lib/farming-favorites.ts";

assert.deepEqual(normalizeFarmingSettings(null), DEFAULT_FARMING_SETTINGS);
assert.equal(normalizeFarmingSettings({ encounterId: -1 }).encounterId, DEFAULT_FARMING_SETTINGS.encounterId);
assert.deepEqual(normalizeFarmingSettings({ excludedCharacters: ["keep", 9] }).excludedCharacters, ["keep"]);
let familyCases = 0;
for (const encounter of ENCOUNTER_VARIANTS) for (const family of ENCOUNTER_FAMILIES) {
  const next = switchEncounterFamily({ ...DEFAULT_FARMING_SETTINGS, encounterId: encounter.id }, family.id);
  const actual = ENCOUNTER_VARIANTS.find((row) => row.id === next.encounterId);
  assert.equal(actual.familyId, family.id);
  const sameDifficulty = ENCOUNTER_VARIANTS.find((row) => row.familyId === family.id && row.difficulty === encounter.difficulty);
  if (sameDifficulty) assert.equal(actual.id, sameDifficulty.id);
  familyCases += 1;
}

// Provisioning uses finite stock rather than a duration estimate.
const capped = normalizeFarmingSettings({ holyHerbLimit: 3, recoveryPotionLimit: 2 });
assert.deepEqual(farmingConsumableStock(capped), { holyHerbStock: 3, itemStock: { "Recovery Potion (L)": 2 } });
assert.deepEqual(farmingConsumableStock({ ...capped, allowConsumables: false }), { holyHerbStock: 0, itemStock: { "Recovery Potion (L)": 0 } });
assert.equal(normalizeFarmingSettings({ holyHerbLimit: -2 }).holyHerbLimit, 0);
assert.equal(normalizeFarmingSettings({ recoveryPotionLimit: 1.8 }).recoveryPotionLimit, 1);
assert.equal(normalizeFarmingSettings({ holyHerbLimit: Infinity }).holyHerbLimit, 0);
assert.equal(normalizeFarmingSettings({ recoveryPotionLimit: 1000 }).recoveryPotionLimit, 999);

// Isolated storage double: no browser profile, account, or real strategy evidence is modified.
const data = new Map(); let rejectWrites = false;
globalThis.window = new EventTarget();
globalThis.localStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => { if (rejectWrites) throw new Error("quota"); data.set(key, value); },
};
const profile = { version: 1, characters: [{ id: "fixture-character", gender: 1, jobName: "Champion", rank: "A", statLevels: { atk: 10, hp: 20 } }], equipment: { "Fixture sword": 10 }, valuables: {} };
const build = { characterId: "fixture-character", characterName: "Fixture DPS", jobName: "Champion", rank: "A", picks: [{ slot: "Weapon", item: "Fixture sword", level: 20 }], skills: ["Fixture required skill"], stats: { atk: 100, hp: 200 }, addedLevels: 10, requiredUpgrades: [{ item: "Fixture sword", currentLevel: 10, requiredLevel: 20, addedLevels: 10 }] };
const goals = { atk: { mode: "min", min: 100 } };
const saved = saveFarmingFavorite(build, profile, goals, true);
assert.equal(readFarmingFavorites().length, 1);
assert.equal(saveFarmingFavorite(build, profile, goals, true).id, saved.id);
assert.equal(readFarmingFavorites().length, 1, "identical build must not duplicate");
build.picks[0].level = 99; build.skills.push("later edit"); profile.characters[0].statLevels.atk = 999; goals.atk.min = 999;
const restored = JSON.parse(data.get(FARMING_FAVORITES_KEY)).builds[0];
assert.equal(restored.build.picks[0].level, 20);
assert.deepEqual(restored.build.skills, ["Fixture required skill"]);
assert.equal(restored.profile.characters[0].statLevels.atk, 10);
assert.equal(restored.search.goals.atk.min, 100);
const loadout = favoriteToLoadout(restored);
assert.equal(loadout.id, favoriteToLoadout(restored).id, "stable destination ID supports upsert");
assert.equal(loadout.equipment[0].level, 20);
assert.equal(loadout.useProfileInventory, false);
assert.equal(loadout.gender, 1, "favorite preserves the source character gender");
assert.deepEqual(loadout.skills, ["Fixture required skill"]);
rejectWrites = true;
assert.throws(() => removeFarmingFavorite(saved.id), /storage/);
assert.equal(readFarmingFavorites().length, 1, "failed write preserves saved favorite");
rejectWrites = false;
removeFarmingFavorite(saved.id);
assert.equal(readFarmingFavorites().length, 0);
data.set(FARMING_FAVORITES_KEY, "broken json"); assert.deepEqual(readFarmingFavorites(), []);
console.log(JSON.stringify({ status: "passed", familyCases, favorites: ["saved snapshot", "duplicate prevention", "gear levels", "required skills", "search settings", "stable builder ID", "storage failure", "removal", "malformed storage"] }));
