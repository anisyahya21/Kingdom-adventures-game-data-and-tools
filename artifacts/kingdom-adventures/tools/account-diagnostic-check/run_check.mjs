import assert from "node:assert/strict";
import { ACCOUNT_DIAGNOSTIC_E3, ACCOUNT_LIVE_BUILD_PILOT_E3, accountDiagnosticLabel, accountDiagnosticScenario, exactAccountDiagnosticCase, sameOrderedSkillEvidence } from "../../src/game-data/account-diagnostic-evidence.ts";

function toBuild(testCase) {
  return {
    characterId: "local-test", characterName: "Fixture", jobName: testCase.job, rank: testCase.rank,
    skills: [...testCase.skills],
    picks: testCase.equipment.map((pick, index) => ({ slot: `slot-${index}`, item: pick.equipmentName, level: pick.level })),
    stats: { ...testCase.stats }, addedLevels: 0, requiredUpgrades: [],
  };
}

for (const testCase of ACCOUNT_DIAGNOSTIC_E3.cases) {
  assert.equal(exactAccountDiagnosticCase(3, toBuild(testCase), testCase.gender), testCase);
}

const baseCase = ACCOUNT_DIAGNOSTIC_E3.cases[0];
const baseBuild = toBuild(baseCase);
for (const mutation of [
  (build) => { build.stats.hp += 1; },
  (build) => { build.stats.mp -= 1; },
  (build) => { build.picks[0].level -= 1; },
  (build) => { build.jobName = "Samurai"; },
  (build) => { build.rank = "S"; },
  (build) => { build.skills = ["Unrecorded skill"]; },
]) {
  const changed = structuredClone(baseBuild);
  mutation(changed);
  assert.equal(exactAccountDiagnosticCase(3, changed, 0), null);
}
assert.equal(exactAccountDiagnosticCase(4, baseBuild, 0), null, "nearby encounter must not inherit the diagnostic");
assert.equal(exactAccountDiagnosticCase(3, baseBuild, 1), null, "different gender must not inherit the diagnostic");
assert.equal(exactAccountDiagnosticCase(3, { ...baseBuild, stats: { ...baseBuild.stats, vig: 1 } }, 0), null,
  "non-DPS stat mismatch must reject an otherwise matching four-stat build");

const wrongGearIdentity = structuredClone(baseBuild);
wrongGearIdentity.picks[0].item = "A similarly statted item";
assert.equal(exactAccountDiagnosticCase(3, wrongGearIdentity, 0), null);
const expectedSkills = baseCase.skills;
assert.equal(sameOrderedSkillEvidence(expectedSkills, baseCase.invocations, expectedSkills, baseCase.invocations), true);
assert.equal(sameOrderedSkillEvidence([...expectedSkills].reverse(), baseCase.invocations, expectedSkills, baseCase.invocations), false,
  "skill order must match the audited invocations");
assert.equal(sameOrderedSkillEvidence(expectedSkills, [1, ...baseCase.invocations.slice(1)], expectedSkills, baseCase.invocations), false,
  "invocation levels must match exactly");

const pilotCase = ACCOUNT_LIVE_BUILD_PILOT_E3.cases[0];
const pilotBuild = toBuild(pilotCase);
assert.equal(exactAccountDiagnosticCase(3, pilotBuild, 0), pilotCase, "exact pilot package must match its distinct cohort");
assert.equal(ACCOUNT_LIVE_BUILD_PILOT_E3.auditedTraceCount, 3);
assert.equal(exactAccountDiagnosticCase(3, { ...pilotBuild, skills: [] }, 0), pilotCase, "real planner carries only required equipment skills");
assert.equal(exactAccountDiagnosticCase(3, { ...baseBuild, skills: ["Shield Resistance"] }, 0), baseCase, "original planner skill representation remains supported");
assert.deepEqual(ACCOUNT_LIVE_BUILD_PILOT_E3.seeds.map(({ mathSeed, libSeed }) => [mathSeed, libSeed]), [[170200, 270200], [170201, 270201], [170202, 270202]]);
assert.match(accountDiagnosticLabel(pilotCase), /^Failed pilot: DPS died before attacking the boss in 3\/3 modeled tests$/);
assert.match(accountDiagnosticScenario(pilotCase), /Three seeds only/);
assert.match(accountDiagnosticScenario(pilotCase), /not population reliability/);
assert.equal(accountDiagnosticLabel(baseCase), "Fixed-support diagnostic: DPS survived 6/20", "existing survival label remains unchanged");
assert.equal(accountDiagnosticScenario(baseCase), "Anonymized account diagnostic; 60 fixed browser-runtime runs across three exact builds. Fixed synthetic healer and four fodders; at most 10 Holy Herbs at 20% DPS MP using a 200-tick sample window; 0 potions; finite HP/MP. User team not measured. Recorded DPS deaths move an exact matching setup after untested options; untested does not mean safer. Fixed-research reward averages are unchanged.", "existing scenario caveat remains unchanged");

for (const mutation of [
  (build) => { build.stats.hp += 1; },
  (build) => { build.picks[2].level -= 1; },
  (build) => { build.picks[0].item = "A similarly statted item"; },
  (build) => { build.skills[1] = "6-Hit Attack"; },
]) {
  const changed = structuredClone(pilotBuild);
  mutation(changed);
  assert.equal(exactAccountDiagnosticCase(3, changed, 0), null, "pilot must reject changed stats, gear, or skill identity");
}
assert.equal(exactAccountDiagnosticCase(4, pilotBuild, 0), null, "pilot must reject other encounters");
assert.equal(exactAccountDiagnosticCase(3, pilotBuild, 1), null, "pilot must reject other genders");

console.log("Account diagnostic exact-match checks passed (3 original cases unchanged; pilot exact match and cohort mismatch gates passed).");

const { accountDiagnosticFailedPilotApplies } = await import("../../src/game-data/account-diagnostic-evidence.ts");
const matchingSetup = { encounterId: 3, placeholderSupports: true, finiteHpMp: true, allowConsumables: true, holyHerbLimit: 10, recoveryPotionLimit: 0 };
assert.equal(accountDiagnosticFailedPilotApplies(pilotCase, 3, matchingSetup), true);
for (const change of [{ encounterId: 4 }, { placeholderSupports: false }, { finiteHpMp: false }, { allowConsumables: false }, { holyHerbLimit: 9 }, { recoveryPotionLimit: 1 }]) {
  assert.equal(accountDiagnosticFailedPilotApplies(pilotCase, 3, { ...matchingSetup, ...change }), false);
}
assert.equal(accountDiagnosticFailedPilotApplies(null, 3, matchingSetup), false);
assert.equal(accountDiagnosticFailedPilotApplies(baseCase, 3, matchingSetup), false);
assert.equal(accountDiagnosticFailedPilotApplies(pilotCase, 3), false);
console.log("PASS: failed-pilot ordering requires exact identity and matching support/resource controls.");

const { accountDiagnosticObservedDeathsApply } = await import("../../src/game-data/account-diagnostic-evidence.ts");
assert.equal(accountDiagnosticObservedDeathsApply(baseCase, 3, matchingSetup), true);
for (const change of [{ encounterId: 4 }, { placeholderSupports: false }, { finiteHpMp: false }, { allowConsumables: false }, { holyHerbLimit: 9 }, { recoveryPotionLimit: 1 }]) {
  assert.equal(accountDiagnosticObservedDeathsApply(baseCase, 3, { ...matchingSetup, ...change }), false);
}
assert.equal(accountDiagnosticObservedDeathsApply(null,3,matchingSetup),false);
assert.equal(accountDiagnosticObservedDeathsApply({...baseCase,survivedRuns:20},3,matchingSetup),false);
console.log("PASS: observed-death ordering requires matching finite-resource synthetic support controls.");
