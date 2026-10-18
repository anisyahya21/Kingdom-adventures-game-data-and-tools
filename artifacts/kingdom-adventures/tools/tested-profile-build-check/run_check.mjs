import assert from "node:assert/strict";
import { TESTED_PROFILE_BUILD_CANDIDATE as candidate, TESTED_PROFILE_BUILD_ALTERNATIVES } from "../../src/game-data/tested-profile-build.ts";
import { projectTestedProfileBuild, projectTestedProfileBuildCandidates, testedProfileEvidenceVisible } from "../../src/lib/tested-profile-build.ts";

const profile = {
  version: 1,
  equipment: Object.fromEntries(candidate.equipment.map(({ item, level }) => [item, level])),
  characters: [{ id: "fixture-only", jobName: candidate.job, rank: candidate.rank, gender: candidate.gender, statLevels: {} }],
  valuables: {},
};
const project = (p = profile, c = candidate, stats = candidate.stats, equipmentLegal = () => true, skillsLegal = () => true) =>
  projectTestedProfileBuild(p, c, (character) => ({ ...stats, ...(character.statLevels.hp ? { hp: stats.hp + 1 } : {}) }), equipmentLegal, skillsLegal);

const build = project();
assert.ok(build);
assert.deepEqual(build.picks.map(({ slot, item, level }) => [slot, item, level]), candidate.equipment.map(({ slot, item, level }) => [slot, item, level]));
assert.deepEqual(build.stats, candidate.stats);
assert.equal(build.characterId, "fixture-only");
assert.deepEqual(build.skills, ["Shield Resistance"]);

assert.equal(project({ ...profile, equipment: { ...profile.equipment, [candidate.equipment[0].item]: 98 } }), null, "changed owned gear level rejects projection");
assert.equal(project({ ...profile, characters: [{ ...profile.characters[0], gender: 1 }] }), null, "gender mismatch rejects projection");
assert.equal(project({ ...profile, characters: [{ ...profile.characters[0], jobName: "Warrior" }] }), null, "job mismatch rejects projection");
assert.equal(project({ ...profile, characters: [{ ...profile.characters[0], statLevels: { hp: 1 } }] }), null, "changed base stat levels reject projection");
assert.equal(project(profile, candidate, { ...candidate.stats, hp: candidate.stats.hp + 1 }), null, "base/effective stat change rejects projection");
assert.equal(project(profile, candidate, { ...candidate.stats, mp: candidate.stats.mp - 1 }), null, "MP mismatch rejects projection");
assert.equal(project(profile, candidate, candidate.stats, () => false), null, "illegal equipment rejects projection");
assert.equal(project(profile, candidate, candidate.stats, () => true, () => false), null, "illegal skill rejects projection");
assert.equal(project(profile, { ...candidate, skills: [...candidate.skills].reverse() }), null, "changed ordered farming skills reject projection");
assert.equal(project(profile, { ...candidate, equipment: [...candidate.equipment, { ...candidate.equipment[0], slot: "Other" }] }), null, "duplicate item rejects projection");

const exactPolicy = { encounterId: 3, placeholderSupports: true, allowConsumables: true, holyHerbLimit: 10, recoveryPotionLimit: 0, finiteHpMp: true };
const n10 = { ...candidate, status: "active", sampleSize: 10, survivedRuns: 8, medianCallbacks: 7, medianHerbsUsed: 2 };
const n20 = { ...candidate, status: "active", sampleSize: 20, survivedRuns: 15, medianCallbacks: 7, medianHerbsUsed: 2,
  averageCallbacks: 10, highestCallbacks: 50, atMostOneCallbackRuns: 3, evidenceSha256: "a".repeat(64) };
assert.equal(testedProfileEvidenceVisible(n10, exactPolicy), false, "n=10 stays hidden");
assert.equal(testedProfileEvidenceVisible(n20, exactPolicy), true, "n=20 can activate exact scenario");
assert.equal(testedProfileEvidenceVisible({ ...n20, evidenceSha256: "" }, exactPolicy), false, "unlinked evidence stays hidden");
assert.equal(testedProfileEvidenceVisible({ ...n20, atMostOneCallbackRuns: 21 }, exactPolicy), false, "invalid low-tail count stays hidden");
assert.equal(testedProfileEvidenceVisible({ ...n20, medianCallbacks: null }, exactPolicy), false, "missing modeled callback summary stays hidden");
assert.equal(testedProfileEvidenceVisible({ ...n20, survivedRuns: 21 }, exactPolicy), false, "invalid survival count stays hidden");
assert.equal(testedProfileEvidenceVisible(n20, { ...exactPolicy, holyHerbLimit: 9 }), false, "changed policy hides result");
assert.equal(testedProfileEvidenceVisible(n20, { ...exactPolicy, placeholderSupports: false }), false, "real team hides synthetic-support result");
assert.equal(testedProfileEvidenceVisible({ ...n20, status: "pending" }, exactPolicy), false, "pending evidence stays hidden");

const ribbon = TESTED_PROFILE_BUILD_ALTERNATIVES[0];
const ribbonProfile = {
  ...profile,
  equipment: Object.fromEntries(ribbon.equipment.map(({ item, level }) => [item, level])),
};
const projectedCandidates = projectTestedProfileBuildCandidates(ribbonProfile, [candidate, ribbon],
  (tested, character, equipment) => equipment.some(({ item }) => item === "A/ Ribbon")
    ? ribbon.stats : candidate.stats,
  (_tested, _character, item) => ribbon.equipment.some((entry) => entry.item === item),
  () => true);
assert.equal(projectedCandidates.length, 1, "exact Ribbon profile yields only its matching candidate");
assert.equal(projectedCandidates[0].candidate.evidenceSha256, ribbon.evidenceSha256);
assert.equal(projectedCandidates[0].build.stats.mp, 1766);
assert.equal(ribbon.horizonSeconds, 1800, "alternative handoff uses its audited 36,000-tick horizon");
assert.notEqual(ribbon.horizonSeconds, candidate.horizonSeconds, "alternative horizon remains distinct from primary");
assert.deepEqual(ribbon.pairedCallbackDelta, { mean: -7.15, lower: -22.15, upper: 4.95 });
assert.equal(projectTestedProfileBuildCandidates({
  ...ribbonProfile, equipment: { ...ribbonProfile.equipment, [ribbon.equipment.at(-1).item]: 39 },
}, [ribbon], (_character, equipment) => equipment.some(({ item }) => item === "A/ Ribbon") ? ribbon.stats : null,
(_tested, _character, item) => ribbon.equipment.some((entry) => entry.item === item), () => true).length, 0, "wrong Ribbon level rejects alternative");
assert.equal(projectTestedProfileBuildCandidates(ribbonProfile, [ribbon], () => ({ ...ribbon.stats, mp: 1765 }),
(_tested, _character, item) => ribbon.equipment.some((entry) => entry.item === item), () => true).length, 0, "altered MP rejects alternative");
console.log("Tested profile build projection and activation gates passed.");
