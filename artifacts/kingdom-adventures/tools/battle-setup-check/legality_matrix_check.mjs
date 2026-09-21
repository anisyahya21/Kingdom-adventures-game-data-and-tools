/**
 * Table-driven legality matrix: valid/invalid pairs with and without a matching weapon-type
 * resistance skill, active vs permanently-active skill rows across the recovered categories, and
 * the setup -> serialize -> import round trip.
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-setup-check/legality_matrix_check.mjs
 *
 * Native inputs used (narrow, canonical index; no emulator, no server, no raw-RE pass):
 *   * `JobData.GetAffinity 0x16208d0` (RE-evidence/20260912-combat/16208d0.asm): job-group affinity
 *     indexed by EquipData+0x4c type; -1 and 0 are lifted to 1 by a POSSESSED type-48
 *     (TYPE_EQUIP_MASTER) skill whose `value` (SkillData+0x30) equals the equipment type
 *     (predicate 0x162cc34).
 *   * `EquipData.CanEquip 0x1620e14` (generated slice, `ka_slice.py --rvas 0x1620e14`): rejects
 *     exactly affinity -1 (`cmn w0,#1; b.eq`).
 *   * `SkillData.flags` FLAG_FOR_BATTLE 0x8 (dump.cs) separates invoked rows from always-on ones;
 *     `CanUseSkill 0x15df0e0` rejects category-2 activity rows (special-combat.md:445-447).
 *
 * Exits 1 on any failed check. Writes nothing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const SHARED_JSON = path.join(WORKSPACE, "KA-Website", "artifacts", "api-server", "data", "ka_shared.json");

const { battleSetupFromLoadouts, SKILL_ID_BY_NAME } = await import("@/lib/battle-legality");
const { battleSetupToCombatScenario } = await import("@/lib/battle-setup-adapter");
const {
  EQUIPMENT_BY_ID,
  MONSTER_INNATE_SKILL_BY_ID,
  SKILL_BY_ID,
  importBattleSetup,
  serializeBattleSetup,
  skillActivationStatus,
  validateBattleSetup,
} = await import("@/lib/battle-setup");
const { getJobProfile } = await import("@/game-data/job-profile");
const { equipmentNamesForSlot, builderSkillTrigger, PERMANENTLY_ACTIVE_LABEL, MAX_SKILL_SLOTS } =
  await import("@/lib/battle-team-draft");
const {
  EQUIP_AFFINITY_NORMAL,
  EQUIP_AFFINITY_REJECTED,
  EQUIP_AFFINITY_WEAK,
  SKILL_TYPE_EQUIP_MASTER,
  resolveEquipmentAffinity,
} = await import("@/game-data/equipment-job-admission");
const { SKILL_FLAG_FOR_BATTLE, NATIVE_DEFAULT_INVOCATION_LEVEL } = await import("@/game-data/skill-job-admission");

const shared = JSON.parse(readFileSync(SHARED_JSON, "utf8"));
const weaponTypes = shared.weaponTypes ?? {};

const checks = [];
const check = (name, actual, expected) => {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, passed, detail: passed ? "ok" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` });
};
const checkTruthy = (name, actual, detail = "expected truthy") =>
  checks.push({ name, passed: Boolean(actual), detail: actual ? "ok" : detail });
const errorCodes = (result) => result.issues.filter((issue) => issue.category === "ERROR").map((issue) => issue.code);
const noteCodes = (result) => result.issues.filter((issue) => issue.category !== "ERROR").map((issue) => issue.code);

/** Deep key-sorted form, so two structurally equal objects compare equal regardless of key order. */
function deepSort(value) {
  if (Array.isArray(value)) return value.map(deepSort);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, deepSort(entry)]),
    );
  }
  return value;
}
const stable = (value) => JSON.stringify(deepSort(value));

/* 1. the pure native affinity/matrix rule ------------------------------------------------ */

const type48Rows = [...SKILL_BY_ID.values()].filter((entry) => entry.type === SKILL_TYPE_EQUIP_MASTER);
check("the recovered EQUIP_MASTER rows are the ten declared resistance skills", type48Rows.length, 10);
check(
  "every EQUIP_MASTER row is named '<something> Resistance'",
  type48Rows.every((entry) => /Resistance$/.test(entry.nameText)),
  true,
);

const affinityTable = [];
for (const access of ["can", "weak", "cannot", null]) {
  for (const equipType of [8, 11]) {
    const matching = type48Rows.filter((entry) => entry.value === equipType).map((entry) => entry.id);
    const other = type48Rows.filter((entry) => entry.value !== equipType).map((entry) => entry.id);
    affinityTable.push({
      access,
      equipType,
      matching,
      other,
      withMatch: resolveEquipmentAffinity({ access, equipmentType: equipType, possessedSkillIds: matching }),
      withOther: resolveEquipmentAffinity({ access, equipmentType: equipType, possessedSkillIds: other }),
      withNeither: resolveEquipmentAffinity({ access, equipmentType: equipType, possessedSkillIds: [] }),
    });
  }
}
const expectedAffinity = (access) =>
  access === "cannot" ? EQUIP_AFFINITY_REJECTED : access === "weak" ? EQUIP_AFFINITY_WEAK : EQUIP_AFFINITY_NORMAL;
for (const row of affinityTable) {
  const declared = expectedAffinity(row.access);
  check(`declared affinity for ${String(row.access)} type ${row.equipType}`, row.withNeither.declaredAffinity, declared);
  check(`no resistance keeps the declared affinity for ${String(row.access)} type ${row.equipType}`, row.withNeither.affinity, declared);
  check(
    `no resistance is overridden=false for ${String(row.access)} type ${row.equipType}`,
    row.withNeither.overridden,
    false,
  );
  const shouldOverride = declared === EQUIP_AFFINITY_REJECTED || declared === EQUIP_AFFINITY_WEAK;
  check(
    `a matching type-48 skill overrides ${String(row.access)} type ${row.equipType} to 1`,
    row.withMatch.affinity,
    shouldOverride ? EQUIP_AFFINITY_NORMAL : declared,
  );
  check(
    `override flag for ${String(row.access)} type ${row.equipType}`,
    row.withMatch.overridden,
    shouldOverride,
  );
  check(
    `a non-matching type-48 skill never overrides ${String(row.access)} type ${row.equipType}`,
    [row.withOther.affinity, row.withOther.overridden],
    [declared, false],
  );
  check(
    `only affinity -1 is refused by CanEquip for ${String(row.access)} type ${row.equipType}`,
    row.withNeither.allowed,
    declared !== EQUIP_AFFINITY_REJECTED,
  );
  check(
    `an overridden rejection is allowed for ${String(row.access)} type ${row.equipType}`,
    row.withMatch.allowed,
    true,
  );
}

/* 2. active vs permanently-active rows across the recovered categories -------------------- */

const ACTIVATION_TABLE = [
  { id: 0, name: "Normal Attack", category: 0, expected: "active" },
  { id: 1, name: "Bow Attack", category: 0, expected: "active" },
  { id: 36, name: "Myriad Arrows", category: 0, expected: "active" },
  { id: 30, name: "Critical UP", category: 0, expected: "active" },
  { id: 41, name: "Revive 100%", category: 1, expected: "active" },
  { id: 38, name: "Heal M", category: 1, expected: "active" },
  { id: 113, name: "defense-down generated status", category: 0, expected: "active" },
  { id: 117, name: "sleep generated status", category: 0, expected: "active" },
  { id: 82, name: "Sword Resistance", category: 2, expected: "permanently_active" },
  { id: 89, name: "Bow Resistance", category: 2, expected: "permanently_active" },
  { id: 91, name: "Shield Resistance", category: 2, expected: "permanently_active" },
  { id: 75, name: "Auto Recovery HP", category: 2, expected: "permanently_active" },
  { id: 105, name: "Leading the Charge", category: 2, expected: "permanently_active" },
  { id: 120, name: "placeholder row", category: 0, expected: "permanently_active" },
  { id: 99999, name: "unknown id", category: null, expected: "unknown" },
];
for (const row of ACTIVATION_TABLE) {
  const entry = SKILL_BY_ID.get(row.id);
  if (row.category !== null) {
    checkTruthy(`${row.name} (${row.id}) is a recovered catalog row`, Boolean(entry), `no catalog row for ${row.id}`);
    if (entry) check(`${row.name} (${row.id}) category`, entry.category, row.category);
  }
  check(`${row.name} (${row.id}) activation status`, skillActivationStatus(row.id), row.expected);
}
check(
  "every recovered row is active exactly when SkillData.flags carries FLAG_FOR_BATTLE 0x8",
  [...SKILL_BY_ID.values()].every(
    (entry) => (skillActivationStatus(entry.id) === "active") === ((entry.flags & SKILL_FLAG_FOR_BATTLE) !== 0),
  ),
  true,
);
check(
  "every permanently-active row is either a category-2 row or an unused placeholder row (flags 0)",
  [...SKILL_BY_ID.values()]
    .filter((entry) => skillActivationStatus(entry.id) === "permanently_active")
    .every((entry) => entry.category === 2 || entry.flags === 0),
  true,
);
check(
  "every category-2 activity/passive row is permanently active",
  [...SKILL_BY_ID.values()]
    .filter((entry) => entry.category === 2)
    .every((entry) => skillActivationStatus(entry.id) === "permanently_active"),
  true,
);
check(
  "every category-0/1 row with a recovered flag value is an active battle skill",
  [...SKILL_BY_ID.values()]
    .filter((entry) => entry.category !== 2 && entry.flags !== 0)
    .every((entry) => skillActivationStatus(entry.id) === "active"),
  true,
);

/* 3. the builder trigger presentation ---------------------------------------------------- */

check("active row shows a High/Normal/Low trigger", builderSkillTrigger("Normal Attack", 0), {
  status: "active",
  label: "High",
  level: 0,
});
check("active row defaults its trigger label", builderSkillTrigger("Normal Attack", undefined).label, "Normal");
check("passive row shows the always-active label and no trigger level", builderSkillTrigger("Bow Resistance", 1), {
  status: "permanently_active",
  label: PERMANENTLY_ACTIVE_LABEL,
  level: null,
});
check("the always-active label is the user-facing wording", PERMANENTLY_ACTIVE_LABEL, "Always active");
check("unknown name is not labelled active", builderSkillTrigger("Not A Skill", 0).status, "unknown");

/* 4. real equipment pairs, with and without resistance ------------------------------------ */

function realWeaponFor(jobName, weaponClass) {
  const profile = getJobProfile(shared, jobName);
  const access = profile?.equipmentAccess.weapons?.[weaponClass] ?? null;
  return { access, name: equipmentNamesForSlot(shared, "weapon").find((name) => weaponTypes[name] === weaponClass) ?? null };
}
function realShieldFor(jobName) {
  const profile = getJobProfile(shared, jobName);
  return { access: profile?.equipmentAccess.shield ?? null, name: equipmentNamesForSlot(shared, "shield")[0] ?? null };
}

const EQUIPMENT_MATRIX = [
  { job: "Researcher", slot: "weapon", weaponClass: "Spear", access: "cannot" },
  { job: "Researcher", slot: "weapon", weaponClass: "Bow", access: "cannot" },
  { job: "Researcher", slot: "weapon", weaponClass: "Sword", access: "weak" },
  { job: "Santa Claus", slot: "weapon", weaponClass: "Sword", access: "cannot" },
  { job: "Berserker", slot: "weapon", weaponClass: "Staff", access: "weak" },
  { job: "Researcher", slot: "weapon", weaponClass: "Staff", access: "weak" },
  { job: "Royal", slot: "weapon", weaponClass: "Spear", access: "can" },
  { job: "Royal", slot: "weapon", weaponClass: "Axe", access: "can" },
  { job: "Royal", slot: "weapon", weaponClass: "Bow", access: "can" },
  { job: "Researcher", slot: "shield", weaponClass: "Shield", access: "weak" },
  { job: "Santa Claus", slot: "shield", weaponClass: "Shield", access: "can" },
];

const equipmentRows = [];
for (const row of EQUIPMENT_MATRIX) {
  const probe = row.slot === "shield" ? realShieldFor(row.job) : realWeaponFor(row.job, row.weaponClass);
  equipmentRows.push({ ...row, weaponName: probe.name, declaredAccess: probe.access });
  checkTruthy(
    `${row.job} ${row.weaponClass} has a real ${row.slot} item in the shared data`,
    Boolean(probe.name),
    "no shared equipment name for this class",
  );
  check(`${row.job} declares '${row.weaponClass}' as ${row.access}`, probe.access, row.access);
}

const loadoutFor = (job, weaponName, skills) => ({
  id: "matrix",
  name: job,
  jobName: job,
  rank: "S",
  equipment: weaponName ? [{ name: weaponName, level: 3 }] : [],
  skills,
  skillInvocations: skills.map(() => 1),
});
const convert = (row, skills) => battleSetupFromLoadouts([loadoutFor(row.job, row.weaponName, skills)], shared, { encounterId: 19 });
const slotOf = (setup, row) => setup?.playerTeam?.[0]?.equipmentSlots?.[row.slot] ?? null;

const resistanceName = (weaponClass) => `${weaponClass} Resistance`;
const validPairs = [];
const invalidPairs = [];

for (const row of equipmentRows) {
  const resistance = resistanceName(row.weaponClass);
  checkTruthy(`'${resistance}' resolves to a recovered skill id`, SKILL_ID_BY_NAME.has(resistance), resistance);
  const withoutResistance = convert(row, []);
  const withResistance = convert(row, [resistance]);
  const mismatched = convert(row, [row.weaponClass === "Sword" ? "Axe Resistance" : "Sword Resistance"]);
  const label = `${row.job}/${row.weaponClass}(${row.slot})`;

  if (row.access === "cannot") {
    invalidPairs.push({ label: `${label} without resistance`, expected: "JOB_EQUIPMENT_NOT_ALLOWED", result: withoutResistance });
    validPairs.push({ label: `${label} with ${resistance}`, result: withResistance });
    checkTruthy(
      `${label} without resistance is refused with JOB_EQUIPMENT_NOT_ALLOWED`,
      errorCodes(withoutResistance).includes("JOB_EQUIPMENT_NOT_ALLOWED"),
      JSON.stringify(errorCodes(withoutResistance)),
    );
    check(`${label} without resistance has no weapon slot`, slotOf(withoutResistance.setup, row), null);
    check(`${label} with ${resistance} has no ERROR`, errorCodes(withResistance), []);
    check(`${label} with ${resistance} allows the item at affinity 1`, slotOf(withResistance.setup, row)?.affinity, 1);
    checkTruthy(
      `${label} with ${resistance} reports the native override`,
      noteCodes(withResistance).includes("RESISTANCE_SKILL_EQUIP_OVERRIDDEN"),
      JSON.stringify(noteCodes(withResistance)),
    );
    check(`${label} with a non-matching resistance stays refused`, errorCodes(mismatched).includes("JOB_EQUIPMENT_NOT_ALLOWED"), true);
  } else if (row.access === "weak") {
    validPairs.push({ label: `${label} without resistance`, result: withoutResistance });
    validPairs.push({ label: `${label} with ${resistance}`, result: withResistance });
    check(`${label} without resistance has no ERROR`, errorCodes(withoutResistance), []);
    check(`${label} without resistance halves at affinity 0`, slotOf(withoutResistance.setup, row)?.affinity, 0);
    checkTruthy(
      `${label} without resistance reports the halving rule`,
      noteCodes(withoutResistance).includes("AFFINITY_HALVING_FROM_WEAKNESS"),
      JSON.stringify(noteCodes(withoutResistance)),
    );
    check(`${label} with ${resistance} has no ERROR`, errorCodes(withResistance), []);
    check(`${label} with ${resistance} lifts the halving to affinity 1`, slotOf(withResistance.setup, row)?.affinity, 1);
    check(`${label} with a non-matching resistance still halves`, slotOf(mismatched.setup, row)?.affinity, 0);
  } else {
    validPairs.push({ label: `${label} (declared can)`, result: withoutResistance });
    check(`${label} has no ERROR`, errorCodes(withoutResistance), []);
    check(`${label} stays at affinity 1`, slotOf(withoutResistance.setup, row)?.affinity, 1);
  }
}

/* 5. the saved-loadout <-> setup round trip ------------------------------------------------ */

for (const pair of validPairs) {
  const setup = pair.result.setup;
  if (!setup) {
    check(`${pair.label} round-trips`, null, "a non-null setup");
    continue;
  }
  const serialized = serializeBattleSetup(setup);
  const reimported = importBattleSetup(serialized);
  check(`${pair.label} re-imports without ERROR`, errorCodes({ issues: reimported.issues }), []);
  check(`${pair.label} keeps the equipment slots`, stable(reimported.setup?.playerTeam?.[0]?.equipmentSlots), stable(setup.playerTeam[0].equipmentSlots));
  check(`${pair.label} keeps the skills`, stable(reimported.setup?.playerTeam?.[0]?.skills), stable(setup.playerTeam[0].skills));
  check(`${pair.label} serializes idempotently`, serializeBattleSetup(reimported.setup), serialized);
}
for (const pair of invalidPairs) {
  check(`${pair.label} produces no setup`, pair.result.setup, null);
  checkTruthy(`${pair.label} reports ${pair.expected}`, errorCodes(pair.result).includes(pair.expected), JSON.stringify(errorCodes(pair.result)));
}

/* 6. a JSON skill entry without an invocation level is not an activation requirement -------- */

const importProbe = JSON.parse(JSON.stringify(validPairs[0].result.setup));
importProbe.playerTeam[0].skills = [{ skillId: 30 }, { skillId: 89 }];
const importResult = importBattleSetup(JSON.stringify(importProbe));
check("a skill entry without invocationLevel imports without ERROR", errorCodes({ issues: importResult.issues }), []);
check(
  "an absent invocation level becomes the native default 1 for both an invoked and a permanently-active row",
  importResult.setup?.playerTeam?.[0]?.skills?.map((entry) => entry.invocationLevel),
  [NATIVE_DEFAULT_INVOCATION_LEVEL, NATIVE_DEFAULT_INVOCATION_LEVEL],
);

/* 7. a permanently-active skill validates, stays aligned and reaches the adapter ------------ */

const passiveSetup = convert(equipmentRows.find((row) => row.access === "cannot"), [resistanceName("Spear")]).setup;
check("a setup carrying a permanently-active skill has no ERROR", errorCodes({ issues: validateBattleSetup(structuredClone(passiveSetup)) }), []);
checkTruthy(
  "the permanently-active skill is reported, not enforced",
  validateBattleSetup(structuredClone(passiveSetup)).some((issue) => issue.code === "SKILL_PERMANENTLY_ACTIVE_NO_ACTIVATION"),
);
const passiveUnit = passiveSetup.playerTeam[0];
check("the permanently-active skill keeps the native default level 1", passiveUnit.skills[0].invocationLevel, NATIVE_DEFAULT_INVOCATION_LEVEL);
const { scenario } = battleSetupToCombatScenario(structuredClone(passiveSetup));
check(
  "the adapter keeps the invocation array aligned with the skill array",
  [scenario.ownUnits[0].skills.length, scenario.ownUnits[0].invocationLevels.length],
  [passiveUnit.skills.length, passiveUnit.skills.length],
);

/* 8. CanUseSkill's weapon requirement is a non-blocking execution note ---------------------- */

const nonBowRow = equipmentRows.find((row) => row.access === "can" && row.weaponClass === "Spear");
const myriads = convert(nonBowRow, ["Myriad Arrows"]);
const bowRow = equipmentRows.find((row) => row.access === "can" && row.weaponClass === "Bow");
const myriadsWithBow = convert(bowRow, ["Myriad Arrows"]);
check(`${bowRow.job} Myriad Arrows (requiredEquipType 8) validates without ERROR`, errorCodes({ issues: validateBattleSetup(structuredClone(myriads.setup)) }), []);
checkTruthy(
  "Myriad Arrows with a non-bow weapon reports the non-blocking CanUseSkill note",
  validateBattleSetup(structuredClone(myriads.setup)).some(
    (issue) => issue.code === "SKILL_REQUIRED_EQUIP_TYPE_MISMATCH" && issue.category === "UNKNOWN_NATIVE_RULE",
  ),
  JSON.stringify(validateBattleSetup(structuredClone(myriads.setup)).map((issue) => issue.code)),
);
check(
  "Myriad Arrows with a bow reports no mismatch note",
  validateBattleSetup(structuredClone(myriadsWithBow.setup)).filter((issue) => issue.code === "SKILL_REQUIRED_EQUIP_TYPE_MISMATCH"),
  [],
);
const passiveValidated = validateBattleSetup(structuredClone(passiveSetup));
check(
  "a permanently-active skill never raises a CanUseSkill weapon note",
  passiveValidated.filter((issue) => issue.code === "SKILL_REQUIRED_EQUIP_TYPE_MISMATCH"),
  [],
);

/* 9. pet innate stays first and counts toward the nine-slot ceiling ------------------------ */

const SPECIES = 105;
const INNATE = MONSTER_INNATE_SKILL_BY_ID.get(SPECIES);
checkTruthy("species 105 has a canonical innate skill", INNATE !== null && INNATE !== undefined, String(INNATE));
const petLoadout = (extras) => ({
  id: "pet-cap",
  name: "Pet Cap",
  jobName: "Rancher",
  rank: "D",
  equipment: [],
  skills: [],
  householdPets: [{ monsterId: SPECIES, name: "Rex", level: 5, skills: extras, skillInvocations: extras.map(() => 1) }],
});
const eightExtras = battleSetupFromLoadouts([petLoadout(Array(MAX_SKILL_SLOTS - 1).fill("7-Hit Attack"))], shared, { encounterId: 19 });
const nineExtras = battleSetupFromLoadouts([petLoadout(Array(MAX_SKILL_SLOTS).fill("7-Hit Attack"))], shared, { encounterId: 19 });
const thinPet = eightExtras.setup?.households?.["Pet Cap"]?.[0];
check("eight declared extras plus the innate stay inside the nine-slot ceiling", errorCodes(eightExtras), []);
check("the innate is exported first", thinPet?.skills?.[0]?.skillId, INNATE);
check("the pet carries nine stored skills including the innate", thinPet?.skills?.length, MAX_SKILL_SLOTS);
check("nine declared extras plus the innate exceed the ceiling", errorCodes(nineExtras).includes("SKILL_SLOT_CAP_EXCEEDED"), true);

/* summary ---------------------------------------------------------------------------------- */

const failed = checks.filter((entry) => !entry.passed);
for (const entry of failed) console.log(`FAIL ${entry.name}: ${entry.detail}`);
console.log(
  `${checks.length - failed.length}/${checks.length} legality-matrix checks passed ` +
    `(equipment pairs: ${validPairs.length} valid / ${invalidPairs.length} invalid, affinity rows: ${affinityTable.length}, activation rows: ${ACTIVATION_TABLE.length})`,
);
process.exit(failed.length === 0 ? 0 : 1);
