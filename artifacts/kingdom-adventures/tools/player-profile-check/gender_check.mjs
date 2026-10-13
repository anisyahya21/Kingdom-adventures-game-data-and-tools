import assert from "node:assert/strict";
import { sanitizePlayerProfile } from "../../src/lib/player-profile.ts";
import { samePlayerProfile } from "../../src/lib/account-player-profile/sync-core.ts";
import { canPickHumanEquipment, dropUnsupportedHumanEquipment } from "../../src/lib/battle-picker-rules.ts";
import { EQUIPMENT_CATALOG } from "../../src/lib/battle-setup.ts";

const profile = (gender) => sanitizePlayerProfile({ version: 1, characters: [{ id: "resident", jobName: "Samurai", rank: "A", gender, statLevels: {} }] });
assert.equal(profile(0).characters[0].gender, 0);
assert.equal(profile(1).characters[0].gender, 1);
assert.equal(profile(undefined).characters[0].gender, undefined);
assert.equal(profile(7).characters[0].gender, undefined);
assert.equal(samePlayerProfile(profile(0), profile(1)), false, "gender changes must sync to the account");
assert.equal(samePlayerProfile(profile(undefined), profile(undefined)), true);

const restricted = EQUIPMENT_CATALOG.filter((entry) => (entry.flags & 1024) !== 0);
assert.deepEqual(restricted.map((entry) => entry.id).sort((a,b) => a-b), [209,210,232,260]);
const data = { slotAssignments: Object.fromEntries(restricted.map((entry) => [entry.name, "Armor"])) };
for (const entry of restricted) {
  assert.equal(canPickHumanEquipment({ jobName: "Samurai", gender: 0, skills: [] }, data, entry.name), false);
  assert.equal(canPickHumanEquipment({ jobName: "Samurai", skills: [] }, data, entry.name), false);
  assert.equal(canPickHumanEquipment({ jobName: "Samurai", gender: 1, skills: [] }, data, entry.name), true);
}
const femaleBuild = { id: "test", jobName: "Samurai", gender: 1, skills: [], equipment: restricted.map((entry) => ({name:entry.name,level:99})) };
assert.equal(dropUnsupportedHumanEquipment(femaleBuild, data).equipment.length, 4);
assert.equal(dropUnsupportedHumanEquipment({...femaleBuild,gender:0}, data).equipment.length, 0);
console.log("Gender persistence, sync detection and all four female-only equipment restrictions passed.");
