import { CANONICAL_RECOVERY_ITEMS, declaredItemRows } from "@/lib/battle-setup";
import { battleSetupToCombatScenario } from "@/lib/battle-setup-adapter";
import {
  battleSetupFromLoadouts,
  type SavedLoadout,
  type SharedLoadoutData,
} from "@/lib/battle-legality";
import { draftStatRows, type BuilderSharedData } from "@/lib/battle-team-draft";
import { applyFarmingResearchSupports, farmingResearchSupportLoadouts } from "@/lib/farming-research-supports";
import { farmingConsumableStock, farmingDpsSkills, type FarmingPlannerSettings } from "@/lib/farming-planner";
import { profileResidentStatItems, type PlayerProfile } from "@/lib/player-profile";
import type { ProfileGoalBuild } from "@/lib/profile-loadout-goal-planner";
import { STAT_KEYS } from "@/game-data/stat-parameter-ids";
import { INVOCATION_LEVELS } from "@/lib/battle-team-draft";
import type { HostedEvidenceLookupInput } from "@/game-data/hosted-account-combat-evidence";

const HIGH_INVOCATION = INVOCATION_LEVELS.find(({ label }) => label === "High")?.value;
const HERB_NAME = "Holy Herb";
export const HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY: HostedEvidenceLookupInput["policy"] = {
  herbAtDpsMpFraction: 0.2,
  maximumHerbs: 10,
  maximumTicks: 18_000,
  potions: 0,
  trainingAdmission: false,
  windowTicks: 200,
  herbPhase: "after_fighters",
} as const;

export type HostedEvidencePreparationRequest = {
  build: ProfileGoalBuild;
  profile: PlayerProfile;
  sharedData: SharedLoadoutData;
  plannerSettings: FarmingPlannerSettings;
  /** Resource/runner settings are explicit inputs and must match the supported fixed policy. */
  policy: HostedEvidenceLookupInput["policy"];
};

export type HostedEvidencePreparation = {
  lookupInput: HostedEvidenceLookupInput;
  fingerprints: {
    support: string;
    formation: string;
    encounter: string;
  };
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${entries.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

async function canonicalSha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableStringify(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fail(message: string): never {
  throw new Error(`Hosted combat evidence setup unavailable: ${message}`);
}

/**
 * Rebuild the exact live farming handoff through canonical profile/stat/loadout/setup adapters.
 * This establishes input-fingerprint equality only; it does not prove prepared-scene equivalence.
 */
export async function prepareHostedAccountEvidenceInput(
  request: HostedEvidencePreparationRequest,
): Promise<HostedEvidencePreparation> {
  const { build, profile, sharedData, plannerSettings, policy } = request;
  const character = profile.characters.find(({ id }) => id === build.characterId);
  if (!character) return fail("the build character is absent from the current profile");
  if (character.jobName !== build.jobName || character.rank !== build.rank || character.gender === undefined) {
    return fail("the build job, rank, or declared gender differs from the current profile character");
  }
  if (build.addedLevels !== 0 || build.requiredUpgrades.length !== 0) return fail("the build includes gear upgrades");
  if (Object.keys(build.stats).length !== STAT_KEYS.length || !STAT_KEYS.every((key) => Number.isFinite(build.stats[key]))) {
    return fail("the build does not contain exactly the twelve finite canonical stats");
  }
  if (!build.picks.length || build.picks.some(({ item, level }) => profile.equipment[item] !== level)) {
    return fail("the build gear does not match current owned equipment levels");
  }
  if (plannerSettings.useProfile !== true || plannerSettings.placeholderSupports !== true ||
      plannerSettings.allowConsumables !== true || plannerSettings.levelUpGear || plannerSettings.trainCharacters ||
      plannerSettings.holyHerbLimit !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.maximumHerbs ||
      plannerSettings.recoveryPotionLimit !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.potions) {
    return fail("planner settings are outside the supported profile/synthetic-support/finite-consumable mode");
  }
  if (HIGH_INVOCATION === undefined) return fail("canonical High skill invocation could not be resolved");
  if (policy.maximumHerbs !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.maximumHerbs || policy.maximumTicks !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.maximumTicks ||
      policy.potions !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.potions || policy.herbAtDpsMpFraction !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.herbAtDpsMpFraction ||
      policy.windowTicks !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.windowTicks || policy.herbPhase !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.herbPhase ||
      policy.trainingAdmission !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.trainingAdmission) {
    return fail("the requested runner resource policy does not match the supported finite-herb policy");
  }

  const requiredSkills = farmingDpsSkills([...(build.skills ?? [])]);
  const dpsLoadout: SavedLoadout = {
    id: character.id,
    name: build.characterName || character.jobName,
    jobName: character.jobName,
    rank: character.rank,
    gender: character.gender,
    statLevels: { ...character.statLevels },
    equipment: build.picks.map(({ item, level }) => ({ name: item, level })),
    skills: requiredSkills,
    skillInvocations: requiredSkills.map(() => HIGH_INVOCATION),
    residentStatItems: profileResidentStatItems(profile),
  };
  const statRows = draftStatRows(dpsLoadout, sharedData as BuilderSharedData);
  const recomputedStats = Object.fromEntries(statRows.map(({ stat, total }) => [stat, total]));
  if (!STAT_KEYS.every((key) => Number.isFinite(recomputedStats[key]) && recomputedStats[key] === build.stats[key])) {
    return fail("canonical profile/loadout stat recomputation differs from the build's twelve stats");
  }

  const consumables = farmingConsumableStock(plannerSettings);
  if (consumables.holyHerbStock !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.maximumHerbs || consumables.itemStock["Recovery Potion (L)"] !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.potions) {
    return fail("canonical finite consumable stock does not match ten herbs and zero recovery potions");
  }
  const itemRows = declaredItemRows(CANONICAL_RECOVERY_ITEMS.filter(({ name }) => name !== HERB_NAME));
  const converted = battleSetupFromLoadouts(
    [dpsLoadout, ...farmingResearchSupportLoadouts()],
    sharedData,
    {
      encounterId: plannerSettings.encounterId,
      tickLimit: policy.maximumTicks,
      holyHerbStock: consumables.holyHerbStock,
      items: itemRows,
      itemStock: consumables.itemStock,
      partyMax: 6,
    },
  );
  if (!converted.setup || converted.issues.some(({ category }) => category === "ERROR")) {
    return fail("canonical SavedLoadout conversion did not produce a legal six-human setup");
  }
  const setup = applyFarmingResearchSupports(converted.setup);
  if (setup.playerTeam.length !== 6 || setup.playerTeam[0]?.kind !== "human" ||
      setup.holyHerbStock !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.maximumHerbs || setup.itemStock?.["Recovery Potion (L)"] !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.potions ||
      setup.horizon.tickLimit !== HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY.maximumTicks) {
    return fail("prepared setup does not preserve the required six-unit finite-resource inputs");
  }
  const { scenario } = battleSetupToCombatScenario(setup);
  const supportHash = await canonicalSha256(scenario.ownUnits.slice(1).map(({ name: _name, ...unit }) => unit));
  const formationFields = ["human", "monsterId", "grid", "column", "row", "cell", "leaderIdentity", "visitor"] as const;
  const formationHash = await canonicalSha256(scenario.ownUnits.map((unit) => {
    const row = unit as unknown as Record<string, unknown>;
    return Object.fromEntries(formationFields.map((key) => [key, row[key] ?? null]));
  }));
  const encounterFields = ["encounterId", "defeatCount", "startProfile", "inputs", "finishPolicy"] as const;
  const encounterHash = await canonicalSha256(Object.fromEntries(
    encounterFields.map((key) => [key, scenario[key] ?? null]),
  ));

  return {
    fingerprints: { support: supportHash, formation: formationHash, encounter: encounterHash },
    lookupInput: {
      build,
      gender: character.gender,
      encounterId: plannerSettings.encounterId,
      supportMode: "fixed-synthetic-research-supports",
      supportFingerprintSha256: supportHash,
      formationFingerprintSha256: formationHash,
      encounterFingerprintSha256: encounterHash,
      orderedSkills: requiredSkills,
      skillInvocations: requiredSkills.map(() => HIGH_INVOCATION),
      policy,
    },
  };
}
