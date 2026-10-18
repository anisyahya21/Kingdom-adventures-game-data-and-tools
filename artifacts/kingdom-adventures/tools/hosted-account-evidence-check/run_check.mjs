import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createHostedAccountCombatEvidenceLookup,
  matchHostedAccountCombatEvidence,
} from "../../src/game-data/hosted-account-combat-evidence.ts";
import { prepareHostedAccountEvidenceInput } from "../../src/game-data/prepare-hosted-account-evidence.ts";
import { localSharedData } from "../../src/lib/local-shared-data.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(await readFile(path.resolve(here, "../../public/hosted-account-evidence-v5.compact.json"), "utf8"));
const v4Dataset = JSON.parse(await readFile(path.resolve(here, "../../public/hosted-account-evidence-v4.compact.json"), "utf8"));
assert.equal(dataset.evidenceBankRevision, "v5", "the loader fixture uses the current hosted evidence bank");
assert.equal(dataset.records.length, 12);
assert.equal(dataset.records.reduce((total, record) => total + record.sample.n, 0), 75);
assert.deepEqual(dataset.records.slice(0, v4Dataset.records.length), v4Dataset.records,
  "all v4 cohorts remain semantically unchanged at the front of v5");
const prepFixture = JSON.parse(await readFile(path.resolve(here, "canonical-preparation-fixture.json"), "utf8"));
const pajamas = dataset.records.filter((record) => record.cohortId.includes("pajamas"));
assert.equal(pajamas.length, 2, "the two Pajamas five-run cohorts stay separately represented");

function queryFor(record) {
  const plannerSlot = { weapon: "Weapon", shield: "Shield", head: "Head", body: "Armor", accessory: "Accessory" };
  return {
    build: {
      jobName: record.build.job,
      rank: record.build.rank,
      picks: record.build.gear.map(({ slot, name, level }) => ({ slot: plannerSlot[slot], item: name, level })),
      stats: { ...record.build.statsAll12 },
      skills: record.build.skills.map(({ label }) => label),
    },
    gender: record.build.gender,
    encounterId: record.scenario.encounterId,
    supportMode: record.scenario.supportMode,
    supportFingerprintSha256: record.scenario.supportFingerprintSha256,
    formationFingerprintSha256: record.scenario.formationFingerprintSha256,
    encounterFingerprintSha256: record.scenario.encounterFingerprintSha256,
    orderedSkills: record.build.skills.map(({ label }) => label),
    skillInvocations: record.build.skills.map(({ invocationLevel }) => invocationLevel),
    policy: {
      herbAtDpsMpFraction: record.policy.herbAtDpsMpFraction,
      maximumHerbs: record.policy.maximumHerbs,
      maximumTicks: record.policy.maximumTicks,
      potions: record.policy.potions,
      trainingAdmission: record.policy.trainingAdmission,
      windowTicks: record.policy.windowTicks,
      herbPhase: record.policy.herbPhase,
    },
  };
}

const candidate = pajamas.find((record) => record.cohortId === "mp-followup-pajamas-replication-5");
assert.ok(candidate);
const query = queryFor(candidate);
const matches = matchHostedAccountCombatEvidence(dataset, query);
assert.deepEqual(matches.map(({ cohortId }) => cohortId), ["coverage-gap-screen-5", candidate.cohortId]);
assert.equal(matches[0].evidenceClass, "conditional-fixed-synthetic-support-diagnostics");
assert.match(matches[0].caveat, /does not establish full prepared-scene equivalence/);
assert.equal(matches[0].sample.n, 5);

const scalpelRecords = dataset.records.filter((record) => record.cohortId.startsWith("owned-scalpel-"));
assert.deepEqual(scalpelRecords.map(({ cohortId }) => cohortId), ["owned-scalpel-red-5", "owned-scalpel-ribbon40-5"]);
for (const record of scalpelRecords) {
  const exact = matchHostedAccountCombatEvidence(dataset, queryFor(record));
  assert.deepEqual(exact.map(({ cohortId }) => cohortId), [record.cohortId], "each scalpel package remains its own exact cohort");
  assert.equal(exact[0].sample.n, 5);
  assert.equal(exact[0].outcomeSummary.modeledCallbacks.n, 5);
}
const ribbon40 = scalpelRecords.find(({ cohortId }) => cohortId === "owned-scalpel-ribbon40-5");
assert.equal(ribbon40.outcomeSummary.terminality.terminalByVerdictAndDeparture, 4);
assert.equal(ribbon40.outcomeSummary.terminality.horizonCensored, 1);
assert.match(ribbon40.outcomeSummary.callbackScope, /endpoint mean/,
  "the nonterminal Ribbon 40 run stays labeled as a finite-horizon endpoint");

const samuraiRecords = dataset.records.filter((record) => record.build.job === "Samurai");
assert.deepEqual(samuraiRecords.map(({ cohortId }) => cohortId), [
  "samurai-blizzard-red-5", "samurai-scalpel-red-5", "samurai-scalpel-ribbon40-5",
]);
assert.equal(samuraiRecords.reduce((total, record) => total + record.sample.n, 0), 15,
  "only the three new Samurai cohorts contribute the 15 appended rows");
for (const record of samuraiRecords) {
  const exact = matchHostedAccountCombatEvidence(dataset, queryFor(record));
  assert.deepEqual(exact.map(({ cohortId }) => cohortId), [record.cohortId],
    "each Samurai full package maps to only its own exact cohort");
  assert.equal(exact[0].sample.n, 5);
  assert.equal(exact[0].build.job, "Samurai");
}

for (const mutate of [
  (q) => { q.build.stats.dex += 1; },
  (q) => { q.orderedSkills.push("Shield Resistance"); q.skillInvocations.push(0); },
  (q) => { q.build.picks[0].level -= 1; },
  (q) => { q.build.picks[3].slot = "Body"; },
  (q) => { q.encounterId += 1; },
  (q) => { q.supportFingerprintSha256 = "wrong"; },
  (q) => { q.policy.maximumTicks -= 1; },
  (q) => { q.gender = (q.gender + 1) % 2; },
]) {
  const changed = structuredClone(query);
  mutate(changed);
  assert.deepEqual(matchHostedAccountCombatEvidence(dataset, changed), []);
}

let loads = 0;
const lazy = createHostedAccountCombatEvidenceLookup(async () => {
  loads += 1;
  return dataset;
});
assert.equal(loads, 0, "the evidence is lazy-loaded");
assert.equal((await lazy.find(query)).length, 2);
assert.equal((await lazy.find(query)).length, 2);
assert.equal(loads, 1, "the lazy result is memoized");

for (const corrupt of [
  (copy) => { copy.evidenceBankRevision = "v3"; },
  (copy) => { delete copy.records[0].outcomeSummary.modeledCallbacks.mean; },
  (copy) => { copy.records[0].outcomeSummary.survival.sampleSize -= 1; },
]) {
  const malformed = structuredClone(dataset);
  corrupt(malformed);
  const malformedLookup = createHostedAccountCombatEvidenceLookup(async () => malformed);
  await assert.rejects(() => malformedLookup.find(query), /unsupported schema|invalid or incomplete record/);
}

const primaryRecord = dataset.records.find(({ cohortId }) => cohortId === "primary-six-validation-20");
const primaryLoadout = prepFixture.loadout;
assert.equal(prepFixture.encounterId, primaryRecord.scenario.encounterId);
assert.deepEqual(prepFixture.statsAll12, primaryRecord.build.statsAll12);
const profile = {
  version: 1,
  equipment: Object.fromEntries(primaryLoadout.equipment.map(({ name, level }) => [name, level])),
  characters: [{
    id: primaryLoadout.id,
    jobName: primaryLoadout.jobName,
    rank: primaryLoadout.rank,
    gender: primaryLoadout.gender,
    statLevels: { ...primaryLoadout.statLevels },
  }],
  valuables: { ...primaryLoadout.residentStatItems },
};
const slotLabel = { weapon: "Weapon", shield: "Shield", head: "Head", body: "Armor", accessory: "Accessory" };
const liveBuild = {
  characterId: primaryLoadout.id,
  characterName: primaryLoadout.name,
  jobName: primaryLoadout.jobName,
  rank: primaryLoadout.rank,
  skills: [...primaryLoadout.skills],
  picks: primaryRecord.build.gear.map(({ slot, name, level }) => ({ slot: slotLabel[slot], item: name, level })),
  stats: { ...prepFixture.statsAll12 },
  addedLevels: 0,
  requiredUpgrades: [],
};
const plannerSettings = {
    version: 1, encounterId: prepFixture.encounterId, goal: "rewards",
    useProfile: true, levelUpGear: false, trainCharacters: false, placeholderSupports: true,
    allowConsumables: true, maximizeStats: [], holyHerbLimit: 10, recoveryPotionLimit: 0,
    startingTeamId: "", maxGearLevel: "99", trainingCap: "999", targetMatching: "exact",
    excludedCharacters: [], reservedEquipment: [],
};
const policy = {
    herbAtDpsMpFraction: 0.2, maximumHerbs: 10, maximumTicks: 18000, potions: 0,
    trainingAdmission: false, windowTicks: 200, herbPhase: "after_fighters",
};
const preparation = await prepareHostedAccountEvidenceInput({
  build: liveBuild,
  profile,
  sharedData: localSharedData,
  plannerSettings,
  policy,
});
assert.equal(preparation.fingerprints.support, primaryRecord.scenario.supportFingerprintSha256);
assert.equal(preparation.fingerprints.formation, primaryRecord.scenario.formationFingerprintSha256);
assert.equal(preparation.fingerprints.encounter, primaryRecord.scenario.encounterFingerprintSha256);
assert.equal(matchHostedAccountCombatEvidence(dataset, preparation.lookupInput).length, 1);
const lowerGearInput = structuredClone(preparation.lookupInput);
lowerGearInput.build.picks[0].level -= 1;
assert.deepEqual(matchHostedAccountCombatEvidence(dataset, lowerGearInput), [],
  "changing an owned gear level cannot borrow evidence from the measured level");
const upgradesEnabledSettings = { ...plannerSettings, levelUpGear: true };
const exactOwnedPreparation = await prepareHostedAccountEvidenceInput({
  build: liveBuild,
  profile,
  sharedData: localSharedData,
  plannerSettings: upgradesEnabledSettings,
  policy,
});
assert.equal(matchHostedAccountCombatEvidence(dataset, exactOwnedPreparation.lookupInput).length, 1,
  "enabling optional upgrades does not hide evidence for the exact currently owned build");
await assert.rejects(() => prepareHostedAccountEvidenceInput({
  build: {
    ...liveBuild,
    addedLevels: 1,
    requiredUpgrades: [{
      item: liveBuild.picks[0].item,
      currentLevel: liveBuild.picks[0].level - 1,
      requiredLevel: liveBuild.picks[0].level,
      addedLevels: 1,
    }],
  },
  profile,
  sharedData: localSharedData,
  plannerSettings: upgradesEnabledSettings,
  policy,
}), /includes gear upgrades/);
await assert.rejects(() => prepareHostedAccountEvidenceInput({
  build: { ...liveBuild, stats: { ...liveBuild.stats, hp: liveBuild.stats.hp + 1 } },
  profile,
  sharedData: localSharedData,
  plannerSettings,
  policy,
}));

const samuraiFixture = JSON.parse(await readFile(path.resolve(here, "canonical-samurai-preparation-fixture.json"), "utf8"));
const samuraiRecord = samuraiRecords[0];
const samuraiLoadout = samuraiFixture.loadout;
assert.equal(samuraiFixture.encounterId, samuraiRecord.scenario.encounterId);
assert.deepEqual(samuraiFixture.statsAll12, samuraiRecord.build.statsAll12);
const samuraiProfile = {
  version: 1,
  equipment: Object.fromEntries(samuraiLoadout.equipment.map(({ name, level }) => [name, level])),
  characters: [{
    id: samuraiLoadout.id,
    jobName: samuraiLoadout.jobName,
    rank: samuraiLoadout.rank,
    gender: samuraiLoadout.gender,
    statLevels: { ...samuraiLoadout.statLevels },
  }],
  valuables: { ...samuraiLoadout.residentStatItems },
};
const samuraiSlotLabel = { weapon: "Weapon", shield: "Shield", head: "Head", body: "Armor", accessory: "Accessory" };
const samuraiBuild = {
  characterId: samuraiLoadout.id,
  characterName: samuraiLoadout.name,
  jobName: samuraiLoadout.jobName,
  rank: samuraiLoadout.rank,
  skills: [...samuraiLoadout.skills],
  picks: samuraiRecord.build.gear.map(({ slot, name, level }) => ({ slot: samuraiSlotLabel[slot], item: name, level })),
  stats: { ...samuraiFixture.statsAll12 },
  addedLevels: 0,
  requiredUpgrades: [],
};
const samuraiSettings = { ...plannerSettings, encounterId: samuraiFixture.encounterId };
const samuraiPreparation = await prepareHostedAccountEvidenceInput({
  build: samuraiBuild,
  profile: samuraiProfile,
  sharedData: localSharedData,
  plannerSettings: samuraiSettings,
  policy,
});
assert.equal(samuraiPreparation.fingerprints.support, samuraiRecord.scenario.supportFingerprintSha256,
  "canonical Samurai support preparation matches the measured fingerprint");
assert.equal(samuraiPreparation.fingerprints.formation, samuraiRecord.scenario.formationFingerprintSha256,
  "canonical Samurai formation matches the measured fingerprint");
assert.equal(samuraiPreparation.fingerprints.encounter, samuraiRecord.scenario.encounterFingerprintSha256,
  "canonical Samurai encounter preparation matches the measured fingerprint");
assert.deepEqual(matchHostedAccountCombatEvidence(dataset, samuraiPreparation.lookupInput).map(({ cohortId }) => cohortId),
  [samuraiRecord.cohortId], "the anonymized actual-Samurai fixture returns only its exact cohort");
for (const mutate of [
  (query) => { query.build.stats.atk += 1; },
  (query) => { query.build.picks[0].level -= 1; },
  (query) => { query.orderedSkills.push("Shield Resistance"); query.skillInvocations.push(0); },
  (query) => { query.gender = 0; },
  (query) => { query.encounterId += 1; },
  (query) => { query.encounterFingerprintSha256 = "wrong"; },
]) {
  const changed = structuredClone(samuraiPreparation.lookupInput);
  mutate(changed);
  assert.deepEqual(matchHostedAccountCombatEvidence(dataset, changed), [],
    "a changed Samurai tuple/setup cannot borrow a nearby cohort");
}
console.log("Hosted account evidence exact-match checks passed.");
