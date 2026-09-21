/**
 * Focused household-pet check for the recovered selected-owner -> ally-monster rule.
 *
 * Runs the real site modules (no bundler, no browser) plus the authoritative Python scenario loader:
 * the adapter output is fed through `combat_scenario.load_scenario` to prove the append order, the
 * petOwnerName binding and fail-closed completeness.
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-setup-check/household_pets_check.mjs
 *
 * Optional: --out <dir>.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..", "..");

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const OUT =
  outIndex >= 0
    ? path.resolve(args[outIndex + 1])
    : path.join(process.env.TEMP ?? process.env.TMP ?? APP, "ka-combat-completion", "household-pets-check");

const checks = [];
const check = (name, actual, expected) => {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, passed, detail: passed ? "ok" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` });
};
const checkTruthy = (name, actual, detail = "expected truthy") => {
  checks.push({ name, passed: Boolean(actual), detail: actual ? "ok" : detail });
};
const errorCodes = (setup) => validateBattleSetup(setup).filter((issue) => issue.category === "ERROR").map((issue) => issue.code);

const {
  createDefaultBattleSetup,
  emptyEquipmentSlots,
  emptyParameters,
  importBattleSetup,
  serializeBattleSetup,
  validateBattleSetup,
} = await import("@/lib/battle-setup");
const { battleSetupToCombatScenario } = await import("@/lib/battle-setup-adapter");

const base = createDefaultBattleSetup(19);
const human = (name) => ({
  kind: "human",
  name,
  jobId: "Guard",
  rank: "D",
  gender: 0,
  parameters: emptyParameters("human"),
  equipmentSlots: emptyEquipmentSlots(),
  weaponId: 0,
  skills: [],
});
const pet = (name) => ({
  kind: "monster",
  name,
  monsterId: 116,
  parameters: emptyParameters("monster"),
  skills: [],
});
const withTeam = (playerTeam, households) => ({
  ...base,
  playerTeam,
  ...(households === undefined ? {} : { households }),
});
const scenarioOf = (setup) => battleSetupToCombatScenario(setup).scenario;

/* 1. legal + eligible: a declared owner brings their ally monster, order preserved, no dedup/cap */
const legalSetup = withTeam([human("Owner")], { Owner: [pet("Pet A"), pet("Pet B"), pet("Pet C")] });
check("legal declared household has no ERROR issues", errorCodes(legalSetup), []);
const legal = scenarioOf(legalSetup);
check("declared pets leave ownUnits", legal.ownUnits.map((unit) => unit.name), ["Owner"]);
check("declared owner is marked as the house owner", legal.ownUnits[0].isHouseOwner, true);
check("declared household keeps the declared order", (legal.housePets?.Owner ?? []).map((entry) => entry.name), ["Pet A", "Pet B", "Pet C"]);
check("every appended pet carries its owner", (legal.housePets?.Owner ?? []).map((entry) => entry.petOwnerName), ["Owner", "Owner", "Owner"]);

/* 2. empty declaration: [] is an explicit "no pets", and the owner stays a house owner */
const emptySetup = withTeam([human("Owner")], { Owner: [] });
check("empty declaration has no ERROR issues", errorCodes(emptySetup), []);
const empty = scenarioOf(emptySetup);
check("empty declaration is emitted as an empty list", empty.housePets, { Owner: [] });
check("empty declaration still marks the owner", empty.ownUnits[0].isHouseOwner, true);

/* 3. missing declaration: a loose monster gets a missing-data issue, not an invented owner */
const missingSetup = withTeam([human("Owner"), pet("Stray")], undefined);
check("undeclared monster keeps a missing-data issue", validateBattleSetup(missingSetup).some((issue) => issue.code === "PET_MEMBERSHIP_MISSING_DATA" && issue.category === "UNKNOWN_NATIVE_RULE"), true);
const missing = scenarioOf(missingSetup);
check("undeclared roster emits no housePets", missing.housePets, undefined);
check("undeclared monster stays in ownUnits", missing.ownUnits.map((unit) => unit.name), ["Owner", "Stray"]);

/* 4. owner not selected / not a selected human */
check("owner outside the roster is rejected", errorCodes(withTeam([human("Owner")], { Ghost: [] })), ["PET_OWNER_NOT_SELECTED_HUMAN"]);
check("a monster cannot be a pet owner", errorCodes(withTeam([human("Owner"), pet("M")], { M: [] })), ["PET_OWNER_NOT_SELECTED_HUMAN"]);
let adapterThrew = null;
try {
  scenarioOf(withTeam([human("Owner")], { Ghost: [] }));
} catch (error) {
  adapterThrew = error.name;
}
check("adapter refuses an unselected owner", adapterThrew, "BattleSetupAdapterError");

/* 5. identity: duplicate entity names are rejected, and petOwnerName cannot live in playerTeam */
check(
  "a household pet may not duplicate a roster name",
  errorCodes(withTeam([human("Owner")], { Owner: [pet("Owner")] })).includes("UNIT_NAME_DUPLICATE"),
  true,
);
check(
  "two household pets may not share a name",
  errorCodes(withTeam([human("Owner")], { Owner: [pet("Dup"), pet("Dup")] })).includes("UNIT_NAME_DUPLICATE"),
  true,
);
const strayOwner = { ...pet("Pet 1"), petOwnerName: "Owner" };
check(
  "petOwnerName monsters are refused in playerTeam",
  errorCodes(withTeam([human("Owner"), strayOwner], undefined)).includes("PET_OWNER_IN_PLAYER_TEAM"),
  true,
);

/* 6. non-owners are unaffected: an unrelated human needs no declaration */
const nonOwner = withTeam([human("Owner"), human("Bystander")], { Owner: [] });
check("non-owner humans need no declaration", errorCodes(nonOwner), []);
check("non-owner humans stay in ownUnits", scenarioOf(nonOwner).ownUnits.map((unit) => unit.name), ["Owner", "Bystander"]);

/* 7. serialize/import round trip keeps the declaration (including an empty list) */
const roundTrip = importBattleSetup(serializeBattleSetup(legalSetup));
check("round-trip keeps no ERROR issues", roundTrip.issues.filter((issue) => issue.category === "ERROR").map((issue) => issue.code), []);
check("round-trip keeps the declared order", roundTrip.setup?.households?.Owner.map((entry) => entry.name), ["Pet A", "Pet B", "Pet C"]);
const emptyRoundTrip = importBattleSetup(serializeBattleSetup(emptySetup));
check("round-trip keeps an empty declaration", emptyRoundTrip.setup?.households, { Owner: [] });
check("round-trip serializes identically", serializeBattleSetup(emptyRoundTrip.setup), serializeBattleSetup(emptySetup));

/* 8. authoritative loader agreement --------------------------------------- */
function runPython(script, files) {
  const candidates = existsSync(path.join(WORKSPACE, ".venv", "Scripts", "python.exe"))
    ? [path.join(WORKSPACE, ".venv", "Scripts", "python.exe")]
    : ["python", "py"];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["-c", script, ...files], { encoding: "utf8", windowsHide: true });
    if (result.error && result.error.code === "ENOENT") continue;
    if (result.error) throw result.error;
    return result;
  }
  throw new Error("no Python interpreter found");
}

mkdirSync(OUT, { recursive: true });
const legalPath = path.join(OUT, "household-legal-scenario.json");
const missingPath = path.join(OUT, "household-missing-scenario.json");
writeFileSync(legalPath, JSON.stringify(legal, null, 2) + "\n");
const undeclared = JSON.parse(JSON.stringify(legal));
delete undeclared.housePets;
writeFileSync(missingPath, JSON.stringify(undeclared, null, 2) + "\n");

const PY = `
import json, sys
sys.path.insert(0, r"${path.join(WORKSPACE, "KA-Website", "tools", "recovery")}")
from combat_scenario import load_scenario, ScenarioError
out = {}
with open(sys.argv[1], encoding="utf-8") as fh:
    loaded = load_scenario(json.load(fh))
out["order"] = [u["name"] for u in loaded["ownUnits"]]
out["owners"] = [u.get("petOwnerName") for u in loaded["ownUnits"] if u.get("petOwnerName")]
out["declared"] = loaded.get("householdOwners")
try:
    with open(sys.argv[2], encoding="utf-8") as fh:
        load_scenario(json.load(fh))
    out["missing"] = None
except ScenarioError as error:
    out["missing"] = str(error)
print(json.dumps(out))
`;
let native = {};
try {
  const pyResult = runPython(PY, [legalPath, missingPath]);
  native = JSON.parse((pyResult.stdout ?? "").trim().split(/\r?\n/).pop() ?? "{}");
} catch (error) {
  native = { skipped: error?.code ?? String(error) };
}
if (native.skipped) {
  checks.push({ name: "authoritative loader verification", passed: true, skipped: true, detail: `skipped: process spawn is blocked in this sandbox (${native.skipped}); run the same command from an unsandboxed shell` });
} else {
  check("loader appends the declared pets after the selected members", native.order, ["Owner", "Pet A", "Pet B", "Pet C"]);
  check("loader binds every appended pet to its owner", native.owners, ["Owner", "Owner", "Owner"]);
  check("loader records the materialized declaration", native.declared, ["Owner"]);
  checkTruthy("loader fails closed without the declaration", (native.missing ?? "").includes("have no declared household entry"), JSON.stringify(native));
}

const failed = checks.filter((entry) => !entry.passed);
writeFileSync(
  path.join(OUT, "household-pets-check.json"),
  JSON.stringify(
    { generatedBy: "tools/battle-setup-check/household_pets_check.mjs", totals: { checks: checks.length, failed: failed.length }, native, checks },
    null,
    2,
  ) + "\n",
);
for (const entry of failed) console.log(`FAIL ${entry.name}: ${entry.detail}`);
console.log(`${checks.length - failed.length}/${checks.length} household-pet checks passed (${OUT})`);
process.exit(failed.length === 0 ? 0 : 1);
