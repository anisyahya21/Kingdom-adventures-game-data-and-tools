import assert from "node:assert/strict";
import { ACCOUNT_DIAGNOSTIC_E3, exactAccountDiagnosticCase, sameOrderedSkillEvidence } from "../../src/game-data/account-diagnostic-evidence.ts";

function toBuild(testCase) {
  return {
    characterId: "local-test", characterName: "Fixture", jobName: testCase.job, rank: testCase.rank,
    skills: ["Shield Resistance"],
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

console.log("Account diagnostic exact-match checks passed (3 exact cases; stats, gear, encounter, identity and skill mismatches rejected).");
