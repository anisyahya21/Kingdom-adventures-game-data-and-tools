import { equipmentSlotForEntry, EQUIPMENT_BY_ID, type EquipmentSlotKey } from "@/lib/battle-setup";
import { resolveCombatEquipmentId } from "@/lib/battle-legality";
import { farmingDpsSkills, type FarmingPlannerSettings } from "@/lib/farming-planner";
import { INVOCATION_LEVELS } from "@/lib/battle-team-draft";
import type { ProfileGoalBuild } from "@/lib/profile-loadout-goal-planner";

const BASE_URL = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const EVIDENCE_URL = `${BASE_URL}hosted-account-evidence-v5.compact.json`;
const STAT_KEYS = ["hp", "mp", "vig", "atk", "def", "spd", "lck", "int", "dex", "gth", "mov", "hrt"] as const;
const SLOT_ORDER: EquipmentSlotKey[] = ["weapon", "shield", "head", "body", "accessory"];
const PLANNER_SLOT_TO_CANONICAL: Readonly<Record<string, EquipmentSlotKey>> = {
  Weapon: "weapon", Shield: "shield", Head: "head", Armor: "body", Accessory: "accessory",
};
const HIGH_INVOCATION = INVOCATION_LEVELS.find(({ label }) => label === "High")?.value ?? 0;
const POLICY_KEYS = ["herbAtDpsMpFraction", "maximumHerbs", "maximumTicks", "potions", "trainingAdmission", "windowTicks", "herbPhase"] as const;

type GearEvidence = { slot: EquipmentSlotKey; name: string; equipmentId: number; level: number };
type SkillEvidence = { label: string; invocationLevel: number; skillId: number };
type PolicyEvidence = Pick<FarmingPlannerSettings, "encounterId" | "holyHerbLimit" | "recoveryPotionLimit"> & {
  herbAtDpsMpFraction: number;
  maximumHerbs: number;
  maximumTicks: number;
  potions: number;
  trainingAdmission: boolean;
  windowTicks: number;
  herbPhase: string;
};
type NumericSummary = { n: number; mean: number; median: number; min: number; max: number };
type HostedOutcomeSummary = {
  modeledCallbacks: NumericSummary;
  callbackScope: string;
  survival: { survived: number; sampleSize: number; fraction: number };
  firstBossAttempt: { count: number; sampleSize?: number; fraction?: number; ticks: Array<number | null> };
  terminality: {
    terminalBattleVerdicts: Record<string, number>;
    terminalByVerdictAndDeparture: number;
    horizonCensored: number;
    horizonWithoutVerdict: number;
    allBattlesTerminal: boolean;
    completionReasons?: Record<string, number>;
    callbackMeanInterpretation: string;
  };
  dpsPaidMp: NumericSummary;
  herbsUsed: NumericSummary;
  preFirstBossAttemptGrossDpt?: NumericSummary;
  minimumDpsMpAfterPayment?: NumericSummary;
  mpReserveWarnings?: number;
};

type HostedRecord = {
  cohortId: string;
  caseId: string;
  evidenceClass: string;
  sample: { n: number; exploratory: boolean; seedPairs: Array<{ math: number; library: number }>; rows: unknown[] };
  build: { job: string; rank: string; gender: number; statsAll12: Record<string, number>; gear: GearEvidence[]; skills: SkillEvidence[] };
  scenario: {
    encounterId: number;
    tickLimit: number;
    supportMode: "fixed-synthetic-research-supports";
    supportFingerprintSha256: string;
    formationFingerprintSha256: string;
    encounterFingerprintSha256: string;
    supportCount: number;
    setupEquivalenceStatus: string;
  };
  policy: Omit<PolicyEvidence, "encounterId" | "holyHerbLimit" | "recoveryPotionLimit">;
  outcomeSummary: HostedOutcomeSummary;
  sourceAudit: Record<string, unknown>;
};

export type HostedEvidenceDataset = {
  schema: "hosted-measured-combat-evidence-draft-3";
  evidenceBankRevision: "v5";
  records: HostedRecord[];
};

export type HostedEvidenceLookupInput = {
  build: ProfileGoalBuild;
  gender: number;
  encounterId: number;
  /** Caller must identify this as the recorded synthetic research-support setup. */
  supportMode: "fixed-synthetic-research-supports";
  /** Hashes must come from the caller's prepared setup; matching them is not full-scene proof. */
  supportFingerprintSha256: string;
  formationFingerprintSha256: string;
  encounterFingerprintSha256: string;
  /** Optional exact ordered unit-skill selection; defaults to the canonical farming DPS order. */
  orderedSkills?: readonly string[];
  /** Omitted trigger levels default to the setup's High invocation value. */
  skillInvocations?: readonly number[];
  policy: Omit<PolicyEvidence, "encounterId" | "holyHerbLimit" | "recoveryPotionLimit">;
};

export type HostedEvidenceMatch = {
  cohortId: string;
  caseId: string;
  evidenceClass: "conditional-fixed-synthetic-support-diagnostics";
  sample: HostedRecord["sample"];
  build: HostedRecord["build"];
  scenario: HostedRecord["scenario"];
  policy: HostedRecord["policy"];
  outcomeSummary: HostedRecord["outcomeSummary"];
  sourceAudit: HostedRecord["sourceAudit"];
  caveat: string;
};

export type HostedEvidenceLoader = () => Promise<unknown>;

const CAVEAT = "Conditional fixed-synthetic-support diagnostics only. Exact build, setup fingerprints, encounter, and policy matched; this does not establish full prepared-scene equivalence, actual-team behavior, settled rewards, or transfer to nearby builds.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function validNumericSummary(value: unknown, n: number, allowPartial = false): value is NumericSummary {
  if (!isRecord(value) || !nonNegativeInteger(value.n) || value.n < 1 ||
      (allowPartial ? value.n > n : value.n !== n) || !finite(value.mean) || !finite(value.median) ||
      !finite(value.min) || !finite(value.max)) return false;
  return value.min <= value.median && value.median <= value.max && value.min <= value.mean && value.mean <= value.max;
}

function validRecord(value: unknown): value is HostedRecord {
  if (!isRecord(value) || typeof value.cohortId !== "string" || typeof value.caseId !== "string" ||
      !isRecord(value.sample) || !isRecord(value.build) || !isRecord(value.scenario) ||
      !isRecord(value.policy) || !isRecord(value.outcomeSummary) || !isRecord(value.sourceAudit)) return false;
  const sample = value.sample;
  if (!nonNegativeInteger(sample.n) || sample.n < 1 || sample.exploratory !== true ||
      !Array.isArray(sample.seedPairs) || sample.seedPairs.length !== sample.n ||
      !Array.isArray(sample.rows) || sample.rows.length !== sample.n) return false;
  const seedKeys = new Set<string>();
  for (const pair of sample.seedPairs) {
    if (!isRecord(pair) || !Number.isInteger(pair.math) || !Number.isInteger(pair.library)) return false;
    const key = `${pair.math}:${pair.library}`;
    if (seedKeys.has(key)) return false;
    seedKeys.add(key);
  }
  const build = value.build;
  if (typeof build.job !== "string" || typeof build.rank !== "string" || !Number.isInteger(build.gender) ||
      !isRecord(build.statsAll12) || Object.keys(build.statsAll12).length !== STAT_KEYS.length ||
      !STAT_KEYS.every((key) => finite((build.statsAll12 as Record<string, unknown>)[key])) || !Array.isArray(build.gear) ||
      build.gear.length !== SLOT_ORDER.length || !Array.isArray(build.skills) || build.skills.length === 0) return false;
  if (!build.gear.every((gear) => isRecord(gear) && SLOT_ORDER.includes(gear.slot as EquipmentSlotKey) &&
      typeof gear.name === "string" && Number.isInteger(gear.equipmentId) && Number.isInteger(gear.level)) ||
      !build.skills.every((skill) => isRecord(skill) && typeof skill.label === "string" &&
        Number.isInteger(skill.invocationLevel) && Number.isInteger(skill.skillId))) return false;
  const scenario = value.scenario;
  if (!Number.isInteger(scenario.encounterId) || !Number.isInteger(scenario.tickLimit) ||
      scenario.supportMode !== "fixed-synthetic-research-supports" ||
      ![scenario.supportFingerprintSha256, scenario.formationFingerprintSha256, scenario.encounterFingerprintSha256]
        .every((hash) => typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash)) ||
      scenario.supportCount !== 5 || typeof scenario.setupEquivalenceStatus !== "string") return false;
  const policy = value.policy;
  if (!POLICY_KEYS.every((key) => Object.hasOwn(policy, key)) ||
      !finite(policy.herbAtDpsMpFraction) || !nonNegativeInteger(policy.maximumHerbs) ||
      !nonNegativeInteger(policy.maximumTicks) || !nonNegativeInteger(policy.potions) ||
      typeof policy.trainingAdmission !== "boolean" || !nonNegativeInteger(policy.windowTicks) ||
      typeof policy.herbPhase !== "string") return false;

  const summary = value.outcomeSummary;
  if (typeof summary.callbackScope !== "string" || !validNumericSummary(summary.modeledCallbacks, sample.n) ||
      !isRecord(summary.survival) || !nonNegativeInteger(summary.survival.survived) ||
      summary.survival.sampleSize !== sample.n || summary.survival.survived > sample.n ||
      !finite(summary.survival.fraction) || summary.survival.fraction !== summary.survival.survived / sample.n ||
      !isRecord(summary.firstBossAttempt) || !nonNegativeInteger(summary.firstBossAttempt.count) ||
      summary.firstBossAttempt.count > sample.n || !Array.isArray(summary.firstBossAttempt.ticks) ||
      summary.firstBossAttempt.ticks.length !== sample.n ||
      !summary.firstBossAttempt.ticks.every((tick) => tick === null || finite(tick)) ||
      summary.firstBossAttempt.ticks.filter((tick) => tick !== null).length !== summary.firstBossAttempt.count ||
      !isRecord(summary.terminality) || !isRecord(summary.terminality.terminalBattleVerdicts) ||
      !Object.values(summary.terminality.terminalBattleVerdicts).every(nonNegativeInteger) ||
      !nonNegativeInteger(summary.terminality.terminalByVerdictAndDeparture) ||
      !nonNegativeInteger(summary.terminality.horizonCensored) ||
      !nonNegativeInteger(summary.terminality.horizonWithoutVerdict) ||
      summary.terminality.terminalByVerdictAndDeparture > sample.n ||
      summary.terminality.horizonCensored > sample.n ||
      summary.terminality.horizonWithoutVerdict > sample.n ||
      typeof summary.terminality.allBattlesTerminal !== "boolean" ||
      typeof summary.terminality.callbackMeanInterpretation !== "string" ||
      !validNumericSummary(summary.dpsPaidMp, sample.n) || !validNumericSummary(summary.herbsUsed, sample.n)) return false;
  if (summary.terminality.allBattlesTerminal !== (summary.terminality.terminalByVerdictAndDeparture === sample.n) ||
      summary.terminality.horizonCensored !== summary.terminality.horizonWithoutVerdict) return false;
  if (summary.preFirstBossAttemptGrossDpt !== undefined && !validNumericSummary(summary.preFirstBossAttemptGrossDpt, sample.n, true)) return false;
  if (summary.minimumDpsMpAfterPayment !== undefined && summary.minimumDpsMpAfterPayment !== null &&
      !validNumericSummary(summary.minimumDpsMpAfterPayment, sample.n)) return false;
  if (summary.mpReserveWarnings !== undefined && (!nonNegativeInteger(summary.mpReserveWarnings) || summary.mpReserveWarnings > sample.n)) return false;
  return value.sourceAudit.strictTraceAuditPassed === true;
}

function validateDataset(value: unknown): HostedEvidenceDataset {
  if (!isRecord(value) || value.schema !== "hosted-measured-combat-evidence-draft-3" ||
      value.evidenceBankRevision !== "v5" || !Array.isArray(value.records)) {
    throw new Error("Hosted combat evidence has an unsupported schema.");
  }
  if (value.records.length === 0 || !value.records.every(validRecord)) {
    throw new Error("Hosted combat evidence contains an invalid or incomplete record.");
  }
  return value as unknown as HostedEvidenceDataset;
}

function canonicalGear(rows: readonly { slot: string; item: string; level: number }[]): Array<{ slot: EquipmentSlotKey; name: string; level: number }> | null {
  if (rows.length !== SLOT_ORDER.length) return null;
  const result: Array<{ slot: EquipmentSlotKey; name: string; level: number }> = [];
  for (const row of rows) {
    const id = resolveCombatEquipmentId(row.item);
    const entry = id === null ? undefined : EQUIPMENT_BY_ID.get(id);
    if (!entry || !Number.isInteger(row.level) || row.level < 1 || row.level > 99) return null;
    const slot = equipmentSlotForEntry(entry);
    if (PLANNER_SLOT_TO_CANONICAL[row.slot] !== slot || result.some((item) => item.slot === slot)) return null;
    result.push({ slot, name: row.item, level: row.level });
  }
  if (SLOT_ORDER.some((slot) => !result.some((item) => item.slot === slot))) return null;
  return result.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
}

function candidateGear(rows: readonly GearEvidence[]): Array<{ slot: EquipmentSlotKey; name: string; level: number }> | null {
  if (rows.length !== SLOT_ORDER.length) return null;
  const plannerSlot: Record<EquipmentSlotKey, string> = {
    weapon: "Weapon", shield: "Shield", head: "Head", body: "Armor", accessory: "Accessory",
  };
  const canonical = canonicalGear(rows.map(({ slot, name, level }) => ({ slot: plannerSlot[slot], item: name, level })));
  if (!canonical || rows.some((row) => row.equipmentId !== resolveCombatEquipmentId(row.name))) return null;
  return canonical;
}

function exactBuildMatch(record: HostedRecord, input: HostedEvidenceLookupInput): boolean {
  const { build } = input;
  if (build.jobName !== record.build.job || build.rank !== record.build.rank || input.gender !== record.build.gender) return false;
  if (Object.keys(build.stats).length !== STAT_KEYS.length || Object.keys(record.build.statsAll12).length !== STAT_KEYS.length) return false;
  if (!STAT_KEYS.every((key) => Number.isFinite(build.stats[key]) && build.stats[key] === record.build.statsAll12[key])) return false;
  const gear = canonicalGear(build.picks);
  const expectedGear = candidateGear(record.build.gear);
  if (!gear || !expectedGear || JSON.stringify(gear) !== JSON.stringify(expectedGear)) return false;

  const skills = input.orderedSkills ? [...input.orderedSkills] : farmingDpsSkills(build.skills ?? []);
  const invocations = input.skillInvocations ? [...input.skillInvocations] : skills.map(() => HIGH_INVOCATION);
  if (skills.length !== invocations.length || skills.length !== record.build.skills.length) return false;
  return skills.every((name, index) => name === record.build.skills[index].label &&
    invocations[index] === record.build.skills[index].invocationLevel);
}

function exactSetupMatch(record: HostedRecord, input: HostedEvidenceLookupInput): boolean {
  if (input.supportMode !== "fixed-synthetic-research-supports" || record.scenario.supportMode !== input.supportMode) return false;
  if (input.encounterId !== record.scenario.encounterId || input.policy.maximumTicks !== record.scenario.tickLimit) return false;
  if (record.scenario.supportCount !== 5 || record.scenario.setupEquivalenceStatus !== "exact-input fingerprint only; cross-profile equivalence unvalidated") return false;
  if (input.supportFingerprintSha256 !== record.scenario.supportFingerprintSha256 ||
      input.formationFingerprintSha256 !== record.scenario.formationFingerprintSha256 ||
      input.encounterFingerprintSha256 !== record.scenario.encounterFingerprintSha256) return false;
  return POLICY_KEYS.every((key) => input.policy[key] === record.policy[key]);
}

export function matchHostedAccountCombatEvidence(
  dataset: HostedEvidenceDataset,
  input: HostedEvidenceLookupInput,
): HostedEvidenceMatch[] {
  return dataset.records
    .filter((record) => record.sourceAudit.strictTraceAuditPassed === true &&
      exactBuildMatch(record, input) && exactSetupMatch(record, input))
    .map((record) => ({
      cohortId: record.cohortId,
      caseId: record.caseId,
      evidenceClass: "conditional-fixed-synthetic-support-diagnostics",
      sample: record.sample,
      build: record.build,
      scenario: record.scenario,
      policy: record.policy,
      outcomeSummary: record.outcomeSummary,
      sourceAudit: record.sourceAudit,
      caveat: CAVEAT,
    }));
}

/** Construct a memoized lazy loader, also injectable for deterministic checks. */
export function createHostedAccountCombatEvidenceLookup(loader: HostedEvidenceLoader) {
  let pending: Promise<HostedEvidenceDataset> | undefined;
  const load = () => pending ??= loader().then(validateDataset);
  return {
    load,
    async find(input: HostedEvidenceLookupInput): Promise<HostedEvidenceMatch[]> {
      return matchHostedAccountCombatEvidence(await load(), input);
    },
  };
}

const browserLookup = createHostedAccountCombatEvidenceLookup(async () => {
  const response = await fetch(EVIDENCE_URL, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Hosted combat evidence could not be loaded (${response.status}).`);
  return response.json() as Promise<unknown>;
});

/** The public evidence file is fetched only when the caller requests a match. */
export function findHostedAccountCombatEvidence(input: HostedEvidenceLookupInput): Promise<HostedEvidenceMatch[]> {
  return browserLookup.find(input);
}

/** Load the same validated memoized dataset used by exact evidence lookups. */
export function loadHostedAccountCombatEvidenceDataset(): Promise<HostedEvidenceDataset> {
  return browserLookup.load();
}
