import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PLAYER_PROFILE_KEY, PLAYER_PROFILE_EVENT, PLAYER_VALUABLES,
  readPlayerProfile, writePlayerProfile, sanitizePlayerProfile, migratePlayerProfile, profileResidentStatItems, readProfileStorageError,
  setPlayerProfileAccountScope, playerProfileStorageKey,
} from "../../src/lib/player-profile.ts";
import { EQUIPMENT_CATALOG } from "../../src/lib/generated-equipment-data.ts";
import { STAT_KEYS } from "../../src/game-data/stat-parameter-ids.ts";

const storage = new Map();
const browser = new EventTarget();
browser.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};
globalThis.window = browser;
let notifications = 0;
browser.addEventListener(PLAYER_PROFILE_EVENT, () => notifications++);

// Existing preferences must survive migration, including water counts above the CSV copy count.
storage.set("ka_resident_stat_items", JSON.stringify({ life: 42, might: 3, bogus: 9 }));
storage.set("houses-facilities-know-how", "4");
storage.set("houses-facilities-craftsman", "5");
assert.deepEqual(readPlayerProfile(), migratePlayerProfile({ life: 42, might: 3 }, 4, 5));
assert.deepEqual(readPlayerProfile().equipment, {});
assert.deepEqual(readPlayerProfile().characters, []);
assert.equal(readPlayerProfile(), readPlayerProfile(), "external-store snapshot identity is stable");

const name = EQUIPMENT_CATALOG[0].name;
writePlayerProfile((previous) => ({ ...previous, equipment: { [name]: 1 } }));
writePlayerProfile((previous) => ({ ...previous, equipment: { ...previous.equipment, [name]: 12 },
  characters: [{ id: "resident-1", jobName: "Knight", rank: "S", statLevels: { hp: 40, atk: 20 } }],
}));
assert.equal(readPlayerProfile().equipment[name], 12);
assert.equal(readPlayerProfile().characters[0].statLevels.hp, 40);
assert.equal(readPlayerProfile().characters[0].statLevels.spd, 1);
assert.equal(Object.keys(readPlayerProfile().characters[0].statLevels).length, STAT_KEYS.length);
assert.equal(readPlayerProfile().valuables["know-how"], 4);

// Changes in the facilities/water adapters preserve the remaining player inventory.
writePlayerProfile((previous) => ({ ...previous, valuables: { ...previous.valuables, life: 7, "know-how": 2 } }));
assert.equal(JSON.parse(storage.get("ka_resident_stat_items")).life, 7);
assert.equal(JSON.parse(storage.get("houses-facilities-know-how")), 2);
assert.equal(readPlayerProfile().equipment[name], 12);
assert.deepEqual(profileResidentStatItems(readPlayerProfile()), { life: 7, might: 3 });
assert.equal(notifications, 3);

// Storage from another tab replaces the snapshot; a later updater uses the current stored data.
const crossTab = { ...readPlayerProfile(), valuables: { life: 9, craftsman: 6 } };
storage.set(PLAYER_PROFILE_KEY, JSON.stringify(crossTab));
assert.equal(readPlayerProfile().valuables.life, 9);
writePlayerProfile((previous) => ({ ...previous, valuables: { ...previous.valuables, might: 8 } }));
assert.equal(readPlayerProfile().valuables.life, 9);
assert.equal(readPlayerProfile().valuables.craftsman, 6);

const malformed = sanitizePlayerProfile({ equipment: { [name]: -2, missing: 90 }, valuables: { life: 3.9, bogus: 7, might: Infinity },
  characters: [{ id: "a", jobName: "Knight", rank: "A", statLevels: { hp: -4, atk: 2000 } }, { id: "a", jobName: "Knight", rank: "A" }] });
assert.deepEqual(malformed.equipment, {});
assert.deepEqual(malformed.valuables, { life: 3 });
assert.equal(malformed.characters.length, 1);
assert.equal(malformed.characters[0].statLevels.hp, 1);
assert.equal(malformed.characters[0].statLevels.atk, 999);
assert.equal(sanitizePlayerProfile({ equipment: { [name]: 999 } }).equipment[name], 99);
// An authoritative empty profile must never revive a legacy water mirror.
writePlayerProfile((previous) => ({ ...previous, valuables: {} }));
assert.deepEqual(profileResidentStatItems(readPlayerProfile()), {});
assert.deepEqual(JSON.parse(storage.get("ka_resident_stat_items")), {});
// Storage failures preserve edits in memory without reporting a successful durable save.
const originalSet = browser.localStorage.setItem;
browser.localStorage.setItem = () => { throw new Error("quota"); };
writePlayerProfile((previous) => ({ ...previous, valuables: { life: 10 } }));
assert.equal(readPlayerProfile().valuables.life, 10);
assert.match(readProfileStorageError(), /not been saved/);
browser.localStorage.setItem = originalSet;
writePlayerProfile((previous) => previous);
assert.equal(JSON.parse(storage.get(PLAYER_PROFILE_KEY)).valuables.life, 10);
assert.equal(readProfileStorageError(), null);

// The profile catalog covers every native CSV row once and groups all fifteen valuable names.
const csv = readFileSync(new URL("../../../../data/sheet-research/raw-copies/KA GameData - Valuable.csv", import.meta.url), "utf8");
const ids = csv.trim().split(/\r?\n/).slice(1).map((row) => Number(row.match(/^"(\d+)"/)[1]));
assert.deepEqual(PLAYER_VALUABLES.flatMap((item) => [...item.sourceIds]).sort((a, b) => a - b), ids.sort((a, b) => a - b));
assert.equal(PLAYER_VALUABLES.length, 15);
assert.equal(new Set(PLAYER_VALUABLES.map((item) => item.key)).size, PLAYER_VALUABLES.length);
// Account activation cannot consume another account's profile or legacy water mirrors.
const anonymousProfile = readPlayerProfile();
setPlayerProfileAccountScope("account-a");
assert.deepEqual(readPlayerProfile().valuables, {});
writePlayerProfile({ version: 1, equipment: {}, characters: [], valuables: { life: 17 } });
const accountAKey = playerProfileStorageKey();
setPlayerProfileAccountScope("account-b");
assert.deepEqual(readPlayerProfile().valuables, {});
writePlayerProfile({ version: 1, equipment: {}, characters: [], valuables: { life: 28 } });
assert.notEqual(playerProfileStorageKey(), accountAKey);
setPlayerProfileAccountScope("account-a");
assert.equal(readPlayerProfile().valuables.life, 17);
setPlayerProfileAccountScope(null);
assert.deepEqual(readPlayerProfile(), anonymousProfile);
console.log(JSON.stringify({ outcome: "PASS", valuableGroups: PLAYER_VALUABLES.length, nativeRows: ids.length, checks: "defaults, migration, schema, updates, mirrors, storage changes, catalog completeness" }));
