/**
 * Focused, deterministic checks for the confirmed native training-limit progression and the per-UNIT
 * declared cap:
 *   * the native step constant (30) and ceiling (999) decoded from SubForm.ResidentGrowLevelLimit
 *     0x175ea90 -> Parameter.AddMaxLevel 0x1682a50,
 *   * the user's Ninja (rank A, awakening 20, HP 314 / MP 330) staying legal through the existing
 *     loadout owner,
 *   * a 0-awakening Scholar being capped at the Job.csv base (so it can never borrow the Ninja's
 *     +600 steps),
 *   * per-parameter caps that differ, per-unit enforcement on a mixed team, import preservation,
 *     and the removal of the party-wide `awakeningAllowance` option.
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-setup-check/progression_fidelity_check.mjs
 *
 * No network, no browser, no evidence writes. Exits 1 on any failed check.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const SHARED_JSON = path.join(WORKSPACE, "KA-Website", "artifacts", "api-server", "data", "ka_shared.json");

const { battleSetupFromLoadouts } = await import("@/lib/battle-legality");
const { battleSetupToCombatScenario } = await import("@/lib/battle-setup-adapter");
const {
  NATIVE_AWAKENING_MAX_LEVEL_STEP,
  NATIVE_PARAMETER_MAX_LEVEL_CEILING,
  createDefaultBattleSetup,
  createHumanUnit,
  importBattleSetup,
  nativeJobParameterMaxLevels,
  nativeParameterTrainingCaps,
  serializeBattleSetup,
  validateBattleSetup,
} = await import("@/lib/battle-setup");
const { USER_WAIRO_PRESET, userWairoPresetConversionOptions, userWairoPresetLoadouts } = await import("@/lib/user-wairo-preset");

const shared = JSON.parse(readFileSync(SHARED_JSON, "utf8"));
const checks = [];
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail: passed ? "ok" : String(detail) });
const codes = (issues) => issues.map((issue) => issue.code);
const errorsOn = (issues, pathFragment) =>
  issues.filter((issue) => issue.category === "ERROR" && issue.path.includes(pathFragment));

const HP = 10;
const MP = 11;

function unitSetup(unit) {
  const setup = createDefaultBattleSetup(19);
  setup.playerTeam = [unit];
  return setup;
}

function scholarUnit(awakening, trainingLevel) {
  const unit = createHumanUnit(1);
  unit.name = "Scholar";
  unit.jobId = "Scholar";
  unit.rank = "D";
  if (awakening !== null) unit.progression = { awakening, source: "PLAYER_LOADOUT" };
  unit.parameters[String(HP)] = { rawValue: 100, rawMax: 100, extraValue: 0, extraMax: 0, trainingLevel };
  return unit;
}

/* 1. Native constants and the per-unit cap formula ---------------------------------- */

check("native awakening step constant is 30", NATIVE_AWAKENING_MAX_LEVEL_STEP === 30, NATIVE_AWAKENING_MAX_LEVEL_STEP);
check("native maxLevel ceiling is 999", NATIVE_PARAMETER_MAX_LEVEL_CEILING === 999, NATIVE_PARAMETER_MAX_LEVEL_CEILING);
const ninjaBase = nativeJobParameterMaxLevels("Ninja", "A");
check("Ninja A base HP maxLevel is the Job.csv 45", ninjaBase?.[HP] === 45, JSON.stringify(ninjaBase));
const ninjaCaps = nativeParameterTrainingCaps("Ninja", "A", 20);
check("Ninja A awakening 20 cap is 45 + 30*20 = 645 on HP and MP", ninjaCaps?.[HP] === 645 && ninjaCaps?.[MP] === 645, JSON.stringify({ hp: ninjaCaps?.[HP], mp: ninjaCaps?.[MP] }));
const scholarCaps0 = nativeParameterTrainingCaps("Scholar", "D", 0);
const scholarCaps1 = nativeParameterTrainingCaps("Scholar", "D", 1);
check("0-awakening Scholar cap is the Job.csv base (HP 20)", scholarCaps0?.[HP] === 20, JSON.stringify(scholarCaps0));
check("per-parameter caps differ (Scholar HP 20 vs Vigor 25 vs 17 -> 99)", new Set(Object.values(scholarCaps0 ?? {})).size > 1, JSON.stringify(scholarCaps0));
check("one awakening step adds exactly 30 per parameter", scholarCaps1?.[HP] === 50 && scholarCaps1?.[12] === 55 && scholarCaps1?.[17] === 129, JSON.stringify(scholarCaps1));
const cappedCaps = nativeParameterTrainingCaps("Scholar", "D", 100);
check("the cap clamps at the native 999 ceiling", cappedCaps?.[HP] === 999 && cappedCaps?.[17] === 999, JSON.stringify(cappedCaps));

/* 2. The user's Ninja reference stays legal through the existing loadout owner --------- */

const ownerLoadouts = userWairoPresetLoadouts();
const ninjaOwner = ownerLoadouts.find((entry) => entry.jobName === "Ninja");
const scholarOwner = ownerLoadouts.find((entry) => entry.jobName === "Scholar");
check("the loadout owner carrries the Ninja awakening 20 per unit", ninjaOwner?.awakening === 20, JSON.stringify(ninjaOwner?.awakening));
check("the loadout owner carrries the Scholar awakening 0 per unit", scholarOwner?.awakening === 0, JSON.stringify(scholarOwner?.awakening));
check("the preset owner's Ninja really is the awakening-20 rank-A reference", USER_WAIRO_PRESET.loadouts["Ninja (A aw20)"]?.awakening === 20, JSON.stringify(USER_WAIRO_PRESET.loadouts["Ninja (A aw20)"]?.awakening));

const ninjaConversion = battleSetupFromLoadouts([ninjaOwner], shared, { encounterId: 19 });
check("Ninja aw20 HP 314 / MP 330 converts to a legal setup", ninjaConversion.setup !== null, JSON.stringify(codes(ninjaConversion.issues)));
check("the converted Ninja carries its own progression block", ninjaConversion.units[0]?.progression?.awakening === 20 && ninjaConversion.units[0]?.progression?.source === "PLAYER_LOADOUT", JSON.stringify(ninjaConversion.units[0]?.progression));
check("the Ninja's HP 314 is below its own 645 cap", (ninjaConversion.units[0]?.parameters[String(HP)]?.trainingLevel ?? 0) === 314 && (nativeParameterTrainingCaps("Ninja", "A", 20)?.[HP] ?? 0) === 645, JSON.stringify(ninjaConversion.units[0]?.parameters[String(HP)]));

/* 2b. The grouped 'Scholar Fodder 1-4' row expands to the real 6-unit reference team, and the
   converted Ninja matches the canonical scenario generator's UREF output: same raw parameters, same
   per-instance equipment affinity (Green Shield id 193 stays 0 for the weak shield access), the same
   skill priority order and the same native high trigger (invocation index 0). No parallel stat
   formula is used - both sides go through battleSetupFromLoadouts -> battleSetupToCombatScenario. */

const roster = userWairoPresetLoadouts();
const scholars = roster.filter((entry) => entry.jobName === "Scholar");
check("the preset expands to the real 6 units (Ninja + healer + 4 Scholar)", roster.length === 6, JSON.stringify(roster.map((entry) => entry.name)));
check("all six units keep unique ids and names, and the four Scholar clones are 0-awakening", scholars.length === 4 && new Set(roster.map((entry) => entry.id)).size === 6 && new Set(roster.map((entry) => entry.name)).size === 6 && scholars.every((entry) => entry.awakening === 0 && entry.jobName === "Scholar"), JSON.stringify(scholars.map((entry) => ({ id: entry.id, awakening: entry.awakening }))));
check("the preserved party order is Ninja, healer, then four Scholar", roster.map((entry) => entry.jobName).join(",") === "Ninja,Wizard,Scholar,Scholar,Scholar,Scholar", JSON.stringify(roster.map((entry) => entry.jobName)));

const presetTeam = battleSetupFromLoadouts(roster, shared, userWairoPresetConversionOptions());
const presetTeamErrors = presetTeam.issues.filter((issue) => issue.category === "ERROR");
check("the expanded 6-unit preset converts with zero ERRORs", presetTeam.setup !== null && presetTeamErrors.length === 0, JSON.stringify(presetTeamErrors.map((issue) => issue.code)));
check("the converted team is the real 6 units", presetTeam.units.length === 6, JSON.stringify(presetTeam.units.map((unit) => unit.name)));

const presetTeamScenario = presetTeam.setup ? battleSetupToCombatScenario(structuredClone(presetTeam.setup)).scenario : null;
const generatedUref = JSON.parse(readFileSync(
  path.join(WORKSPACE, "RE-evidence", "20260920-user-wairo-strategy", "scenarios", "UREF.scenario.json"),
  "utf8",
));
check("the expanded team is 6 scenario units like the generated UREF", presetTeamScenario?.ownUnits.length === 6 && generatedUref.ownUnits.length === 6, JSON.stringify({ preset: presetTeamScenario?.ownUnits.length ?? null, generated: generatedUref.ownUnits.length }));
const presetNinja = presetTeamScenario?.ownUnits[0] ?? null;
const generatedNinja = generatedUref.ownUnits[0];
check("the UI preset reproduces the generated UREF random seeds", presetTeamScenario?.mathSeed === generatedUref.mathSeed && presetTeamScenario?.libSeed === generatedUref.libSeed, JSON.stringify({ preset: [presetTeamScenario?.mathSeed, presetTeamScenario?.libSeed], generated: [generatedUref.mathSeed, generatedUref.libSeed] }));
check("the converted Ninja raw parameters equal the generated UREF Ninja", JSON.stringify(presetNinja?.parameters) === JSON.stringify(generatedNinja.parameters), JSON.stringify({ presetSpeed: presetNinja?.parameters?.["15"], generatedSpeed: generatedNinja.parameters["15"] }));
check("the converted Ninja equipment (id/level/affinity) and weapon id equal the generated UREF Ninja", JSON.stringify(presetNinja?.equipment) === JSON.stringify(generatedNinja.equipment) && presetNinja?.weaponId === generatedNinja.weaponId, JSON.stringify({ preset: presetNinja?.equipment, generated: generatedNinja.equipment }));
check("the Green Shield keeps native affinity 0 (weak access), the state behind effective Speed 200", Boolean(presetNinja?.equipment?.some((slot) => slot.id === 193 && slot.affinity === 0)), JSON.stringify(presetNinja?.equipment));
check("the converted Ninja skill priority order equals the generated UREF Ninja", JSON.stringify(presetNinja?.skills) === JSON.stringify(generatedNinja.skills), JSON.stringify({ preset: presetNinja?.skills, generated: generatedNinja.skills }));
check("the converted Ninja carries the native high trigger 0 on every slot like the generated UREF Ninja", JSON.stringify(presetNinja?.invocationLevels) === JSON.stringify(generatedNinja.invocationLevels) && Boolean(presetNinja?.invocationLevels?.every((level) => level === 0)), JSON.stringify(presetNinja?.invocationLevels));

/* 3. A 0-awakening Scholar is capped at its own base -------------------------------- */

const scholarAtBase = battleSetupFromLoadouts([{ ...scholarOwner, statLevels: { hp: 20 } }], shared, { encounterId: 19 });
check("Scholar aw0 at the Job.csv base (20) is legal", scholarAtBase.setup !== null && errorsOn(scholarAtBase.issues, "10").length === 0, JSON.stringify(codes(scholarAtBase.issues)));
const scholarAboveBase = battleSetupFromLoadouts([{ ...scholarOwner, statLevels: { hp: 21 } }], shared, { encounterId: 19 });
check("Scholar aw0 one level above the base is ERROR", scholarAboveBase.setup === null && codes(scholarAboveBase.issues).includes("TRAINING_LEVEL_ABOVE_DECLARED_CAP"), JSON.stringify(codes(scholarAboveBase.issues)));
check("Scholar aw0 training 300 (the stale assumed value) is now ERROR", battleSetupFromLoadouts([{ ...scholarOwner, statLevels: { hp: 300 } }], shared, { encounterId: 19 }).setup === null, "setup was admitted");

/* 4. A mixed team cannot move a cap across units ------------------------------------ */

const mixed = battleSetupFromLoadouts(
  [
    { ...ninjaOwner, statLevels: { ...ninjaOwner.statLevels, hp: 645 } },
    { ...scholarOwner, statLevels: { hp: 21 } },
  ],
  shared,
  { encounterId: 19 },
);
const mixedCapErrors = mixed.issues.filter((issue) => issue.code === "TRAINING_LEVEL_ABOVE_DECLARED_CAP");
check("mixed team: the Ninja at its own 645 cap is fine while the Scholar above base is ERROR", mixed.setup === null && mixedCapErrors.length === 1 && mixedCapErrors[0].path.startsWith("Scholar"), JSON.stringify(mixedCapErrors));
check("mixed team: the Ninja's 600 extra levels do not widen the Scholar", !mixed.issues.some((issue) => issue.path.includes("Ninja") && issue.code === "TRAINING_LEVEL_ABOVE_DECLARED_CAP"), JSON.stringify(mixedCapErrors.map((issue) => issue.path)));
check("mixed team: the Ninja itself is not blamed (no error on its HP 645)", mixed.issues.every((issue) => issue.path !== "Ninja.parameters.10.trainingLevel"), JSON.stringify(mixed.issues.filter((issue) => issue.path.startsWith("Ninja"))));

/* 5. Per-parameter caps are enforced per parameter ---------------------------------- */

const perParameter = validateBattleSetup(
  unitSetup((() => {
    const unit = scholarUnit(0, 21);
    unit.parameters[String(12)] = { rawValue: 100, rawMax: 100, extraValue: 0, extraMax: 0, trainingLevel: 25 };
    return unit;
  })()),
);
const perParameterErrors = errorsOn(perParameter, "parameters");
check("only the over-cap parameter errors (HP 21 over 20, Vigor 25 at its own 25 cap)", perParameterErrors.length === 1 && perParameterErrors[0].path === "Scholar.parameters.10.trainingLevel", JSON.stringify(perParameterErrors));
check("the declared cap message names the per-unit step count", perParameterErrors[0]?.message.includes("0 step(s)"), perParameterErrors[0]?.message);

/* 6. Raw debug units: explicit UNKNOWN, and no global allowance can widen it --------- */

const rawUnit = scholarUnit(null, 25);
const rawIssues = validateBattleSetup(unitSetup(rawUnit));
check("an undeclared raw unit reports TRAINING_LEVEL_ABOVE_NATIVE_MAX_UNDECLARED", codes(rawIssues).includes("TRAINING_LEVEL_ABOVE_NATIVE_MAX_UNDECLARED") && !codes(rawIssues).includes("TRAINING_LEVEL_ABOVE_DECLARED_CAP"), JSON.stringify(codes(rawIssues)));
const legacyOptionIssues = validateBattleSetup(unitSetup(scholarUnit(null, 25)), { awakeningAllowance: 600 });
check("a legacy party-wide awakeningAllowance option cannot widen any unit", codes(legacyOptionIssues).includes("TRAINING_LEVEL_ABOVE_NATIVE_MAX_UNDECLARED") && !codes(legacyOptionIssues).includes("TRAINING_LEVEL_ABOVE_DECLARED_CAP"), JSON.stringify(codes(legacyOptionIssues)));
const malformed = scholarUnit(0, 20);
malformed.progression = { awakening: -1, source: "PLAYER_LOADOUT" };
check("a malformed progression block fails closed", codes(validateBattleSetup(unitSetup(malformed))).includes("PROGRESSION_MALFORMED"), JSON.stringify(codes(validateBattleSetup(unitSetup(malformed)))));

/* 7. Import preserves the declared per-unit progression ----------------------------- */

const ninjaRoundTrip = importBattleSetup(serializeBattleSetup(ninjaConversion.setup));
check("import preserves the Ninja progression block", ninjaRoundTrip.setup?.playerTeam[0]?.progression?.awakening === 20, JSON.stringify(ninjaRoundTrip.setup?.playerTeam[0]?.progression));
const overSetup = unitSetup(scholarUnit(0, 21));
const overRoundTrip = importBattleSetup(serializeBattleSetup(overSetup));
check("import keeps the over-cap Scholar failing closed", codes(overRoundTrip.issues).includes("TRAINING_LEVEL_ABOVE_DECLARED_CAP"), JSON.stringify(codes(overRoundTrip.issues)));
const legacyJson = JSON.parse(serializeBattleSetup(unitSetup(scholarUnit(null, 25))));
check("import does not invent a progression block when none was declared", importBattleSetup(JSON.stringify(legacyJson)).setup?.playerTeam[0]?.progression === undefined, JSON.stringify(importBattleSetup(JSON.stringify(legacyJson)).setup?.playerTeam[0]?.progression));

/* 8. Jobs outside the canonical Job.csv producer stay explicit, never silent ---------- */

const healerOwner = ownerLoadouts.find((entry) => entry.jobName === "Wizard");
check("the preset healer is the assumed representative Wizard rank S", healerOwner?.rank === "S" && healerOwner?.awakening === 20, JSON.stringify({ rank: healerOwner?.rank, awakening: healerOwner?.awakening }));
const healerConversion = battleSetupFromLoadouts([healerOwner], shared, { encounterId: 19 });
check("the assumed Wizard S healer resolves to a canonical Job.csv cap", healerConversion.setup !== null && !codes(healerConversion.issues).includes("PROGRESSION_CAP_UNVERIFIED"), JSON.stringify(codes(healerConversion.issues)));

/* Doctor is a shared-owner job absent from native-job-identity.json (no canonical maxLevel row), so
   its declared steps must stay explicit instead of silently passing on the int32 range alone. */
const unprofiledOwner = { id: "preset:Doctor", name: "Doctor", jobName: "Doctor", rank: "S", awakening: 0, statLevels: { hp: 1 }, equipment: [], skills: [] };
const unprofiledConversion = battleSetupFromLoadouts([unprofiledOwner], shared, { encounterId: 19 });
check("a job with no canonical maxLevel profile reports PROGRESSION_CAP_UNVERIFIED", codes(unprofiledConversion.issues).includes("PROGRESSION_CAP_UNVERIFIED"), JSON.stringify(codes(unprofiledConversion.issues)));
check("the unverified-cap unit is still carried with its declared steps", unprofiledConversion.units.length === 1 && unprofiledConversion.units[0]?.progression?.awakening === 0, JSON.stringify(unprofiledConversion.units[0]?.progression));

const failed = checks.filter((entry) => !entry.passed);
for (const entry of failed) console.log(`FAIL ${entry.name}: ${entry.detail}`);
console.log(`${checks.length - failed.length}/${checks.length} progression-fidelity checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
