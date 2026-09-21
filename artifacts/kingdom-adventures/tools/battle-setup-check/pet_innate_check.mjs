/**
 * Focused check for the pet innate-skill boundary.
 *
 * Proves, with the real site modules and no browser/network:
 *   * the generated species -> innate map is the copied canonical Monster-table value, cross-checked
 *     against the 27 monsters the canonical combat evidence (`encounters.json`) already pins;
 *   * one canonical monster (Brawlbunn 105 -> skill 26 "Counter") exports its innate FIRST with the
 *     native default invocation level 1;
 *   * one declared extra skill survives after it, in order, with its declared invocation level, and
 *     reaches the adapter's `housePets` verbatim;
 *   * a species whose canonical row declares no innate (-1) gains nothing;
 *   * a declared duplicate of the innate is not emitted twice.
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-setup-check/pet_innate_check.mjs
 *
 * No network, no browser, no evidence writes. Exits 1 on any failed check.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const EVIDENCE = path.join(WORKSPACE, "RE-evidence", "20260912-combat", "encounters.json");
const SHARED_JSON = path.join(WORKSPACE, "KA-Website", "artifacts", "api-server", "data", "ka_shared.json");

const { battleSetupFromLoadouts, battleSkillIdForName, renderSkillName } = await import("@/lib/battle-legality");
const { battleSetupToCombatScenario } = await import("@/lib/battle-setup-adapter");
const { MONSTER_INNATE_SKILL_BY_ID, MONSTER_INNATE_SOURCE, SKILL_BY_ID } = await import("@/lib/battle-setup");

const shared = JSON.parse(readFileSync(SHARED_JSON, "utf8"));
const checks = [];
const check = (name, passed, detail) =>
  checks.push({ name, passed: Boolean(passed), detail: passed ? "ok" : String(detail) });

/* 1. the generated map is the canonical table value ------------------------------------ */

const evidence = JSON.parse(readFileSync(EVIDENCE, "utf8"));
const mismatches = evidence.monsters
  .map((entry) => ({ id: entry.id, evidence: entry.skillId, generated: MONSTER_INNATE_SKILL_BY_ID.get(entry.id) ?? null }))
  .filter((entry) => entry.evidence !== entry.generated);
check(
  "every monster the canonical combat evidence pins matches the generated innate map",
  mismatches.length === 0,
  JSON.stringify(mismatches),
);
check(
  "the generated map is sourced from the original Monster table",
  MONSTER_INNATE_SOURCE.table === "Monster" && /Monster\.txt$/.test(MONSTER_INNATE_SOURCE.route),
  JSON.stringify(MONSTER_INNATE_SOURCE),
);

/* 2. one canonical monster: innate first, one declared extra surviving ------------------ */

const speciesId = 105; /* Brawlbunn */
const innateId = 26; /* canonical Monster row skillId for 105 */
check(
  "species 105's canonical innate is skill 26",
  MONSTER_INNATE_SKILL_BY_ID.get(speciesId) === innateId,
  MONSTER_INNATE_SKILL_BY_ID.get(speciesId),
);
const innateName = renderSkillName(SKILL_BY_ID.get(innateId));
const extraName = "7-Hit Attack";
const extraId = battleSkillIdForName(extraName);
check("the innate renders as a catalogued skill name", typeof innateName === "string" && innateName.length > 0, innateName);
check("the extra skill resolves to a catalogued id", typeof extraId === "number", extraId);

const loadout = {
  id: "pet-innate",
  name: "Pet Owner",
  jobName: "Rancher",
  rank: "D",
  equipment: [],
  skills: [],
  householdPets: [{ monsterId: speciesId, name: "Rex", level: 5, skills: [extraName], skillInvocations: [2] }],
};
const conversion = battleSetupFromLoadouts([loadout], shared, { encounterId: 19 });
check(
  "the pet conversion has no ERROR issues",
  conversion.issues.filter((issue) => issue.category === "ERROR").length === 0,
  JSON.stringify(conversion.issues.filter((issue) => issue.category === "ERROR")),
);
const petUnit = conversion.setup?.households?.["Pet Owner"]?.[0];
check(
  "the exported pet skills are [canonical innate, declared extra] in that order",
  JSON.stringify(petUnit?.skills.map((entry) => entry.skillId)),
  JSON.stringify([innateId, extraId]),
);
check(
  "the innate takes the native default invocation level 1 and the extra keeps its declared 2",
  JSON.stringify(petUnit?.skills.map((entry) => entry.invocationLevel)),
  JSON.stringify([1, 2]),
);

const scenario = conversion.setup ? battleSetupToCombatScenario(structuredClone(conversion.setup)).scenario : null;
const petScenarioUnit = scenario?.housePets?.["Pet Owner"]?.[0];
check(
  "the adapter sends the same ordered pet skills through housePets",
  JSON.stringify([petScenarioUnit?.skills, petScenarioUnit?.invocationLevels]),
  JSON.stringify([[innateId, extraId], [1, 2]]),
);

/* 3. a species with no declared innate gains nothing ------------------------------------ */

const noInnate = battleSetupFromLoadouts(
  [{ ...loadout, id: "no-innate", name: "No Innate", householdPets: [{ monsterId: 124, name: "Chick", level: 3, skills: [extraName], skillInvocations: [0] }] }],
  shared,
  { encounterId: 19 },
);
check("species 124 declares no innate in the canonical row", MONSTER_INNATE_SKILL_BY_ID.get(124) === null, MONSTER_INNATE_SKILL_BY_ID.get(124));
check(
  "a species without an innate exports only the declared skill",
  JSON.stringify(noInnate.setup?.households?.["No Innate"]?.[0]?.skills.map((entry) => entry.skillId)),
  JSON.stringify([extraId]),
);

/* 4. a declared duplicate of the innate is not emitted twice ---------------------------- */

const duplicated = battleSetupFromLoadouts(
  [
    {
      ...loadout,
      id: "duplicate-innate",
      name: "Duplicated",
      householdPets: [{ monsterId: speciesId, name: "Rex", level: 5, skills: [innateName, extraName], skillInvocations: [2, 0] }],
    },
  ],
  shared,
  { encounterId: 19 },
);
check(
  "a declared copy of the innate does not duplicate the first slot",
  JSON.stringify(duplicated.setup?.households?.["Duplicated"]?.[0]?.skills.map((entry) => entry.skillId)),
  JSON.stringify([innateId, extraId]),
);

const failed = checks.filter((entry) => !entry.passed);
for (const entry of failed) console.log(`FAIL ${entry.name}: ${entry.detail}`);
console.log(`${checks.length - failed.length}/${checks.length} pet innate checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
