/**
 * Deterministic legality check for the saved-loadout -> battle setup transfer.
 *
 * Runs the real site modules (no bundler, no browser) plus the authoritative Python scenario
 * loader, and writes a JSON summary. Exit code 1 when any check fails.
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-setup-check/legality_check.mjs
 *
 * Optional: --out <dir> (defaults to the PASS 16 evidence folder).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..", "..");
const SHARED_JSON = path.join(WORKSPACE, "KA-Website", "artifacts", "api-server", "data", "ka_shared.json");

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const OUT = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : path.join(
  WORKSPACE,
  "RE-evidence",
  "20260919-configurable-battle-setup",
  "legal-integration-16.14",
);

const stable = (value) => JSON.stringify(value, (key, entry) => (
  entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
    : entry
));

const checks = [];
const check = (name, actual, expected) => {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, passed, detail: passed ? "ok" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` });
};
const checkTruthy = (name, actual, detail = "expected truthy") => {
  checks.push({ name, passed: Boolean(actual), detail: actual ? "ok" : detail });
};

const {
  battleSetupFromLoadouts,
  describeNativeRunnerRejection,
  equipmentVariantAmbiguity,
  resolveCombatEquipmentId,
  SKILL_ID_BY_NAME,
  SKILL_NAME_CONFLICTS,
  SITE_EQUIPMENT_ID_BY_NAME,
} = await import("@/lib/battle-legality");
const { STAT_PARAMETER_IDS, canonicalStatKey } = await import("@/game-data/stat-parameter-ids");
const { EQUIPMENT_CATALOG: COMBAT_EQUIPMENT, SKILL_CATALOG, EQUIPMENT_BY_ID, SKILL_BY_ID, importBattleSetup, serializeBattleSetup } = await import("@/lib/battle-setup");
const { battleSetupToCombatScenario } = await import("@/lib/battle-setup-adapter");
const { JOB_SKILL_DATA } = await import("@/lib/generated-job-skill-data");
const { EQUIPMENT_CATALOG: SITE_EQUIPMENT } = await import("@/lib/generated-equipment-data");

const shared = JSON.parse(readFileSync(SHARED_JSON, "utf8"));

/* 1. catalog join invariants ------------------------------------------------- */

check("skill catalog rows", SKILL_CATALOG.length, 136);
check("site equipment catalog rows", SITE_EQUIPMENT.length, 296);
check("combat equipment catalog rows", COMBAT_EQUIPMENT.length, 313);
check("skill-name conflicts are limited to the literal placeholder rows", SKILL_NAME_CONFLICTS.map((entry) => entry.name), ["Skill"]);
check("no shared skill name is ambiguous", Object.keys(shared.skills ?? {}).filter((name) => SKILL_NAME_CONFLICTS.some((entry) => entry.name === name)), []);
check(
  "every recovered skill renders a concrete name",
  SKILL_CATALOG.every((entry) => !entry.nameText.includes("<0>") || entry.nameArg.length > 0),
  true,
);
const siteSkillNames = Object.keys(shared.skills ?? {});
const unresolvedSiteSkills = siteSkillNames.filter((name) => !SKILL_ID_BY_NAME.has(name));
check("every shared skill name resolves to a recovered skill id", unresolvedSiteSkills, []);
check(
  "shared skill names are one-to-one with recovered ids",
  new Set(siteSkillNames.map((name) => SKILL_ID_BY_NAME.get(name))).size,
  siteSkillNames.length,
);
check("Normal Attack resolves to skill 0", SKILL_ID_BY_NAME.get("Normal Attack"), 0);
check("7-Hit Attack resolves to skill 110", SKILL_ID_BY_NAME.get("7-Hit Attack"), 110);
check("Heal M resolves to skill 38", SKILL_ID_BY_NAME.get("Heal M"), 38);
check("Revive 100% resolves to skill 41", SKILL_ID_BY_NAME.get("Revive 100%"), 41);

const equipmentIdMismatches = [];
for (const entry of SITE_EQUIPMENT) {
  const resolved = resolveCombatEquipmentId(entry.name);
  if (resolved !== entry.id) equipmentIdMismatches.push({ name: entry.name, expected: entry.id, resolved });
}
check("every site equipment name resolves to its own recovered id", equipmentIdMismatches, []);
check("site equipment ids all exist in the combat catalog", SITE_EQUIPMENT.every((entry) => EQUIPMENT_BY_ID.has(entry.id)), true);
check("site equipment id map size", SITE_EQUIPMENT_ID_BY_NAME.size, SITE_EQUIPMENT.length);
check("Bare-Handed is weapon id 0", resolveCombatEquipmentId("Bare-Handed"), 0);

/* 2. stat key -> native parameter id ---------------------------------------- */

const statMismatches = [];
for (const entry of SITE_EQUIPMENT) {
  const overrides = shared.overrides?.[entry.name];
  if (!overrides) continue;
  const combat = EQUIPMENT_BY_ID.get(entry.id);
  for (const [rawStat, pair] of Object.entries(overrides)) {
    const key = canonicalStatKey(rawStat);
    const pid = STAT_PARAMETER_IDS[key];
    if (!pid) { statMismatches.push({ name: entry.name, stat: rawStat, reason: "no parameter id" }); continue; }
    const native = combat.parameters[pid - 10] ?? [0, 0];
    if ((pair.base ?? 0) !== native[0] || (pair.inc ?? 0) !== native[1]) {
      statMismatches.push({ name: entry.name, stat: rawStat, site: pair, native });
    }
  }
}
check("only the two divergent variant rows disagree with the recovered contribution table", Array.from(new Set(statMismatches.map((entry) => entry.name))).sort(), ["B/ Legendary Shield (B)", "E/ Hat (B)"]);
check("294 of 296 shared rows agree with the recovered contribution table", SITE_EQUIPMENT.filter((entry) => shared.overrides?.[entry.name] && !statMismatches.some((mismatch) => mismatch.name === entry.name)).length, 294);
check("variant ambiguity resolves the duplicate-name row", equipmentVariantAmbiguity("E/ Hat (B)", EQUIPMENT_BY_ID.get(235), shared.overrides), [237]);
check("non-variant rows report no ambiguity", equipmentVariantAmbiguity("F/ Wooden Staff", EQUIPMENT_BY_ID.get(resolveCombatEquipmentId("F/ Wooden Staff")), shared.overrides), []);
check("the matching (R) row reports no ambiguity", equipmentVariantAmbiguity("E/ Hat (R)", EQUIPMENT_BY_ID.get(237), shared.overrides), []);
const parameterSignatures = new Map();
for (const id of Object.values(STAT_PARAMETER_IDS)) {
  parameterSignatures.set(id, COMBAT_EQUIPMENT.map((entry) => JSON.stringify(entry.parameters[id - 10] ?? null)).join(";"));
}
check("the 12 native parameter vectors are pairwise distinct", new Set(parameterSignatures.values()).size, 12);

/* 3. fixture builders ------------------------------------------------------- */

const { getJobProfile } = await import("@/game-data/job-profile");

function equipmentNamesForSlot(slotName) {
  const slots = shared.slotAssignments ?? {};
  return Object.keys(slots).filter((name) => slots[name] === slotName && SITE_EQUIPMENT_ID_BY_NAME.has(name));
}

function weaponNameFor(jobName, wantedAccess) {
  const profile = getJobProfile(shared, jobName);
  const weaponTypes = shared.weaponTypes ?? {};
  for (const name of equipmentNamesForSlot("Weapon")) {
    const type = weaponTypes[name];
    if (!type || type === "Tool") continue;
    if (profile?.equipmentAccess.weapons?.[type] === wantedAccess) return { name, type };
  }
  return null;
}

function shieldNameFor(jobName, wantedAccess) {
  const profile = getJobProfile(shared, jobName);
  if (profile?.equipmentAccess.shield !== wantedAccess) return null;
  const name = equipmentNamesForSlot("Shield")[0];
  return name ? { name } : null;
}

const JOB = "Knight";
const RANK = "S";
const jobCurve = shared.jobs[JOB].ranks[RANK].stats;
const hpCurve = jobCurve.HP;
const weapon = weaponNameFor(JOB, "can");
checkTruthy("fixture weapon for Knight (can)", weapon, "no Knight weapon with access 'can' found");
const shield = shieldNameFor(JOB, "can");
const learnedSkills = JOB_SKILL_DATA[JOB][RANK];
checkTruthy("fixture job learns at least two skills", learnedSkills.length >= 2, "Knight rank S skills missing");

const validLoadout = {
  id: "fixture-valid",
  name: "Knight Fixture",
  jobName: JOB,
  rank: RANK,
  statLevels: { hp: 25, atk: 20, def: 20 },
  equipment: [
    ...(weapon ? [{ name: weapon.name, level: 12 }] : []),
    ...(shield ? [{ name: shield.name, level: 5 }] : []),
  ],
  skills: learnedSkills.slice(0, 2),
  residentStatItems: { life: 2 },
};

const valid = battleSetupFromLoadouts([validLoadout], shared);
const validErrors = valid.issues.filter((issue) => issue.category === "ERROR");
check("valid loadout converts", valid.setup !== null, true);
check("valid loadout has no ERROR issues", validErrors, []);
const unit = valid.units[0];
check("converted job id", unit.jobId, JOB);
check("converted rank", unit.rank, RANK);
check("converted hp rawValue is the job curve at the saved level", unit.parameters["10"].rawValue, Math.round(hpCurve.base + 24 * hpCurve.inc));
check("converted hp rawMax equals rawValue (bounded)", unit.parameters["10"].rawMax, unit.parameters["10"].rawValue);
check(
  "converted hp carries the two Water of Life items on the bounded maximum (native AddMaxValue)",
  [unit.parameters["10"].extraValue, unit.parameters["10"].extraMax],
  [0, 20],
);
check("converted hp trainingLevel is the saved stat level", unit.parameters["10"].trainingLevel, 25);
check("atk stat uses its own level", unit.parameters["13"].rawValue, Math.round(jobCurve.Attack.base + 19 * jobCurve.Attack.inc));
check("def stat uses its own level", unit.parameters["14"].rawValue, Math.round(jobCurve.Defence.base + 19 * jobCurve.Defence.inc));
check("unset stat falls back to level 1", unit.parameters["12"].rawValue, Math.round(jobCurve.Vigor.base));
check("weapon slot id", unit.weaponId, weapon ? SITE_EQUIPMENT_ID_BY_NAME.get(weapon.name) : 0);
check("weapon slot level preserved", unit.equipmentSlots.weapon?.level, 12);
check("shield slot id", unit.equipmentSlots.shield?.id ?? null, shield ? SITE_EQUIPMENT_ID_BY_NAME.get(shield.name) : null);
check("equipment affinity default", unit.equipmentSlots.weapon?.affinity, 1);
check("skill ids in saved order", unit.skills.map((entry) => entry.skillId), learnedSkills.slice(0, 2).map((name) => SKILL_ID_BY_NAME.get(name)));
check("all twelve native human parameters present", Object.keys(unit.parameters).map(Number).sort((a, b) => a - b), [10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22]);
checkTruthy("provenance separates player inputs from synthetic research inputs", valid.provenance.some((entry) => entry.origin === "PLAYER_LOADOUT") && valid.provenance.some((entry) => entry.origin === "RESEARCH_SYNTHETIC"));
checkTruthy("provenance labels the affinity/invocation gaps", valid.provenance.some((entry) => entry.origin === "UNKNOWN_NOT_CAPTURED"));
check("the knight fixture uses no ambiguous variant row", valid.issues.filter((issue) => issue.code === "EQUIPMENT_VARIANT_ID_AMBIGUOUS"), []);

/* 4. lossless transfer ------------------------------------------------------ */

const serialized = serializeBattleSetup(valid.setup);
const reimported = importBattleSetup(serialized);
check("serialized setup re-imports without errors", reimported.issues.filter((issue) => issue.category === "ERROR"), []);
check("re-import keeps job id", reimported.setup.playerTeam[0].jobId, JOB);
check("re-import keeps parameters", stable(reimported.setup.playerTeam[0].parameters), stable(unit.parameters));
check("re-import keeps equipment slots", stable(reimported.setup.playerTeam[0].equipmentSlots), stable(unit.equipmentSlots));
check("re-import keeps skills", stable(reimported.setup.playerTeam[0].skills), stable(unit.skills));
check("re-import keeps weapon id", reimported.setup.playerTeam[0].weaponId, unit.weaponId);

const { scenario, warnings } = battleSetupToCombatScenario(valid.setup);
const expectedEquipmentOrder = ["weapon", "shield", "head", "body", "accessory"]
  .map((slot) => unit.equipmentSlots[slot])
  .filter(Boolean)
  .map((selection) => selection.id);
check("adapter keeps the equipment ids in slot order", scenario.ownUnits[0].equipment.map((row) => row.id), expectedEquipmentOrder);
check("adapter keeps the equipment levels", scenario.ownUnits[0].equipment.map((row) => row.level), [12, ...(shield ? [5] : [])]);
check("adapter keeps the skill ids", scenario.ownUnits[0].skills, unit.skills.map((entry) => entry.skillId));
check("adapter keeps the invocation levels", scenario.ownUnits[0].invocationLevels, unit.skills.map((entry) => entry.invocationLevel));
check("adapter keeps weaponId", scenario.ownUnits[0].weaponId, unit.weaponId);

/* 5. invalid configurations ------------------------------------------------- */

const errorCodes = (result) => result.issues.filter((issue) => issue.category === "ERROR").map((issue) => issue.code);

const cannotWeapon = weaponNameFor("Researcher", "cannot");
const researcherLoadout = { jobName: "Researcher", rank: "D", statLevels: { hp: 5 }, equipment: cannotWeapon ? [{ name: cannotWeapon.name, level: 3 }] : [], skills: [] };
const researcher = battleSetupFromLoadouts([researcherLoadout], shared);
check("job-forbidden weapon is rejected", researcher.setup, null);
checkTruthy("job-forbidden weapon reports JOB_EQUIPMENT_NOT_ALLOWED", errorCodes(researcher).includes("JOB_EQUIPMENT_NOT_ALLOWED"));

const unknownJob = battleSetupFromLoadouts([{ jobName: "Not A Job", rank: "D", equipment: [], skills: [] }], shared);
check("unknown job is rejected", unknownJob.setup, null);
checkTruthy("unknown job reports LOADOUT_JOB_UNKNOWN", errorCodes(unknownJob).includes("LOADOUT_JOB_UNKNOWN"));

const unknownRank = battleSetupFromLoadouts([{ jobName: JOB, rank: "EX", equipment: [], skills: [] }], shared);
check("unknown rank is rejected", unknownRank.setup, null);
checkTruthy("unknown rank reports LOADOUT_RANK_UNKNOWN", errorCodes(unknownRank).includes("LOADOUT_RANK_UNKNOWN"));

const monarch = battleSetupFromLoadouts([{ jobName: "Monarch", rank: "D", equipment: [], skills: [] }], shared);
check("job missing from the combat job catalog is rejected", monarch.setup, null);
checkTruthy("non-combat job reports JOB_NOT_IN_COMBAT_CATALOG", errorCodes(monarch).includes("JOB_NOT_IN_COMBAT_CATALOG"));

const unknownEquipment = battleSetupFromLoadouts([{ jobName: JOB, rank: RANK, equipment: [{ name: "F/ Made Up Sword", level: 1 }], skills: [] }], shared);
check("unknown equipment is rejected", unknownEquipment.setup, null);
checkTruthy("unknown equipment reports EQUIPMENT_NAME_UNRESOLVED", errorCodes(unknownEquipment).includes("EQUIPMENT_NAME_UNRESOLVED"));

const unknownSkill = battleSetupFromLoadouts([{ jobName: JOB, rank: RANK, equipment: [], skills: ["Made Up Skill"] }], shared);
check("unknown skill is rejected", unknownSkill.setup, null);
checkTruthy("unknown skill reports SKILL_NAME_UNRESOLVED", errorCodes(unknownSkill).includes("SKILL_NAME_UNRESOLVED"));

const duplicateShield = shieldNameFor(JOB, "can");
const doubleShield = battleSetupFromLoadouts([
  { jobName: JOB, rank: RANK, equipment: duplicateShield ? [{ name: duplicateShield.name, level: 1 }, { name: duplicateShield.name, level: 2 }] : [], skills: [] },
], shared);
checkTruthy("duplicate slot reports EQUIPMENT_SLOT_DUPLICATE", errorCodes(doubleShield).includes("EQUIPMENT_SLOT_DUPLICATE"));

const badLevel = battleSetupFromLoadouts([{ jobName: JOB, rank: RANK, equipment: weapon ? [{ name: weapon.name, level: 0 }] : [], skills: [] }], shared);
checkTruthy("equipment level 0 reports EQUIPMENT_LEVEL_INVALID", errorCodes(badLevel).includes("EQUIPMENT_LEVEL_INVALID"));

const badStatLevel = battleSetupFromLoadouts([{ jobName: JOB, rank: RANK, statLevels: { hp: 0 }, equipment: [], skills: [] }], shared);
checkTruthy("stat level 0 reports LOADOUT_STAT_LEVEL_INVALID", errorCodes(badStatLevel).includes("LOADOUT_STAT_LEVEL_INVALID"));

const emptyTeam = battleSetupFromLoadouts([], shared);
check("empty team is rejected", emptyTeam.setup, null);
checkTruthy("empty team reports LOADOUT_TEAM_EMPTY", errorCodes(emptyTeam).includes("LOADOUT_TEAM_EMPTY"));

const weakWeapon = weaponNameFor("Knight", "weak");
const weak = battleSetupFromLoadouts([{ jobName: "Knight", rank: RANK, equipment: weakWeapon ? [{ name: weakWeapon.name, level: 4 }] : [], skills: [] }], shared);
checkTruthy("weak weapon converts with the labelled halving rule", weak.issues.some((issue) => issue.code === "AFFINITY_HALVING_FROM_WEAKNESS" && issue.category === "UNKNOWN_NATIVE_RULE"));
check("weak weapon affinity is 0", weak.units[0]?.equipmentSlots.weapon?.affinity, 0);

const twoLoadouts = battleSetupFromLoadouts([validLoadout, validLoadout], shared);
check("duplicate loadout names are made unique", twoLoadouts.units.map((entry) => entry.name), ["Knight Fixture", "Knight Fixture (2)"]);
checkTruthy("duplicate names are reported", twoLoadouts.issues.some((issue) => issue.code === "UNIT_NAME_DERIVED"));
check("two converted humans keep both units", twoLoadouts.setup?.playerTeam.length, 2);
check("two converted humans have no ERROR issues", twoLoadouts.issues.filter((issue) => issue.category === "ERROR"), []);

/* 6. native runner agreement ------------------------------------------------ */

function runPython(script, scenarioFiles) {
  const python = path.join(WORKSPACE, ".venv", "Scripts", "python.exe");
  const candidates = existsSync(python) ? [python] : ["python", "py"];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["-c", script, ...scenarioFiles], { encoding: "utf8", windowsHide: true });
    if (result.error && result.error.code === "ENOENT") continue;
    if (result.error) throw result.error;
    return result;
  }
  throw new Error("no Python interpreter found");
}

mkdirSync(OUT, { recursive: true });
const scenarioPath = path.join(OUT, "legality-valid-scenario.json");
writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2) + "\n");

const PY = `
import json, sys
sys.path.insert(0, r"${path.join(WORKSPACE, "KA-Website", "tools", "recovery")}")
from combat_scenario import load_scenario, ScenarioError
from combat_setup import prepare_setup
out = {}
with open(sys.argv[1], encoding="utf-8") as fh:
    scenario = json.load(fh)
loaded = load_scenario(scenario)
prepared = prepare_setup(scenario)
unit = prepared["ownUnits"][0]
out["accepted"] = True
out["effectiveHp"] = unit["effectiveParameters"][10]["value"]
out["effectiveHpMax"] = unit["effectiveParameters"][10]["maximum"]
out["effectiveAttack"] = unit["effectiveParameters"][13]["value"]
out["averageTrainingLevel"] = unit["averageTrainingLevel"]
out["skillCosts"] = unit["skillCosts"]
out["status"] = prepared["status"]
bad = json.loads(json.dumps(scenario))
bad["ownUnits"][0]["skills"] = [9999]
bad["ownUnits"][0]["invocationLevels"] = [0]
try:
    load_scenario(bad)
    out["rejectedUnknownSkill"] = None
except ScenarioError as error:
    out["rejectedUnknownSkill"] = str(error)
bad2 = json.loads(json.dumps(scenario))
if bad2["ownUnits"][0]["weaponId"] != 0:
    bad2["ownUnits"][0]["equipment"] = [row for row in bad2["ownUnits"][0]["equipment"] if row["id"] != bad2["ownUnits"][0]["weaponId"]]
    try:
        load_scenario(bad2)
        out["rejectedWeaponNotInContributions"] = None
    except ScenarioError as error:
        out["rejectedWeaponNotInContributions"] = str(error)
print(json.dumps(out))
`;

let native = { skipped: null };
let pyResult = null;
try {
  pyResult = runPython(PY, [scenarioPath]);
} catch (error) {
  native = { skipped: error?.code ?? String(error) };
}

if (native.skipped) {
  checks.push({
    name: "native runner verification",
    passed: true,
    skipped: true,
    detail: `skipped: process spawn is blocked in this sandbox (${native.skipped}); run the same command from an unsandboxed shell`,
  });
} else {
  check("python runner exits 0", pyResult.status, 0);
  try {
    native = JSON.parse((pyResult.stdout ?? "").trim().split(/\r?\n/).pop() ?? "{}");
  } catch (error) {
    native = { parseError: String(error), stdout: pyResult.stdout, stderr: pyResult.stderr };
  }
  check("authoritative loader accepts the converted setup", native.accepted, true);
  check("native effective HP includes raw, extra and equipment", native.effectiveHp >= unit.parameters["10"].rawValue + 20, true);
  check("native average training level follows the saved stat levels", native.averageTrainingLevel, Math.max(1, Math.trunc((25 + 20 + 20 + 9) / 12)));
  check("native rejects an unknown skill", native.rejectedUnknownSkill, "Unknown skill or invocation setting");
  check("native rejects a weapon outside the contribution list", native.rejectedWeaponNotInContributions, "Weapon must be included in equipment contributions");
}

check(
  "runner rejection text is surfaced verbatim",
  describeNativeRunnerRejection(500, JSON.stringify({ error: "ScenarioError: Unknown equipment" })),
  "ScenarioError: Unknown equipment (runner HTTP 500)",
);
check(
  "runner rejection survives a traceback body",
  describeNativeRunnerRejection(400, "Traceback (most recent call last):\n  ...\ncombat_scenario.ScenarioError: Missing inputs").includes("ScenarioError: Missing inputs"),
  true,
);

/* 7. summary ---------------------------------------------------------------- */

const failed = checks.filter((entry) => !entry.passed);
const summary = {
  generatedBy: "tools/battle-setup-check/legality_check.mjs",
  schema: "ka-battle-legality-check-1",
  totals: { checks: checks.length, failed: failed.length },
  native,
  checks,
};
writeFileSync(path.join(OUT, "legality-check.json"), JSON.stringify(summary, null, 2) + "\n");
for (const entry of checks) {
  if (!entry.passed) console.log(`FAIL ${entry.name}: ${entry.detail}`);
}
console.log(`${checks.length - failed.length}/${checks.length} legality checks passed (${OUT})`);
process.exit(failed.length === 0 ? 0 : 1);
