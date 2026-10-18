import assert from "node:assert/strict";
import {
  createDefaultBattleSetup,
  createHumanUnit,
  importBattleSetup,
  serializeBattleSetup,
} from "@/lib/battle-setup";
import {
  RAW_BATTLE_SETUP_HANDOFF_KEY,
  readBattleSetupHandoff,
  writeBattleSetupHandoff,
} from "@/lib/battle-setup-handoff";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const setup = createDefaultBattleSetup(3);
setup.playerTeam = Array.from({ length: 6 }, (_, index) => {
  const human = createHumanUnit(index + 1);
  human.name = `DPS/support ${index + 1}`;
  human.parameters["10"] = { rawValue: 3365 + index, rawMax: 3365 + index, extraValue: 0, extraMax: 40, trainingLevel: 300 };
  human.parameters["13"] = { rawValue: 344 + index, rawMax: 2147483647, extraValue: 60, extraMax: 0, trainingLevel: 300 };
  human.equipmentSlots.weapon = { id: 93, level: 17 + index, affinity: index % 3 };
  human.weaponId = 93;
  human.skills = index === 0 ? [{ skillId: 1, invocationLevel: 0 }] : [];
  human.progression = { awakening: 20, source: "SOURCE_INPUT" };
  return human;
});
setup.partyLimit.effectiveMax = 6;
setup.holyHerbStock = 9;
setup.items = { "Recovery Potion (L)": { bonusCategory: 3, bonusType: 1, bonusMinValue: 1000, bonusMaxValue: 1000 } };
setup.itemStock = { "Recovery Potion (L)": 4 };
setup.inputs = [{ tick: 80, phase: "before_fighters", type: "holy_herb" }];
setup.startProfile = { kind: "isolated-scene0", enemySpawnCell: [4, 5], bossCell: [7, 2], startingStatus: {} };
const input = serializeBattleSetup(setup);
const directImport = importBattleSetup(input);
assert.ok(directImport.setup, `test setup did not import: ${directImport.issues.map((issue) => issue.code).join(",")}`);
assert.equal(directImport.issues.some((issue) => issue.category === "ERROR"), false);

const storage = new MemoryStorage();
assert.equal(writeBattleSetupHandoff(setup, storage), true);
const read = readBattleSetupHandoff(storage);
assert.equal(read.status, "ok");
if (read.status === "ok") {
  assert.equal(read.json, serializeBattleSetup(setup));
  assert.equal(read.setup.encounter.encounterId, 3);
  assert.equal(read.setup.playerTeam.length, 6);
  assert.deepEqual(read.setup.playerTeam[0].parameters["10"], setup.playerTeam[0].parameters["10"]);
  assert.deepEqual(read.setup.playerTeam[0].skills, setup.playerTeam[0].skills);
  assert.deepEqual(read.setup.playerTeam[0].equipmentSlots.weapon, setup.playerTeam[0].equipmentSlots.weapon);
  assert.equal(read.setup.playerTeam[0].progression?.awakening, 20);
  assert.equal(read.setup.holyHerbStock, 9);
  assert.equal(read.setup.itemStock?.["Recovery Potion (L)"], 4);
  assert.deepEqual(read.setup.startProfile, setup.startProfile);
}
assert.deepEqual(readBattleSetupHandoff(storage), { status: "none" });

storage.setItem(RAW_BATTLE_SETUP_HANDOFF_KEY, "{bad json");
const invalid = readBattleSetupHandoff(storage);
assert.equal(invalid.status, "invalid");
assert.equal(storage.getItem(RAW_BATTLE_SETUP_HANDOFF_KEY), null, "invalid handoff must still be consumed once");

const blockedWrites = { ...new MemoryStorage(), setItem() { throw new Error("denied"); } };
assert.equal(writeBattleSetupHandoff(setup, blockedWrites), false);
const blockedReads = { getItem() { throw new Error("denied"); }, setItem() {}, removeItem() {} };
assert.deepEqual(readBattleSetupHandoff(blockedReads), { status: "storage-error" });

console.log(JSON.stringify({ checks: 13, status: "PASS" }));
