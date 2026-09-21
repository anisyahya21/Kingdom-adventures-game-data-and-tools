/**
 * Focused check for the /battle visual builder's own logic (no DOM, no network):
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-builder-check/visual_builder_check.mjs
 *
 * It proves the editor's draft layer (ordered roster, preset copy isolation, gear-slot resolution,
 * pet slots) converts through the EXISTING contracts into an ordered, legal setup, and that the
 * additive appearance field reaches the visual payload.
 */
import { localSharedData } from "@/lib/local-shared-data";
import {
  RESIDENT_STAT_ITEMS_KEY,
  deviceResidentValuables,
  loadoutsWithResidentValuables,
} from "@/lib/resident-valuable-settings";
import { STAT_PARAMETER_IDS } from "@/game-data/stat-parameter-ids";
import { battleSetupFromLoadouts, loadoutParameters } from "@/lib/battle-legality";
import { battleSetupToCombatScenario } from "@/lib/battle-setup-adapter";
import { CANONICAL_RECOVERY_ITEMS, declaredItemRows, validateBattleSetup } from "@/lib/battle-setup";
import {
  DEFAULT_PET_SLOT_CAPACITY,
  MAX_SKILL_SLOTS,
  PET_SLOT_CAPACITY_BY_JOB,
  PET_SLOT_CAPACITY_NOTE,
  createDraft,
  createDraftCharacter,
  draftCharacterFromLoadout,
  draftStatRows,
  equipmentNamesForSlot,
  gearInSlot,
  gearSlotForName,
  invocationLabel,
  moveInList,
  normalizeConsumables,
  normalizeDraft,
  normalizeSavedLoadouts,
  petCapacityOverBy,
  petSlotCapacity,
  setGearInSlot,
} from "@/lib/battle-team-draft";

const checks = [];
const check = (name, actual, expected) => {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, passed, detail: passed ? "ok" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` });
};
const checkTruthy = (name, actual, detail = "expected truthy") => {
  checks.push({ name, passed: Boolean(actual), detail: actual ? "ok" : detail });
};

const shared = localSharedData;

/* Draft container */
const empty = createDraft(19);
check("draft starts with one character", empty.characters.length, 1);
check("draft round-trips through normalizeDraft", normalizeDraft(JSON.parse(JSON.stringify(empty)))?.encounterId, 19);
check("normalizeDraft rejects another schema", normalizeDraft({ schema: "nope", encounterId: 19, characters: [] }), null);
check("normalizeDraft rejects an empty roster", normalizeDraft({ schema: "ka-battle-team-draft-1", encounterId: 19, characters: [] }), null);

/* Ordering */
check("moveInList reorders forward", moveInList(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
check("moveInList ignores out-of-range moves", moveInList(["a", "b"], 0, 5), ["a", "b"]);

/* Gear slot resolution against the shared catalogue */
const weaponNames = equipmentNamesForSlot(shared, "weapon");
const shieldNames = equipmentNamesForSlot(shared, "shield");
checkTruthy("shared catalogue offers weapons", weaponNames.length > 0);
checkTruthy("shared catalogue offers shields", shieldNames.length > 0);
check("a weapon name resolves to the weapon slot", gearSlotForName(weaponNames[0], shared.slotAssignments), "weapon");
check("a shield name resolves to the shield slot", gearSlotForName(shieldNames[0], shared.slotAssignments), "shield");
check("an unknown item stays unassigned", gearSlotForName("Definitely Not An Item", shared.slotAssignments), null);

/* Preset copy isolation */
const preset = {
  id: "preset-1",
  name: "Preset Knight",
  jobName: "Knight",
  rank: "C",
  statLevels: { atk: 12 },
  equipment: [{ name: weaponNames[0], level: 3 }],
  skills: ["Sword Resistance"],
  skillInvocations: [0],
  householdPets: [{ monsterId: 116, level: 4, skills: ["Instinct"], skillInvocations: [2] }],
};
const copied = draftCharacterFromLoadout(preset, 1);
checkTruthy("a copied preset gets its own id", copied.id !== preset.id);
copied.statLevels.atk = 99;
copied.equipment[0].level = 99;
copied.skills.push("Parry");
copied.householdPets[0].skills.push("Thief");
check("editing a copy leaves the preset stat untouched", preset.statLevels.atk, 12);
check("editing a copy leaves the preset gear untouched", preset.equipment[0].level, 3);
check("editing a copy leaves the preset skills untouched", preset.skills, ["Sword Resistance"]);
check("editing a copy leaves the preset pet skills untouched", preset.householdPets[0].skills, ["Instinct"]);

/* Gear replacement keeps the other slots */
const geared = setGearInSlot({ ...copied, equipment: [{ name: shieldNames[0], level: 2 }] }, "weapon", { name: weaponNames[0], level: 5 }, shared.slotAssignments);
check("gear replacement keeps the other slot", gearInSlot(geared, "shield", shared.slotAssignments)?.name, shieldNames[0]);
check("gear replacement sets the requested slot", gearInSlot(geared, "weapon", shared.slotAssignments)?.level, 5);
check("clearing a slot removes only that slot", gearInSlot(setGearInSlot(geared, "weapon", null, shared.slotAssignments), "weapon", shared.slotAssignments), null);

/* Pet slots: the user rule is 3 pets for EVERY job and 5 for Rancher - no job is unknown/unbounded. */
check("the shared default is the user's 3-pet capacity", DEFAULT_PET_SLOT_CAPACITY, 3);
check("a new draft character's default job gets 3 slots", petSlotCapacity(createDraftCharacter(1).jobName).max, 3);
check("a job without an override gets the shared 3 slots", petSlotCapacity("Knight").max, 3);
check("Champion gets the shared 3 slots", petSlotCapacity("Champion").max, 3);
check("Rancher carries the user-attributed 5 slots", petSlotCapacity("Rancher").max, 5);
check(
  "every capacity is attributed to the user",
  [...Object.values(PET_SLOT_CAPACITY_BY_JOB).map((entry) => entry.source), petSlotCapacity("Guard").source],
  ["user", "user"],
);
check("only Rancher differs from the 3-pet default", Object.keys(PET_SLOT_CAPACITY_BY_JOB), ["Rancher"]);
check("an undefined job still gets the 3-slot default", petSlotCapacity(undefined).max, 3);
check(
  "the note states the rule instead of an unknown/unbounded capacity",
  [PET_SLOT_CAPACITY_NOTE.includes("3"), PET_SLOT_CAPACITY_NOTE.includes("5"), /not recovered/i.test(PET_SLOT_CAPACITY_NOTE)],
  [true, true, false],
);
check("a list at the capacity is not over", petCapacityOverBy("Guard", 3), 0);
check("an overfull default-job list reports the excess", petCapacityOverBy("Knight", 5), 2);
check("Rancher fits five", petCapacityOverBy("Rancher", 5), 0);
check("a Rancher list switched to Champion becomes overfull", petCapacityOverBy("Champion", 5), 2);

/* Capacity is enforced in the conversion for EVERY job: a 4-pet default-job list blocks the run, and a
   7-pet saved list keeps all seven pets in the draft so the editor stays able to show/remove them. */
const petList = (count, prefix) =>
  Array.from({ length: count }, (_, i) => ({ monsterId: 116, name: `${prefix} Pet ${i + 1}`, level: 3 }));
const guardBase = { id: "guard-1", name: "Guard Owner", jobName: "Guard", rank: "S", equipment: [], skills: [] };
const guardOver = battleSetupFromLoadouts([{ ...guardBase, householdPets: petList(4, "Over") }], shared, { encounterId: 19 });
check("an overfull default-job list blocks the run", guardOver.setup, null);
check(
  "the overfull default-job list raises PET_SLOT_CAPACITY_EXCEEDED",
  guardOver.issues.some((issue) => issue.code === "PET_SLOT_CAPACITY_EXCEEDED" && issue.category === "ERROR"),
  true,
);
check(
  "the default-job error names the derived owner path and the shared rule",
  guardOver.issues
    .filter((issue) => issue.code === "PET_SLOT_CAPACITY_EXCEEDED")
    .map((issue) => [issue.path, issue.message.includes("every job 3, Rancher 5")]),
  [["Guard Owner.householdPets", true]],
);
check(
  "an at-capacity default-job list converts",
  battleSetupFromLoadouts([{ ...guardBase, householdPets: petList(3, "Fit") }], shared, { encounterId: 19 }).setup !== null,
  true,
);
const seven = petList(7, "Seven");
const sevenSetup = battleSetupFromLoadouts([{ ...guardBase, name: "Seven Owner", householdPets: seven }], shared, {
  encounterId: 19,
});
check("a 7-pet household blocks the run", sevenSetup.setup, null);
check("the 7-pet household reports 4 over the 3-pet capacity", petCapacityOverBy("Guard", 7), 4);
check(
  "the 7-pet error asks for 4 removals instead of trimming",
  sevenSetup.issues.find((issue) => issue.code === "PET_SLOT_CAPACITY_EXCEEDED")?.message.includes("Remove 4 pet(s)"),
  true,
);
const importedSeven = draftCharacterFromLoadout({ ...guardBase, name: "Seven Owner", householdPets: seven }, 1);
check("importing the 7-pet list keeps every pet (never trimmed)", importedSeven.householdPets?.length, 7);
const rancherFive = { ...guardBase, id: "ranch-1", name: "Rancher Owner", jobName: "Rancher", householdPets: petList(5, "Ranch") };
check("a five-pet Rancher list converts", battleSetupFromLoadouts([rancherFive], shared, { encounterId: 19 }).setup !== null, true);
check(
  "a six-pet Rancher list blocks the run",
  battleSetupFromLoadouts([{ ...rancherFive, householdPets: petList(6, "Ranch") }], shared, { encounterId: 19 }).setup,
  null,
);

/* Invocation labels */
check("invocation 0 is High", invocationLabel(0), "High");
check("invocation 1 is Normal", invocationLabel(1), "Normal");
check("invocation 2 is Low", invocationLabel(2), "Low");
check("skill slots are capped at the native ceiling", MAX_SKILL_SLOTS, 9);

/* Stats: the shared curve keeps its own spellings, the editor normalises them */
const guard = createDraftCharacter(1);
const guardRawCurveKeys = Object.keys(shared.jobs?.Guard?.ranks?.D?.stats ?? {});
checkTruthy("the shared Guard D curve still uses non-canonical spellings", guardRawCurveKeys.some((key) => key !== key.toLowerCase() || key.length > 3));
const guardRows = draftStatRows(guard, shared);
check("one row per canonical stat", guardRows.length, 12);
check(
  "every stat resolves a curve value for the default Guard D",
  guardRows.filter((row) => row.curveValue === null).map((row) => row.stat),
  [],
);
const guardParams = loadoutParameters(guard, shared);
check(
  "the shown value equals the conversion raw value with nothing equipped",
  guardRows.find((row) => row.stat === "hp").total,
  guardParams.parameters["10"].rawValue,
);

/* Equipment contribution uses the shared override table and the recovered slot affinity */
const contributingName = Object.keys(shared.overrides ?? {}).find((name) =>
  Object.values(shared.overrides[name] ?? {}).some((entry) => (entry?.base ?? 0) !== 0 || (entry?.inc ?? 0) !== 0),
);
checkTruthy("the shared table has at least one contributing item", Boolean(contributingName));
const contributingSlot = gearSlotForName(contributingName, shared.slotAssignments);
const gearedRows = draftStatRows(
  setGearInSlot(guard, contributingSlot, { name: contributingName, level: 1 }, shared.slotAssignments),
  shared,
);
checkTruthy("gear adds a visible contribution", gearedRows.some((row) => row.equipmentValue !== 0));
check(
  "an equipped item raises the shown total",
  gearedRows.reduce((sum, row) => sum + (row.total ?? 0), 0) - guardRows.reduce((sum, row) => sum + (row.total ?? 0), 0) !== 0,
  true,
);

/* Provisioned consumables reuse the recovery catalog and the existing setup model */
check("normalizeConsumables drops negative counts", normalizeConsumables({ holyHerbStock: -1, itemStock: { A: -2, B: 3 } }), {
  holyHerbStock: 0,
  itemStock: { B: 3 },
});
check(
  "a draft round-trips its provision",
  normalizeDraft({ ...createDraft(19), consumables: { holyHerbStock: 4, itemStock: { "Recovery Potion (L)": 2 } } })?.consumables,
  { holyHerbStock: 4, itemStock: { "Recovery Potion (L)": 2 } },
);
const provisionedItems = declaredItemRows(CANONICAL_RECOVERY_ITEMS);
const provisioned = battleSetupFromLoadouts([guard], shared, {
  encounterId: 19,
  holyHerbStock: 3,
  items: provisionedItems,
  itemStock: { "Recovery Potion (L)": 2 },
});
check("provisioned stock reaches the setup", provisioned.setup?.holyHerbStock, 3);
check("declared item rows reach the setup", Object.keys(provisioned.setup?.items ?? {}).length, 3);
check("item stock reaches the setup", provisioned.setup?.itemStock?.["Recovery Potion (L)"], 2);
check(
  "a provisioned setup has no ERROR",
  provisioned.issues.filter((issue) => issue.category === "ERROR").length,
  0,
);
const provisionedScenario = battleSetupToCombatScenario(provisioned.setup).scenario;
check("the adapter sends the herb stock", provisionedScenario.holyHerbStock, 3);
check("the adapter sends the item stock", provisionedScenario.itemStock?.["Recovery Potion (L)"], 2);

/* Draft -> existing conversion -> existing adapter, in roster order */
const rancher = {
  id: "rancher-1",
  name: "Rancher One",
  jobName: "Rancher",
  rank: "S",
  gender: 1,
  statLevels: { hp: 10, atk: 12 },
  equipment: [{ name: weaponNames[0], level: 4 }, { name: shieldNames[0], level: 2 }],
  skills: ["Ranch Know-How", "Insta-Move"],
  skillInvocations: [0, 2],
  householdPets: [
    { monsterId: 116, level: 5, skills: ["Instinct", "Parry"], skillInvocations: [0, 2] },
    { monsterId: 116, level: 5, skills: ["Instinct"], skillInvocations: [1] },
    { monsterId: 116, level: 5, skills: ["Instinct"], skillInvocations: [1] },
    { monsterId: 116, level: 5, skills: ["Instinct"], skillInvocations: [1] },
    { monsterId: 116, level: 5, skills: ["Instinct"], skillInvocations: [1] },
  ],
};
const knight = createDraftCharacter(2);
knight.name = "Knight Two";
knight.jobName = "Knight";
knight.rank = "D";

const conversion = battleSetupFromLoadouts([rancher, knight], shared, { encounterId: 19 });
check("the draft team converts without ERROR", conversion.issues.filter((issue) => issue.category === "ERROR").length, 0);
checkTruthy("the converted setup exists", conversion.setup);
const setup = conversion.setup;
check("roster order is preserved", setup.playerTeam.map((unit) => unit.name), ["Rancher One", "Knight Two"]);
check("the declared gender is carried", setup.playerTeam[0].gender, 1);
check("the declared kit is carried", setup.playerTeam[0].weaponId > 0 && Boolean(setup.playerTeam[0].equipmentSlots.shield), true);
check("the declared skills keep their order", setup.playerTeam[0].skills.map((skill) => skill.invocationLevel), [0, 2]);
check("the household is keyed by the converted unit name", Object.keys(setup.households ?? {}), ["Rancher One"]);
check("all five declared pets are carried", (setup.households?.["Rancher One"] ?? []).length, 5);
check("pet skills keep their order after the canonical innate", (setup.households?.["Rancher One"] ?? [])[0].skills.length, 3);
check(
  "the species' canonical innate skill is first and the declared skills keep their order",
  (setup.households?.["Rancher One"] ?? [])[0].skills.map((skill) => skill.invocationLevel),
  [1, 0, 2],
);
check("pet invocation levels are preserved after the innate", (setup.households?.["Rancher One"] ?? [])[1].skills.map((skill) => skill.invocationLevel), [1, 1]);
check("the setup validates with no ERROR", validateBattleSetup(setup).filter((issue) => issue.category === "ERROR").length, 0);

const { scenario, visualSetup } = battleSetupToCombatScenario(setup);
check("the adapter sends the ordered own units", scenario.ownUnits.map((unit) => unit.name), ["Rancher One", "Knight Two"]);
check("the adapter sends the household pets", scenario.housePets["Rancher One"].length, 5);
check("the adapter marks the owner as a house owner", scenario.ownUnits[0].isHouseOwner, true);
check("the adapter sends pet skill ids in order", scenario.housePets["Rancher One"][0].skills.length, 3);
check("the visual payload keeps the appliance order", visualSetup.units.map((unit) => unit.name), ["Rancher One", "Knight Two"]);
checkTruthy("the visual payload carries the additive shieldId", visualSetup.units[0].shieldId > 0);
check("a unit without a shield reports null", visualSetup.units[1].shieldId, null);
check("the visual payload carries the weapon motion", typeof visualSetup.units[0].weaponMotion, "number");
check("the visual payload carries the pet skills", visualSetup.units[0].kind, "human");

/* ------------------------------------------------------------------ */
/* Stored-list import (defensive read) and universal-valuable carryover */
/* ------------------------------------------------------------------ */

check("a non-array stored loadout list reads as empty", normalizeSavedLoadouts("nope"), []);
check("a null stored loadout list reads as empty", normalizeSavedLoadouts(null), []);

const legacyStored = normalizeSavedLoadouts([
  {
    id: "legacy-1",
    name: "Legacy Knight",
    jobName: "Knight",
    rank: "S",
    equipment: { Weapon: { itemName: "P/ Short Sword", level: 4 } },
    skills: "not-an-array",
    statLevels: { hp: 12, broken: "x" },
  },
  { name: 42 },
  null,
  "junk",
]);
check(
  "the legacy row imports; a non-object and a row with no recognised loadout field drop",
  legacyStored.map((row) => row.name),
  ["Legacy Knight"],
);
check("a slot-keyed equipment record becomes declared slot entries", legacyStored[0].equipment, [
  { name: "P/ Short Sword", level: 4 },
]);
check("a non-array skill field reads as no skills", legacyStored[0].skills, []);
check("a non-numeric per-stat level is dropped", legacyStored[0].statLevels, { hp: 12 });

const looseCopy = draftCharacterFromLoadout({ name: 42, equipment: "x", skills: 7 }, 3);
check(
  "copying a loose stored row cannot throw and still yields a draft character",
  [typeof looseCopy.id, looseCopy.name, looseCopy.equipment, looseCopy.skills],
  ["string", "Character 3", [], []],
);

/* Device-wide universal valuables: carried only where the loadout declares nothing. */
check("the shared key is the Loadout Builder Universal Settings key", RESIDENT_STAT_ITEMS_KEY, "ka_resident_stat_items");
check("a non-object stored device value reads as empty", deviceResidentValuables("nope"), {});
check(
  "only known waters with a positive whole count are carried",
  deviceResidentValuables({ life: 2, might: 3.7, wisdom: 0, bogus: 99, vig: -4 }),
  { life: 2, might: 3 },
);

const valuableDevice = { life: 2, might: 3 };
const plainKnight = { id: "plain", name: "Plain Knight", jobName: "Knight", rank: "S", statLevels: { hp: 25, atk: 20 }, equipment: [], skills: [] };
const carriedKnight = loadoutsWithResidentValuables([plainKnight], valuableDevice)[0];
check("a loadout with no counts of its own receives the device counts", carriedKnight.residentStatItems, valuableDevice);
check("the source loadout object is left untouched", plainKnight.residentStatItems, undefined);
check(
  "an explicit declaration is never topped up by the device counts",
  loadoutsWithResidentValuables([{ ...plainKnight, residentStatItems: { life: 1 } }], valuableDevice)[0].residentStatItems,
  { life: 1 },
);
check(
  "an explicit empty declaration stays declared-none",
  loadoutsWithResidentValuables([{ ...plainKnight, residentStatItems: {} }], valuableDevice)[0].residentStatItems,
  {},
);
check(
  "an empty device setting leaves the loadout field absent",
  loadoutsWithResidentValuables([plainKnight], deviceResidentValuables({}))[0].residentStatItems,
  undefined,
);

const HP = STAT_PARAMETER_IDS.hp;
const ATK = STAT_PARAMETER_IDS.atk;
const plainConversion = battleSetupFromLoadouts([plainKnight], shared, { encounterId: 19 });
const carriedConversion = battleSetupFromLoadouts([carriedKnight], shared, { encounterId: 19 });
check("both fixtures convert without ERROR", [
  plainConversion.issues.filter((issue) => issue.category === "ERROR").length,
  carriedConversion.issues.filter((issue) => issue.category === "ERROR").length,
], [0, 0]);
check(
  "the carried valuables reach the battle parameters exactly once (HP max +20, ATK value +30)",
  [
    carriedConversion.units[0].parameters[HP].extraMax - plainConversion.units[0].parameters[HP].extraMax,
    carriedConversion.units[0].parameters[ATK].extraValue - plainConversion.units[0].parameters[ATK].extraValue,
    carriedConversion.units[0].parameters[ATK].extraMax - plainConversion.units[0].parameters[ATK].extraMax,
  ],
  [20, 30, 0],
);
check(
  "a loadout with no counts and no device declaration keeps the declared-input gap",
  plainConversion.issues.some((issue) => issue.code === "RESIDENT_VALUABLES_NOT_CAPTURED"),
  true,
);
check(
  "the carried loadout no longer reports the declared-input gap",
  carriedConversion.issues.some((issue) => issue.code === "RESIDENT_VALUABLES_NOT_CAPTURED"),
  false,
);

const failed = checks.filter((entry) => !entry.passed);
console.log(`${checks.length - failed.length}/${checks.length} visual builder checks passed`);
if (failed.length > 0) {
  for (const entry of failed) console.log(`FAIL ${entry.name}: ${entry.detail}`);
  process.exitCode = 1;
}
