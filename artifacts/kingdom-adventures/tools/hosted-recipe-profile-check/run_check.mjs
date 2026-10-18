import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compareHostedRecipeEvidenceOrder, hostedEvidenceMatchesForScope, hostedRecipeEvidenceOrder, profileFarmingBuildFingerprint, projectHostedRecipeProfileCandidates } from "../../src/lib/hosted-recipe-profile-targets.ts";
import { matchHostedAccountCombatEvidence } from "../../src/game-data/hosted-account-combat-evidence.ts";
import { localSharedData } from "../../src/lib/local-shared-data.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(await readFile(path.resolve(here, "../../public/hosted-account-evidence-v5.compact.json"), "utf8"));
const fixture = JSON.parse(await readFile(path.resolve(here, "../hosted-account-evidence-check/canonical-preparation-fixture.json"), "utf8"));
const character = {
  id: fixture.loadout.id,
  jobName: fixture.loadout.jobName,
  rank: fixture.loadout.rank,
  gender: fixture.loadout.gender,
  statLevels: { ...fixture.loadout.statLevels },
};
const profile = {
  version: 1,
  equipment: Object.fromEntries(fixture.loadout.equipment.map(({ name, level }) => [name, level])),
  characters: [character],
  valuables: { ...fixture.loadout.residentStatItems },
};
const settings = {
  useProfile: true,
  encounterId: 3,
  levelUpGear: false,
  maxGearLevel: "99",
  excludedCharacters: [],
  reservedEquipment: [],
};

const emptyMatchesA = hostedEvidenceMatchesForScope(null, profile, localSharedData, settings);
const emptyMatchesB = hostedEvidenceMatchesForScope(null, profile, localSharedData, settings);
assert.equal(emptyMatchesA, emptyMatchesB, "a profile with no recipe evidence reuses a stable empty match map while lookup is pending");

const candidates = projectHostedRecipeProfileCandidates(dataset, profile, localSharedData, settings);
const primary = candidates.find(({ cohortIds }) => cohortIds.includes("primary-six-validation-20"));
assert.ok(primary, "the exact owned six-skill recipe projects onto the anonymized profile");
assert.equal(primary.sourceKind, "hosted-recipe");
assert.equal(primary.build.stats.hp, fixture.statsAll12.hp);
assert.equal(primary.build.stats.atk, fixture.statsAll12.atk);
assert.deepEqual(primary.skills, fixture.loadout.skills);
assert.deepEqual(primary.skillInvocations, [0, 0, 0, 0, 0, 0]);
assert.ok(!("mean" in primary) && !("survivedRuns" in primary), "candidate carries no outcome or safety score");
assert.ok(primary.cohortIds.includes("primary-six-validation-20"), "primary cohort remains represented in the merged recipe provenance");
assert.equal(profileFarmingBuildFingerprint({ ...primary.build, skills: [] }, profile), profileFarmingBuildFingerprint(primary.build, profile),
  "legacy stat-target skill requirements normalize to the exact canonical farming skill list for card deduplication");
assert.notEqual(profileFarmingBuildFingerprint({ ...primary.build, skills: ["Shield Resistance"] }, profile), profileFarmingBuildFingerprint(primary.build, profile),
  "gear-legalizing skills remain a distinct exact recipe identity");
const duplicateDataset = structuredClone(dataset);
const primaryRecord = duplicateDataset.records.find(({ cohortId }) => cohortId === "primary-six-validation-20");
duplicateDataset.records.push({
  ...structuredClone(primaryRecord),
  cohortId: "same-recipe-control",
  caseId: "same-recipe-control",
  build: { ...structuredClone(primaryRecord.build), job: "Samurai", rank: "S", gender: 1 },
});
const merged = projectHostedRecipeProfileCandidates(duplicateDataset, profile, localSharedData, settings)
  .find(({ recipeId }) => recipeId === primary.recipeId);
const mergedRows = projectHostedRecipeProfileCandidates(duplicateDataset, profile, localSharedData, settings)
  .filter(({ recipeId }) => recipeId === primary.recipeId);
assert.equal(mergedRows.length, 1, "different source jobs with identical encounter, gear, and ordered skills yield one actual-profile projection");
assert.deepEqual(merged.cohortIds, [...new Set([...primary.cohortIds, "same-recipe-control"])].sort(), "same gear-and-skill recipes merge cohort provenance across source jobs");
assert.deepEqual(merged.caseIds, [...new Set([...primary.caseIds, "same-recipe-control"])].sort(), "merged recipe retains every source case identifier");
assert.ok(merged.sourceIdentities.some(({ job, rank, gender }) => job === "Samurai" && rank === "S" && gender === 1),
  "recipe provenance retains the differing source character identity while projection stays per actual profile character");
const otherEncounterDataset = structuredClone(dataset);
otherEncounterDataset.records.push({ ...structuredClone(primaryRecord), cohortId: "same-recipe-other-encounter", caseId: "same-recipe-other-encounter",
  scenario: { ...primaryRecord.scenario, encounterId: 4 } });
const encounterFourRecipe = projectHostedRecipeProfileCandidates(otherEncounterDataset, profile, localSharedData, { ...settings, encounterId: 4 })
  .find(({ cohortIds }) => cohortIds.includes("same-recipe-other-encounter"));
assert.ok(encounterFourRecipe);
assert.notEqual(encounterFourRecipe.recipeId, primary.recipeId, "encounter remains part of recipe identity even when gear and ordered skills match");

const changedProfile = structuredClone(profile);
changedProfile.characters[0].statLevels.atk += 1;
const changed = projectHostedRecipeProfileCandidates(dataset, changedProfile, localSharedData, settings)
  .find(({ recipeId }) => recipeId === primary.recipeId);
assert.ok(changed);
assert.notEqual(changed.build.stats.atk, primary.build.stats.atk, "profile training is recomputed, not copied from the hosted row");
assert.deepEqual(projectHostedRecipeProfileCandidates(dataset, changedProfile, localSharedData, settings, true), [],
  "exact-target mode applies the existing ATT/SPD/LCK/DEX filter to recipe projections");
const changedLuckProfile = structuredClone(profile);
changedLuckProfile.characters[0].statLevels.lck += 1;
assert.deepEqual(projectHostedRecipeProfileCandidates(dataset, changedLuckProfile, localSharedData, settings, true), [],
  "exact-target mode checks the canonical lck key even when ATT, SPD, and DEX are unchanged");

const excludedSettings = { ...settings, excludedCharacters: [character.id] };
assert.deepEqual(projectHostedRecipeProfileCandidates(dataset, profile, localSharedData, excludedSettings), []);
const reservedSettings = { ...settings, reservedEquipment: [fixture.loadout.equipment[0].name] };
assert.deepEqual(projectHostedRecipeProfileCandidates(dataset, profile, localSharedData, reservedSettings), []);
const wrongGender = structuredClone(profile);
wrongGender.characters[0].gender = 1;
const femaleCandidates = projectHostedRecipeProfileCandidates(dataset, wrongGender, localSharedData, settings);
assert.ok(femaleCandidates.length > 0, "canonical legal unisex gear can project onto a different-gender profile character");
const evidenceRecord = dataset.records.find(({ cohortId }) => cohortId === "primary-six-validation-20");
const femaleCandidate = femaleCandidates.find(({ cohortIds }) => cohortIds.includes("primary-six-validation-20"));
assert.ok(femaleCandidate);
const evidenceInput = {
  build: { ...femaleCandidate.build, skills: [...femaleCandidate.skills] },
  gender: 1,
  encounterId: evidenceRecord.scenario.encounterId,
  supportMode: evidenceRecord.scenario.supportMode,
  supportFingerprintSha256: evidenceRecord.scenario.supportFingerprintSha256,
  formationFingerprintSha256: evidenceRecord.scenario.formationFingerprintSha256,
  encounterFingerprintSha256: evidenceRecord.scenario.encounterFingerprintSha256,
  orderedSkills: [...femaleCandidate.skills],
  skillInvocations: [...femaleCandidate.skillInvocations],
  policy: { ...evidenceRecord.policy },
};
assert.deepEqual(matchHostedAccountCombatEvidence(dataset, evidenceInput), [], "a legal derived recipe remains unmeasured when the exact character identity differs");
const missingGear = structuredClone(profile);
delete missingGear.equipment[fixture.loadout.equipment[0].name];
assert.deepEqual(projectHostedRecipeProfileCandidates(dataset, missingGear, localSharedData, settings), []);

const lowerLevel = structuredClone(profile);
lowerLevel.equipment[fixture.loadout.equipment[0].name] = 98;
const lowerCandidate = projectHostedRecipeProfileCandidates(dataset, lowerLevel, localSharedData, settings)
  .find(({ recipeId }) => recipeId === primary.recipeId);
assert.ok(lowerCandidate, "actual lower equipment levels remain achievable candidates");
assert.equal(lowerCandidate.build.addedLevels, 0);
assert.equal(lowerCandidate.build.picks.find(({ item }) => item === fixture.loadout.equipment[0].name).level, 98);
assert.notDeepEqual(lowerCandidate.build.stats, primary.build.stats, "actual-level stats are recomputed");
assert.deepEqual(matchHostedAccountCombatEvidence(dataset, {
  ...evidenceInput, gender: character.gender, build: lowerCandidate.build,
  orderedSkills: lowerCandidate.skills, skillInvocations: lowerCandidate.skillInvocations,
}), [], "actual lower-level equipment cannot borrow the source recipe's measured average");
const upgradeSettings = { ...settings, levelUpGear: true };
const proposed = projectHostedRecipeProfileCandidates(dataset, lowerLevel, localSharedData, upgradeSettings)
  .find(({ recipeId, build }) => recipeId === primary.recipeId && build.addedLevels > 0);
assert.ok(proposed);
assert.equal(proposed.build.addedLevels, 1);
assert.deepEqual(proposed.build.requiredUpgrades, [{
  item: fixture.loadout.equipment[0].name, currentLevel: 98, requiredLevel: 99, addedLevels: 1,
}]);

assert.ok(projectHostedRecipeProfileCandidates(dataset, lowerLevel, localSharedData, upgradeSettings)
  .some(({ recipeId, build }) => recipeId === primary.recipeId && build.addedLevels === 0), "upgrades retain the current-level option");
const aboveRecipe = structuredClone(profile);
const lowRecipeGear = fixture.loadout.equipment.find(({ level }) => level < 99);
assert.ok(lowRecipeGear);
aboveRecipe.equipment[lowRecipeGear.name] = lowRecipeGear.level + 1;
for (const mode of [settings, upgradeSettings]) {
  const higher = projectHostedRecipeProfileCandidates(dataset, aboveRecipe, localSharedData, mode).find(({ recipeId }) => recipeId === primary.recipeId);
  assert.ok(higher, "higher owned levels remain achievable candidates");
  assert.equal(higher.build.picks.find(({ item }) => item === lowRecipeGear.name).level, lowRecipeGear.level + 1, "never downgrade equipment");
  assert.equal(higher.build.addedLevels, 0);
}
const noDeath = { sample: { n: 20 }, outcomeSummary: { survival: { survived: 20, sampleSize: 20 }, firstBossAttempt: { count: 20, sampleSize: 20 } } };
const smallerNoDeath = { sample: { n: 5 }, outcomeSummary: { survival: { survived: 5, sampleSize: 5 }, firstBossAttempt: { count: 5, sampleSize: 5 } } };
const incompleteFirstBoss = { sample: { n: 5 }, outcomeSummary: { survival: { survived: 5, sampleSize: 5 }, firstBossAttempt: { count: 4, sampleSize: 5 } } };
const death = { sample: { n: 5 }, outcomeSummary: { survival: { survived: 4, sampleSize: 5 }, firstBossAttempt: { count: 5, sampleSize: 5 } } };
const largeClearOrder = hostedRecipeEvidenceOrder([noDeath]);
const smallClearOrder = hostedRecipeEvidenceOrder([smallerNoDeath]);
const deathOrder = hostedRecipeEvidenceOrder([death]);
const incompleteOrder = hostedRecipeEvidenceOrder([incompleteFirstBoss]);
const unknownOrder = hostedRecipeEvidenceOrder([]);
assert.equal(largeClearOrder.kind, "no-observed-deaths");
assert.ok(compareHostedRecipeEvidenceOrder(largeClearOrder, smallClearOrder) < 0, "larger no-death cohorts sort first");
assert.equal(deathOrder.kind, "observed-deaths");
assert.equal(incompleteOrder.kind, "incomplete-first-boss-attempt", "5/5 survival with only 4/5 first boss attacks is not favorable evidence");
assert.ok(compareHostedRecipeEvidenceOrder(incompleteOrder, largeClearOrder) > 0, "incomplete first-boss coverage cannot outrank complete endpoint evidence");
assert.ok(compareHostedRecipeEvidenceOrder(incompleteOrder, unknownOrder) < 0, "incomplete evidence stays distinct from unmeasured recipes");
assert.ok(compareHostedRecipeEvidenceOrder(deathOrder, largeClearOrder) > 0, "a death cannot be promoted by another cohort's mean");
assert.equal(hostedRecipeEvidenceOrder([noDeath, death]).kind, "observed-deaths", "cohorts stay distinct and any exact matched death remains flagged");
assert.equal(hostedRecipeEvidenceOrder([noDeath, incompleteFirstBoss]).kind, "incomplete-first-boss-attempt", "all matched cohorts must cover the first boss attack");
assert.ok(compareHostedRecipeEvidenceOrder(unknownOrder, deathOrder) < 0, "unknown remains distinct from observed deaths");
assert.deepEqual(projectHostedRecipeProfileCandidates(dataset, profile, localSharedData, { ...settings, encounterId: 4 }), [], "recipes from other encounters are excluded");

console.log("Hosted recipe profile projection checks passed.");
