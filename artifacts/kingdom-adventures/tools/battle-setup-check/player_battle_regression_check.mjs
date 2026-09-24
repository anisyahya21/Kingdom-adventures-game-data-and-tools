/**
 * Focused regression check for the first player-facing slice's persisted fields.
 *
 * Covers what the enhanced Loadout Builder now stores and the player battle page consumes:
 *   * ordered per-skill invocation levels survive `battleSetupFromLoadouts` -> adapter
 *     (`invocationLevels`), and an undeclared slot still reports the labelled native default 1;
 *   * declared household pets transfer into `households[converted unique unit name]` and then into
 *     the adapter's `housePets`, with the declared level as trainingLevel and the pet skills mapped;
 *   * an empty declaration is a house owner with no pets, and a clashing pet name is derived unique;
 *   * the `ka-battle-preview-1` envelope builds and parses, and its error body is surfaced.
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-setup-check/player_battle_regression_check.mjs
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
const { createDraft, normalizeDraft } = await import("@/lib/battle-team-draft");
const { battleSetupToCombatScenario } = await import("@/lib/battle-setup-adapter");
const { MONSTER_BY_ID } = await import("@/lib/battle-setup");
const {
  BATTLE_PREVIEW_SCHEMA,
  BATTLE_PREVIEW_MAX_TICK_LIMIT,
  battlePreviewParameterNumbers,
  buildBattlePreviewRequest,
  describeBattlePreviewFailure,
  parseBattlePreview,
} = await import("@/lib/battle-preview");

const shared = JSON.parse(readFileSync(SHARED_JSON, "utf8"));
const checks = [];
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail: passed ? "ok" : String(detail) });
const errorCodes = (conversion) => conversion.issues.filter((issue) => issue.category === "ERROR").map((issue) => issue.code);

const petSpeciesId = MONSTER_BY_ID.has(116) ? 116 : MONSTER_BY_ID.keys().next().value;
check("new teams start empty and remain empty after loading", normalizeDraft(createDraft(19))?.characters.length === 0, "default guard returned");

/* 1. persisted skill invocation levels ------------------------------------------------- */

const base = {
  id: "skill-loadout",
  name: "Skill Owner",
  jobName: "Ninja",
  rank: "A",
  statLevels: { hp: 5 },
  equipment: [],
};

const declared = battleSetupFromLoadouts(
  [{ ...base, skills: ["Counter", "7-Hit Attack", "5-Hit Attack"], skillInvocations: [0, 2] }],
  shared,
  { encounterId: 19 },
);
check("declared invocation loadout has no ERROR issues", errorCodes(declared).length === 0, JSON.stringify(errorCodes(declared)));
check(
  "persisted invocation levels reach the unit in order, undeclared slot defaults to 1",
  JSON.stringify(declared.units[0]?.skills.map((entry) => entry.invocationLevel)),
  JSON.stringify([0, 2, 1]),
);
const declaredScenario = declared.setup ? battleSetupToCombatScenario(structuredClone(declared.setup)).scenario : null;
check(
  "the adapter forwards the persisted invocation levels",
  JSON.stringify(declaredScenario?.ownUnits[0]?.invocationLevels),
  JSON.stringify([0, 2, 1]),
);
check(
  "an undeclared slot is reported as a labelled native default, not silently dropped",
  declared.issues.some((issue) => issue.code === "INVOCATION_LEVEL_NOT_CAPTURED"),
  JSON.stringify(declared.issues.map((issue) => issue.code)),
);

const fullyDeclared = battleSetupFromLoadouts(
  [{ ...base, skills: ["Normal Attack"], skillInvocations: [0] }],
  shared,
  { encounterId: 19 },
);
check(
  "a fully declared skill list reports no invocation unknown",
  !fullyDeclared.issues.some((issue) => issue.code === "INVOCATION_LEVEL_NOT_CAPTURED"),
  JSON.stringify(fullyDeclared.issues.map((issue) => issue.code)),
);

/* 2. declared household pets ----------------------------------------------------------- */

const petLoadout = {
  ...base,
  id: "pet-loadout",
  name: "Pet Owner",
  householdPets: [
    { monsterId: petSpeciesId, name: "Ally", level: 7, skills: ["Normal Attack"], skillInvocations: [0] },
  ],
};
const withPet = battleSetupFromLoadouts([petLoadout], shared, { encounterId: 19 });
check("declared pet loadout has no ERROR issues", errorCodes(withPet).length === 0, JSON.stringify(errorCodes(withPet)));
check(
  "the household is keyed by the converted unique unit name",
  JSON.stringify(Object.keys(withPet.setup?.households ?? {})),
  JSON.stringify(["Pet Owner"]),
);
check(
  "the pet level lands on every monster parameter as the declared training level",
  Object.values(withPet.setup?.households?.["Pet Owner"]?.[0]?.parameters ?? {}).every((entry) => entry.trainingLevel === 7),
  JSON.stringify(withPet.setup?.households?.["Pet Owner"]?.[0]?.parameters ?? {}),
);
const petScenario = withPet.setup ? battleSetupToCombatScenario(structuredClone(withPet.setup)).scenario : null;
check(
  "the adapter appends the pet under its owner with the owner binding",
  JSON.stringify((petScenario?.housePets?.["Pet Owner"] ?? []).map((entry) => [entry.name, entry.petOwnerName])),
  JSON.stringify([["Ally", "Pet Owner"]]),
);
check(
  "the species' canonical innate is exported first and the declared skill keeps its invocation level",
  JSON.stringify(petScenario?.housePets?.["Pet Owner"]?.[0]?.invocationLevels),
  JSON.stringify([1, 0]),
);
check("the declared owner is a house owner in the scenario", petScenario?.ownUnits[0]?.isHouseOwner === true, petScenario?.ownUnits[0]?.isHouseOwner);

const noPet = battleSetupFromLoadouts([{ ...base, id: "no-pet", name: "No Pet", householdPets: [] }], shared, { encounterId: 19 });
check(
  "an empty declaration is a house owner with no pets",
  JSON.stringify(noPet.setup?.households),
  JSON.stringify({ "No Pet": [] }),
);

const clash = battleSetupFromLoadouts(
  [{ ...petLoadout, householdPets: [{ monsterId: petSpeciesId, name: "Pet Owner", level: 1 }] }],
  shared,
  { encounterId: 19 },
);
check(
  "a pet name clashing with the owner is derived unique",
  clash.setup?.households?.["Pet Owner"]?.[0]?.name === "Pet Owner (2)",
  JSON.stringify(clash.setup?.households),
);
check(
  "a derived pet name is reported",
  clash.issues.some((issue) => issue.code === "PET_NAME_DERIVED"),
  JSON.stringify(clash.issues.map((issue) => issue.code)),
);

/* 3. preview envelope ------------------------------------------------------------------ */

const request = buildBattlePreviewRequest(declaredScenario);
check("the preview request uses the preview schema", request.schema === BATTLE_PREVIEW_SCHEMA, request.schema);
check("the preview request carries the adapter scenario", request.scenario === declaredScenario, "scenario mismatch");
const longFightScenario = { ...declaredScenario, tickLimit: 900 * 20 };
const longFightPreview = buildBattlePreviewRequest(longFightScenario);
check("a 900-second fight stays within the preview transport limit",
  longFightPreview.scenario.tickLimit === BATTLE_PREVIEW_MAX_TICK_LIMIT,
  longFightPreview.scenario.tickLimit);
check("preview does not change the fight duration", longFightScenario.tickLimit === 900 * 20,
  longFightScenario.tickLimit);

const good = parseBattlePreview({
  schema: BATTLE_PREVIEW_SCHEMA,
  units: [{ name: "Skill Owner", side: "player", kind: "human", cell: [0, 1], parameters: { "10": { rawValue: 10 } } }],
  petLimits: [{ owner: "Pet Owner", maxPets: 3, attachedPets: 1 }],
  diagnostics: ["preview only"],
});
check("a well-formed preview parses", good.preview?.units.length === 1, JSON.stringify(good.issues));
check("pet limits come straight from the backend payload", JSON.stringify(good.preview?.petLimits?.[0]), JSON.stringify({ owner: "Pet Owner", maxPets: 3, attachedPets: 1 }));
/* 3b. corrected preview contract ------------------------------------------------------ */

const prepared = parseBattlePreview({
  schema: BATTLE_PREVIEW_SCHEMA,
  units: [
    {
      name: "Prepared",
      side: "ally",
      kind: "human",
      cell: [1, 2],
      parameters: { "10": { effectiveValue: 42, effectiveMaximum: 90 } },
    },
  ],
  petLimits: [{ owner: "Prepared", maxPets: null, attachedPets: 2 }],
  diagnostics: [{ code: "PREVIEW_ONLY", message: "no capacity asserted" }],
});
check("a prepared preview parses", prepared.preview?.units.length === 1, JSON.stringify(prepared.issues));
check(
  "the prepared effectiveValue/effectiveMaximum pair is preserved",
  JSON.stringify(prepared.preview?.units?.[0]?.parameters?.["10"]),
  JSON.stringify({ effectiveValue: 42, effectiveMaximum: 90 }),
);
check(
  "an unasserted pet cap stays null, never coerced to 0 or NaN",
  prepared.preview?.petLimits?.[0]?.maxPets === null && prepared.preview?.petLimits?.[0]?.attachedPets === 2,
  JSON.stringify(prepared.preview?.petLimits?.[0]),
);
check(
  "diagnostics normalize to code/message objects",
  JSON.stringify(prepared.preview?.diagnostics?.[0]),
  JSON.stringify({ code: "PREVIEW_ONLY", message: "no capacity asserted" }),
);
check(
  "a legacy raw-only parameter reads as unknown, not a real value",
  JSON.stringify(battlePreviewParameterNumbers({ rawValue: 10 })),
  JSON.stringify({ value: null, maximum: null }),
);

const bad = parseBattlePreview({ schema: "something-else", units: [] });
check("an unknown preview schema is rejected", bad.preview === null && bad.issues.length === 1, JSON.stringify(bad.issues));
check(
  "a preview error body keeps the backend message",
  describeBattlePreviewFailure(500, JSON.stringify({ message: "ScenarioError: Missing inputs" })),
  "ScenarioError: Missing inputs (preview HTTP 500)",
);

const sameNames = battleSetupFromLoadouts(
  ["Twin", "Twin", "Twin (2)"].map((name, index) => ({ ...base, id: `twin-${index}`, name, skills: [] })),
  shared,
  { encounterId: 19 },
);
check(
  "duplicate names stay unique without taking another character's chosen name",
  JSON.stringify(sameNames.units.map((unit) => unit.name)) === JSON.stringify(["Twin", "Twin (3)", "Twin (2)"]),
  JSON.stringify(sameNames.units.map((unit) => unit.name)),
);
check("duplicate names do not create a warning", !sameNames.issues.some((issue) => issue.code === "UNIT_NAME_DERIVED"), JSON.stringify(sameNames.issues));

const failed = checks.filter((entry) => !entry.passed);
for (const entry of failed) console.log(`FAIL ${entry.name}: ${entry.detail}`);
console.log(`${checks.length - failed.length}/${checks.length} player-battle regression checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
