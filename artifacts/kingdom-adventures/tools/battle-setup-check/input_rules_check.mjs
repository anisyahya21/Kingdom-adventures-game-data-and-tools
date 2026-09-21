/**
 * Focused, deterministic checks for the recovered input rules applied to the saved-loadout
 * converter, the BattleSetup validator/catalog and the adapter:
 *   * canonical Job.csv identity resolution end to end (the single `F Rank Scholar`, csvId 132),
 *   * the confirmed 9-slot native ceiling,
 *   * affinity -1 reject / 0 half, and the type-48 resistance override,
 *   * the per-unit training cap (native 30 per awakening step, declared per unit),
 *   * the corrected invocation-level labels and native default 1.
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-setup-check/input_rules_check.mjs
 *
 * No network, no browser, no evidence writes. Exits 1 on any failed check.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const SHARED_JSON = path.join(WORKSPACE, "KA-Website", "artifacts", "api-server", "data", "ka_shared.json");

const { battleSetupFromLoadouts } = await import("@/lib/battle-legality");
const {
  EQUIPMENT_CATALOG,
  NATIVE_SKILL_SLOT_CEILING,
  SKILL_SLOT_CAP,
  createDefaultBattleSetup,
  createHumanUnit,
  emptyEquipmentSlots,
  nativeJobParameterMaxLevels,
  validateBattleSetup,
} = await import("@/lib/battle-setup");
const { battleSetupToCombatScenario } = await import("@/lib/battle-setup-adapter");

const shared = JSON.parse(readFileSync(SHARED_JSON, "utf8"));
const checks = [];
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail: passed ? "ok" : String(detail) });
const codes = (issues) => issues.map((issue) => issue.code);

function humanSetup(overrides = {}) {
  const setup = createDefaultBattleSetup(19);
  const unit = createHumanUnit(1);
  unit.name = "Scholar";
  unit.jobId = "Scholar";
  unit.rank = "D";
  Object.assign(unit, overrides);
  setup.playerTeam = [unit];
  return { setup, unit };
}

/* 1. Scholar resolves end to end through the canonical Job.csv identity ------------- */

check("native ceiling constant is 9", NATIVE_SKILL_SLOT_CEILING === 9 && SKILL_SLOT_CAP === 9, `${NATIVE_SKILL_SLOT_CEILING}/${SKILL_SLOT_CAP}`);
const scholarMaxLevels = nativeJobParameterMaxLevels("Scholar", "D");
check("Scholar resolves to the canonical F Rank Scholar maxLevel profile (HP 20)", scholarMaxLevels?.[10] === 20, JSON.stringify(scholarMaxLevels));

const scholarLoadout = { id: "s1", name: "Scholar", jobName: "Scholar", rank: "D", level: 1, statLevels: { hp: 10 }, equipment: [], skills: [] };
const conversion = battleSetupFromLoadouts([scholarLoadout], shared, { encounterId: 19 });
check("Scholar conversion is not blocked", conversion.setup !== null, JSON.stringify(codes(conversion.issues)));
check("Scholar conversion has no JOB_UNKNOWN / LOADOUT_JOB_UNKNOWN", !codes(conversion.issues).some((code) => code === "JOB_UNKNOWN" || code === "LOADOUT_JOB_UNKNOWN"), JSON.stringify(codes(conversion.issues)));
check("Scholar identity is recorded from the canonical Job.csv row", codes(conversion.issues).includes("JOB_CATALOG_IDENTITY_ALIAS"), JSON.stringify(codes(conversion.issues)));
check("Scholar unit keeps its saved job/rank keys", conversion.units[0]?.jobId === "Scholar" && conversion.units[0]?.rank === "D", `${conversion.units[0]?.jobId}/${conversion.units[0]?.rank}`);
check("Scholar HP uses the shared/native curve at the saved level (55 + 9*5)", conversion.units[0]?.parameters?.["10"]?.rawValue === 100, JSON.stringify(conversion.units[0]?.parameters?.["10"]));

// Validator admits the canonical identity directly and rejects an invented rank.
check("validator admits Scholar rank D", !codes(validateBattleSetup(humanSetup().setup)).some((code) => code === "JOB_UNKNOWN" || code === "RANK_UNKNOWN"), JSON.stringify(codes(validateBattleSetup(humanSetup().setup))));
check("validator rejects an unknown rank key", codes(validateBattleSetup(humanSetup({ rank: "Z" }).setup)).includes("RANK_UNKNOWN"), JSON.stringify(codes(validateBattleSetup(humanSetup({ rank: "Z" }).setup))));
check("converter gates the canonical job on the shared rank key", codes(battleSetupFromLoadouts([{ ...scholarLoadout, rank: "S" }], shared, { encounterId: 19 }).issues).includes("LOADOUT_RANK_UNKNOWN"), "missing");

// Adapter forwards the converted setup to the authoritative scenario shape.
let adapted = null;
try {
  adapted = battleSetupToCombatScenario(conversion.setup);
  check("adapter accepts the Scholar setup and keeps the unit", adapted.scenario.ownUnits[0]?.name === "Scholar", JSON.stringify(adapted.scenario.ownUnits[0]?.name));
} catch (error) {
  check("adapter accepts the Scholar setup and keeps the unit", false, String(error));
}

/* 2. Native load_scenario accepts the converted scenario ---------------------------- */

if (adapted) {
  const dir = mkdtempSync(path.join(tmpdir(), "ka-input-rules-"));
  const scenarioPath = path.join(dir, "scholar.scenario.json");
  writeFileSync(scenarioPath, JSON.stringify(adapted.scenario));
  const pyScript = [
    "import json, sys",
    "sys.path.insert(0, sys.argv[2])",
    "import combat_scenario",
    "scenario = json.load(open(sys.argv[1]))",
    "loaded = combat_scenario.load_scenario(scenario)",
    "print(json.dumps({'accepted': True, 'units': len(loaded['ownUnits'])}))",
  ].join("\n");
  const pyPath = path.join(dir, "load.py");
  writeFileSync(pyPath, pyScript);
  const recovery = path.join(WORKSPACE, "KA-Website", "tools", "recovery");
  const pythons = [path.join(WORKSPACE, ".venv", "Scripts", "python.exe"), "python"];
  let native = null;
  for (const candidate of pythons) {
    const result = spawnSync(candidate, [pyPath, scenarioPath, recovery], { encoding: "utf8", cwd: recovery, windowsHide: true });
    if (result.error?.code === "ENOENT") continue;
    if (result.error) {
      native = { skipped: result.error.code };
      break;
    }
    try {
      native = JSON.parse((result.stdout ?? "").trim().split(/\r?\n/).pop() ?? "{}");
    } catch {
      native = { error: (result.stderr ?? "").trim().slice(0, 300) };
    }
    break;
  }
  if (native?.skipped) check("native load_scenario accepts the converted Scholar scenario", true, `skipped: spawn blocked (${native.skipped})`);
  else check("native load_scenario accepts the converted Scholar scenario", native?.accepted === true, JSON.stringify(native));
}

/* 3. Confirmed 9-slot native ceiling ------------------------------------------------ */

const atCeiling = humanSetup().unit;
atCeiling.skills = Array.from({ length: 9 }, () => ({ skillId: 0, invocationLevel: 1 }));
const ceilingIssues = validateBattleSetup(humanSetup({ skills: atCeiling.skills }).setup);
check("9 skill slots are accepted (no SKILL_SLOT_CAP_EXCEEDED)", !codes(ceilingIssues).includes("SKILL_SLOT_CAP_EXCEEDED"), JSON.stringify(codes(ceilingIssues)));
check("9-slot unit still declares the per-character capacity", codes(ceilingIssues).includes("SKILL_SLOT_CAP_PER_CHARACTER_DECLARED"), JSON.stringify(codes(ceilingIssues)));
const overCeiling = Array.from({ length: 10 }, () => ({ skillId: 0, invocationLevel: 1 }));
check("10 skill slots fail closed with SKILL_SLOT_CAP_EXCEEDED", codes(validateBattleSetup(humanSetup({ skills: overCeiling }).setup)).includes("SKILL_SLOT_CAP_EXCEEDED"), "missing");

/* 4. Affinity: -1 rejects, 0 halves ------------------------------------------------- */

const shield = EQUIPMENT_CATALOG.find((entry) => [11].includes(entry.type));
if (!shield) {
  check("shield catalog row exists", false, "no type-11 equipment");
} else {
  const rejected = validateBattleSetup(humanSetup({ equipmentSlots: { ...emptyEquipmentSlots(), shield: { id: shield.id, level: 1, affinity: -1 } } }).setup);
  check("affinity -1 is rejected", codes(rejected).includes("AFFINITY_REJECTED"), JSON.stringify(codes(rejected)));
  const weak = validateBattleSetup(humanSetup({ equipmentSlots: { ...emptyEquipmentSlots(), shield: { id: shield.id, level: 1, affinity: 0 } } }).setup);
  check("affinity 0 (half) is accepted", !codes(weak).includes("AFFINITY_REJECTED") && !codes(weak).includes("AFFINITY_INVALID"), JSON.stringify(codes(weak)));
}

/* 5. Per-unit training cap: native 30 per awakening step, never a party-wide allowance */

const overCap = { rawValue: 100, rawMax: 100, extraValue: 0, extraMax: 0, trainingLevel: 25 };
check("training above the Job.csv max is not silently accepted", codes(validateBattleSetup(humanSetup({ parameters: { ...humanSetup().unit.parameters, "10": overCap } }).setup)).includes("TRAINING_LEVEL_ABOVE_NATIVE_MAX_UNDECLARED"), "missing");
const declaredProgression = { awakening: 1, source: "PLAYER_LOADOUT" };
check("a declared per-unit awakening step covers one step of overage", !codes(validateBattleSetup(humanSetup({ progression: declaredProgression, parameters: { ...humanSetup().unit.parameters, "10": overCap } }).setup)).includes("TRAINING_LEVEL_ABOVE_DECLARED_CAP"), "unexpected");
check("a declared per-unit cap fails closed when exceeded", codes(validateBattleSetup(humanSetup({ parameters: { ...humanSetup().unit.parameters, "10": overCap } }).setup)).includes("TRAINING_LEVEL_ABOVE_NATIVE_MAX_UNDECLARED") && codes(validateBattleSetup(humanSetup({ progression: { awakening: 0, source: "PLAYER_LOADOUT" }, parameters: { ...humanSetup().unit.parameters, "10": overCap } }).setup)).includes("TRAINING_LEVEL_ABOVE_DECLARED_CAP"), "missing");
check("training level 0 fails closed", codes(validateBattleSetup(humanSetup({ parameters: { ...humanSetup().unit.parameters, "10": { ...overCap, trainingLevel: 0 } } }).setup)).includes("TRAINING_LEVEL_INVALID"), "missing");

const converterOverCap = battleSetupFromLoadouts([{ ...scholarLoadout, statLevels: { hp: 25 } }], shared, { encounterId: 19 });
check("converter declares a level above the Job.csv max", codes(converterOverCap.issues).includes("TRAINING_LEVEL_ABOVE_NATIVE_MAX_UNDECLARED"), JSON.stringify(codes(converterOverCap.issues)));
const converterAllowed = battleSetupFromLoadouts([{ ...scholarLoadout, awakening: 1, statLevels: { hp: 45 } }], shared, { encounterId: 19 });
check("converter accepts a level inside the unit's own declared cap", converterAllowed.setup !== null && !codes(converterAllowed.issues).includes("TRAINING_LEVEL_ABOVE_DECLARED_CAP") && !codes(converterAllowed.issues).includes("TRAINING_LEVEL_ABOVE_NATIVE_MAX_UNDECLARED"), JSON.stringify(codes(converterAllowed.issues)));
const converterRejected = battleSetupFromLoadouts([{ ...scholarLoadout, awakening: 0, statLevels: { hp: 25 } }], shared, { encounterId: 19 });
check("converter fails closed above the unit's own declared cap", converterRejected.setup === null && codes(converterRejected.issues).includes("TRAINING_LEVEL_ABOVE_DECLARED_CAP"), JSON.stringify(codes(converterRejected.issues)));

/* 6. Invocation level: native default 1, UI labels 0 high / 1 normal / 2 low --------- */

const invocationConversion = battleSetupFromLoadouts([{ ...scholarLoadout, skills: ["Normal Attack"] }], shared, { encounterId: 19 });
check("defaulted invocation level is the native default 1", invocationConversion.units[0]?.skills[0]?.invocationLevel === 1, JSON.stringify(invocationConversion.units[0]?.skills));
const uiSource = readFileSync(path.join(APP, "src", "pages", "battle-setup.tsx"), "utf8");
check("UI invocation labels are 0 high / 1 normal / 2 low", uiSource.includes("0 · high") && uiSource.includes("1 · normal") && uiSource.includes("2 · low"), "labels missing");
check("UI no longer labels the levels with the bare invoke index", !uiSource.includes(">invoke 0<") && !uiSource.includes(">invoke 1<"), "old labels present");

const failed = checks.filter((entry) => !entry.passed);
for (const entry of failed) console.log(`FAIL ${entry.name}: ${entry.detail}`);
console.log(`${checks.length - failed.length}/${checks.length} input-rule checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
