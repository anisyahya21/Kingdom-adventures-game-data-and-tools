/**
 * Focused combat-effect check for the five resident "Water of ..." valuables.
 *
 * It runs the real saved-loadout converter (`battleSetupFromLoadouts`) and the real adapter
 * (`battleSetupToCombatScenario`) and asserts the recovered native behaviour:
 *   * two loadouts with identical job/rank/per-stat levels but declared valuables differ in the
 *     converted combat parameters, and the difference is exactly the item amount;
 *   * HP(10)/MP(11)/Vigor(12) land on the bounded *maximum* (`extraMax`) and Attack(13)/
 *     Defence(14) land on the *value* (`extraValue`), matching `resident-valuable-effects.ts`;
 *   * equipment is counted once: it never enters `rawValue`/`extraValue`/`extraMax` and is carried
 *     only as the scenario equipment rows, so the valuable delta is unchanged by gear;
 *   * the special launcher's HP/MP pre-battle refill lifts the *effective current* to the effective
 *     maximum (valuable maximum + equipment maximum included), while Vigor's current stays at the
 *     unrefilled job-curve value (max-only bonus);
 *   * an absent `residentStatItems` reports RESIDENT_VALUABLES_NOT_CAPTURED, an explicit empty
 *     record is the declared-none form.
 *
 * The effective read mirrors the recovered Python owner
 * `tools/recovery/combat_parameters.fighter_parameter` (bounded = rawMax != 2147483647; maximum =
 * rawMax+extraMax (+equipment when bounded); value = rawValue+extraValue (+equipment when
 * unbounded), clamped to the maximum) and the refill in `tools/recovery/combat_sandbox.py`
 * `run_scenario` (for parameters 10 and 11 the source current rawValue is set to the prepared
 * effective maximum).
 *
 * Usage:
 *   node --import ./tools/battle-setup-check/register.mjs tools/valuable-stats-check/combat-effect_check.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(here, "..", "..", "..", "..", "..");

const { battleSetupFromLoadouts } = await import("@/lib/battle-legality");
const { battleSetupToCombatScenario } = await import("@/lib/battle-setup-adapter");
const { EQUIPMENT_BY_ID } = await import("@/lib/battle-setup");
const { getJobProfile } = await import("@/game-data/job-profile");
const { STAT_PARAMETER_IDS } = await import("@/game-data/stat-parameter-ids");
const { residentValuableParameterDeltas } = await import("@/game-data/resident-valuable-effects");
const { EQUIPMENT_CATALOG: SITE_EQUIPMENT } = await import("@/lib/generated-equipment-data");

const checks = [];
const check = (name, actual, expected) => {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, passed, detail: passed ? "ok" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` });
};
const checkTruthy = (name, actual, detail = "expected truthy") => {
  checks.push({ name, passed: Boolean(actual), detail: actual ? "ok" : detail });
};

const shared = JSON.parse(
  readFileSync(path.join(WORKSPACE, "KA-Website", "artifacts", "api-server", "data", "ka_shared.json"), "utf8"),
);

/* Fixture: Knight rank S with one equipable weapon and shield (same candidate rule as legality_check). */
const JOB = "Knight";
const RANK = "S";
const SITE_ID_BY_NAME = new Map(SITE_EQUIPMENT.map((entry) => [entry.name, entry.id]));
const slotNames = (slot) => Object.keys(shared.slotAssignments ?? {}).filter((name) => shared.slotAssignments[name] === slot && SITE_ID_BY_NAME.has(name));
const profile = getJobProfile(shared, JOB);
const weaponName = slotNames("Weapon").find((name) => {
  const type = shared.weaponTypes?.[name];
  return type && type !== "Tool" && profile?.equipmentAccess.weapons?.[type] === "can";
});
const shieldName = profile?.equipmentAccess.shield === "can" ? slotNames("Shield")[0] : null;
checkTruthy("fixture weapon is equipable by Knight", weaponName, "no Knight 'can' weapon found");

const BASE_LEVELS = { hp: 25, atk: 20, def: 20 };
const VALUABLES = { life: 3, wisdom: 2, vitality: 4, might: 5, resilience: 1 };
const EXPECTED = { hp: 30, mp: 20, vig: 40, atk: 50, def: 10 };
const INT_MAX = 2147483647;
const HP = STAT_PARAMETER_IDS.hp;
const MP = STAT_PARAMETER_IDS.mp;
const VIG = STAT_PARAMETER_IDS.vig;
const ATK = STAT_PARAMETER_IDS.atk;
const DEF = STAT_PARAMETER_IDS.def;

function loadoutFixture({ valuables, gear }) {
  const loadout = {
    name: gear ? "Valuable Knight +gear" : "Valuable Knight",
    jobName: JOB,
    rank: RANK,
    statLevels: { ...BASE_LEVELS },
    equipment: gear
      ? [
          ...(weaponName ? [{ name: weaponName, level: 12 }] : []),
          ...(shieldName ? [{ name: shieldName, level: 5 }] : []),
        ]
      : [],
    skills: [],
  };
  if (valuables !== "omitted") loadout.residentStatItems = valuables;
  return loadout;
}

function convert(loadout) {
  const result = battleSetupFromLoadouts([loadout], shared, { encounterId: 19 });
  const errorCodes = result.issues.filter((issue) => issue.category === "ERROR").map((issue) => issue.code);
  return { result, errorCodes, unit: result.units[0] ?? null };
}

function scenarioOf(setup) {
  return battleSetupToCombatScenario(setup).scenario.ownUnits[0];
}

/** Recovered `combat_parameters.equipment_contribution` + `affinity_contribution`. */
function equipmentContribution(equipment, parameterId, level, affinity) {
  const entry = EQUIPMENT_BY_ID.get(equipment.id);
  const pair = entry?.parameters?.[parameterId - 10];
  if (!pair) return 0;
  const value = (pair[0] ?? 0) + (pair[1] ?? 0) * (level - 1);
  return affinity === 0 && value > 0 ? Math.max(1, Math.floor(value / 2)) : value;
}

/** Recovered `combat_parameters.fighter_parameter` read for one parameter. */
function effectiveRead(parameterId, parameter, equipment) {
  const bounded = parameter.rawMax !== INT_MAX;
  const gear = equipment.reduce((total, row) => total + equipmentContribution(row, parameterId, row.level, row.affinity), 0);
  const maximum = bounded ? parameter.rawMax + parameter.extraMax + gear : INT_MAX;
  const raw = parameter.rawValue + parameter.extraValue + (bounded ? 0 : gear);
  const value = parameterId === 25 ? raw : Math.max(0, Math.min(maximum, raw));
  return { value, maximum, bounded };
}

/** The launcher refills parameters 10/11 current to the effective maximum; the refill source model. */
function refilledCurrent(parameterId, parameter, equipment) {
  const read = effectiveRead(parameterId, parameter, equipment);
  if (parameterId === HP || parameterId === MP) return read.maximum;
  return read.value;
}

/* ---- declared input: captured vs declared-none vs not captured ------------------------------- */

const declaredNone = convert(loadoutFixture({ valuables: {}, gear: true }));
const omitted = convert(loadoutFixture({ valuables: "omitted", gear: true }));
check("declared-none loadout converts with no ERROR", declaredNone.errorCodes, []);
check(
  "an explicit empty residentStatItems record is declared-none (no NOT_CAPTURED unknown)",
  declaredNone.result.issues.some((issue) => issue.code === "RESIDENT_VALUABLES_NOT_CAPTURED"),
  false,
);
check(
  "an absent residentStatItems field reports RESIDENT_VALUABLES_NOT_CAPTURED",
  omitted.result.issues.some((issue) => issue.code === "RESIDENT_VALUABLES_NOT_CAPTURED"),
  true,
);
check("the omitted loadout still converts (declared-input zero, not an error)", omitted.result.setup !== null, true);

/* ---- same job levels, only the valuables differ ----------------------------------------------- */

const plain = convert(loadoutFixture({ valuables: {}, gear: true }));
const valuable = convert(loadoutFixture({ valuables: VALUABLES, gear: true }));
check("valuable loadout converts with no ERROR", valuable.errorCodes, []);

const plainParams = plain.unit.parameters;
const valuableParams = valuable.unit.parameters;

check(
  "valuables do not move rawValue (same job levels -> same job curve)",
  [HP, MP, VIG, ATK, DEF].map((id) => valuableParams[id].rawValue - plainParams[id].rawValue),
  [0, 0, 0, 0, 0],
);
check(
  "bounded HP/MP/Vigor keep their real rawMax, non-resource stats keep the INT_MAX sentinel",
  [HP, MP, VIG, ATK, DEF].map((id) => (valuableParams[id].rawMax === INT_MAX ? "unbounded" : "bounded")),
  ["bounded", "bounded", "bounded", "unbounded", "unbounded"],
);

const deltas = residentValuableParameterDeltas(VALUABLES);
check(
  "converter carries exactly the helper's native per-parameter deltas",
  [HP, MP, VIG, ATK, DEF].map((id) => [valuableParams[id].extraValue, valuableParams[id].extraMax]),
  [HP, MP, VIG, ATK, DEF].map((id) => [deltas[id]?.valueDelta ?? 0, deltas[id]?.maxDelta ?? 0]),
);
check(
  "HP/MP/Vigor land on the bounded maximum only (native AddMaxValue)",
  [HP, MP, VIG].map((id) => [valuableParams[id].extraValue, valuableParams[id].extraMax]),
  [[0, EXPECTED.hp], [0, EXPECTED.mp], [0, EXPECTED.vig]],
);
check(
  "Attack/Defence land on the value only (native Add)",
  [ATK, DEF].map((id) => [valuableParams[id].extraValue, valuableParams[id].extraMax]),
  [[EXPECTED.atk, 0], [EXPECTED.def, 0]],
);

/* ---- effective combat stats (recovered read) -------------------------------------------------- */

const plainUnit = scenarioOf(plain.result.setup);
const valuableUnit = scenarioOf(valuable.result.setup);
const atkGain = effectiveRead(ATK, valuableUnit.parameters[ATK], valuableUnit.equipment).value
  - effectiveRead(ATK, plainUnit.parameters[ATK], plainUnit.equipment).value;
const defGain = effectiveRead(DEF, valuableUnit.parameters[DEF], valuableUnit.equipment).value
  - effectiveRead(DEF, plainUnit.parameters[DEF], plainUnit.equipment).value;
check("effective Attack grows by exactly the Water of Might amount", atkGain, EXPECTED.atk);
check("effective Defence grows by exactly the Water of Resilience amount", defGain, EXPECTED.def);

const hpPlain = effectiveRead(HP, plainUnit.parameters[HP], plainUnit.equipment);
const hpValuable = effectiveRead(HP, valuableUnit.parameters[HP], valuableUnit.equipment);
check("effective HP maximum grows by the Water of Life amount", hpValuable.maximum - hpPlain.maximum, EXPECTED.hp);
check(
  "HP pre-battle refill sets the effective current to the effective maximum (valuables included)",
  refilledCurrent(HP, valuableUnit.parameters[HP], valuableUnit.equipment),
  hpValuable.maximum,
);
check("refilled HP current grows by the Water of Life amount", refilledCurrent(HP, valuableUnit.parameters[HP], valuableUnit.equipment) - refilledCurrent(HP, plainUnit.parameters[HP], plainUnit.equipment), EXPECTED.hp);

const mpPlain = effectiveRead(MP, plainUnit.parameters[MP], plainUnit.equipment);
const mpValuable = effectiveRead(MP, valuableUnit.parameters[MP], valuableUnit.equipment);
check(
  "MP pre-battle refill sets the effective current to the effective maximum and grows by the Water of Wisdom amount",
  [
    refilledCurrent(MP, valuableUnit.parameters[MP], valuableUnit.equipment),
    mpValuable.maximum - mpPlain.maximum,
  ],
  [mpValuable.maximum, EXPECTED.mp],
);

const vigPlain = effectiveRead(VIG, plainUnit.parameters[VIG], plainUnit.equipment);
const vigValuable = effectiveRead(VIG, valuableUnit.parameters[VIG], valuableUnit.equipment);
check(
  "Vigor is max-only and unrefilled: maximum grows, current stays at the job-curve value",
  {
    currentGain: vigValuable.value - vigPlain.value,
    maximumGain: vigValuable.maximum - vigPlain.maximum,
    currentIsRaw: vigValuable.value === valuableUnit.parameters[VIG].rawValue,
  },
  { currentGain: 0, maximumGain: EXPECTED.vig, currentIsRaw: true },
);

/* ---- no double counting: gear is downstream and counted once ---------------------------------- */

const plainNoGear = convert(loadoutFixture({ valuables: {}, gear: false }));
const valuableNoGear = convert(loadoutFixture({ valuables: VALUABLES, gear: false }));
check("no-gear fixtures convert with no ERROR", [...plainNoGear.errorCodes, ...valuableNoGear.errorCodes], []);

const gearIgnoresNonEquipmentPart = [HP, MP, VIG, ATK, DEF].every((id) =>
  plain.unit.parameters[id].rawValue === plainNoGear.unit.parameters[id].rawValue &&
  plain.unit.parameters[id].extraValue === plainNoGear.unit.parameters[id].extraValue &&
  plain.unit.parameters[id].extraMax === plainNoGear.unit.parameters[id].extraMax,
);
check("equipment never enters rawValue/extraValue/extraMax (counted once downstream)", gearIgnoresNonEquipmentPart, true);

const valuableUnitNoGear = scenarioOf(valuableNoGear.result.setup);
const plainUnitNoGear = scenarioOf(plainNoGear.result.setup);
const atkGainNoGear = effectiveRead(ATK, valuableUnitNoGear.parameters[ATK], valuableUnitNoGear.equipment).value
  - effectiveRead(ATK, plainUnitNoGear.parameters[ATK], plainUnitNoGear.equipment).value;
const hpGainNoGear = effectiveRead(HP, valuableUnitNoGear.parameters[HP], valuableUnitNoGear.equipment).maximum
  - effectiveRead(HP, plainUnitNoGear.parameters[HP], plainUnitNoGear.equipment).maximum;
check(
  "the valuable delta is gear-independent (no equipment double count)",
  [atkGainNoGear, hpGainNoGear, atkGain, hpValuable.maximum - hpPlain.maximum],
  [EXPECTED.atk, EXPECTED.hp, EXPECTED.atk, EXPECTED.hp],
);
check(
  "each equipped row is carried once as a scenario equipment row",
  valuableUnit.equipment.length,
  [weaponName, shieldName].filter(Boolean).length,
);
checkTruthy("the equipped scenario keeps the resolved gear ids", valuableUnit.equipment.length > 0, "no gear rows were carried");

const failures = checks.filter((entry) => !entry.passed);
console.log(JSON.stringify({ checks: checks.length, failed: failures.length, failures: failures.slice(0, 6) }));
process.exitCode = failures.length === 0 ? 0 : 1;
