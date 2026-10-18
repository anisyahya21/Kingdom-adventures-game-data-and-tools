import type { HostedEvidenceDataset, HostedEvidenceMatch } from "@/game-data/hosted-account-combat-evidence";
import { draftStatRows, type BuilderSharedData } from "@/lib/battle-team-draft";
import { loadoutEquipment, loadoutSkills, type SavedLoadout, type SharedLoadoutData } from "@/lib/battle-legality";
import type { FarmingPlannerSettings } from "@/lib/farming-planner";
import { profileResidentStatItems, type PlayerProfile } from "@/lib/player-profile";
import type { ProfileGoalBuild } from "@/lib/profile-loadout-goal-planner";
import { STAT_KEYS } from "@/game-data/stat-parameter-ids";
import { farmingDpsSkills } from "@/lib/farming-planner";
import { favoriteFingerprint } from "@/lib/farming-favorites";

const SLOT_LABEL: Record<string, string> = {
  weapon: "Weapon", shield: "Shield", head: "Head", body: "Armor", accessory: "Accessory",
};

/** A legal profile projection of a hosted recipe; it carries no outcome or safety score. */
export type HostedRecipeProfileCandidate = {
  sourceKind: "hosted-recipe";
  recipeId: string;
  cohortIds: string[];
  caseIds: string[];
  skills: string[];
  skillInvocations: number[];
  build: ProfileGoalBuild;
};

export type HostedRecipeEvidenceOrder = {
  kind: "no-observed-deaths" | "incomplete-first-boss-attempt" | "observed-deaths" | "unmatched";
  largestNoDeathSample: number;
};

export type HostedEvidenceScopeState<TProfile, TShared, TSettings> = {
  profile: TProfile; sharedData: TShared; settings: TSettings;
  matches: Record<string, HostedEvidenceMatch[]>;
};

const EMPTY_HOSTED_EVIDENCE_BY_FINGERPRINT: Record<string, HostedEvidenceMatch[]> = {};

/** Stable empty fallback prevents result-card memo/effect churn while a recipe lookup is pending. */
export function hostedEvidenceMatchesForScope<TProfile, TShared, TSettings>(
  state: HostedEvidenceScopeState<TProfile, TShared, TSettings> | null,
  profile: TProfile | null,
  sharedData: TShared | null | undefined,
  settings: TSettings | null | undefined,
): Record<string, HostedEvidenceMatch[]> {
  return state && state.profile === profile && state.sharedData === sharedData && state.settings === settings
    ? state.matches : EMPTY_HOSTED_EVIDENCE_BY_FINGERPRINT;
}

/** Cohorts stay separate; a death in any exact matching cohort prevents a no-death promotion. */
export function hostedRecipeEvidenceOrder(matches: readonly HostedEvidenceMatch[]): HostedRecipeEvidenceOrder {
  if (matches.length === 0) return { kind: "unmatched", largestNoDeathSample: 0 };
  if (matches.some(({ outcomeSummary }) => outcomeSummary.survival.survived < outcomeSummary.survival.sampleSize)) {
    return { kind: "observed-deaths", largestNoDeathSample: 0 };
  }
  if (matches.some(({ outcomeSummary }) => outcomeSummary.firstBossAttempt.count !== outcomeSummary.firstBossAttempt.sampleSize)) {
    return { kind: "incomplete-first-boss-attempt", largestNoDeathSample: 0 };
  }
  // “No observed deaths” is an endpoint classification only when every sampled run reaches the
  // first DPS boss attack; terminality and horizon censoring remain separately displayed.
  return { kind: "no-observed-deaths", largestNoDeathSample: Math.max(...matches.map(({ sample }) => sample.n)) };
}

export function compareHostedRecipeEvidenceOrder(a: HostedRecipeEvidenceOrder, b: HostedRecipeEvidenceOrder): number {
  const tier = { "no-observed-deaths": 0, "incomplete-first-boss-attempt": 1, unmatched: 2, "observed-deaths": 3 } as const;
  const order = tier[a.kind] - tier[b.kind];
  if (order !== 0) return order;
  if (a.kind === "no-observed-deaths" && b.kind === "no-observed-deaths") return b.largestNoDeathSample - a.largestNoDeathSample;
  return 0;
}

/** Candidate identity uses the same canonical six farming skills as simulation handoff. */
export function profileFarmingBuildFingerprint(build: ProfileGoalBuild, profile: PlayerProfile): string {
  return favoriteFingerprint({ ...build, skills: farmingDpsSkills([...(build.skills ?? [])]) }, profile);
}

type HostedRecipeRecord = HostedEvidenceDataset["records"][number];

function recipeKey(record: HostedRecipeRecord): string {
  const gear = [...record.build.gear].sort((a, b) => a.slot.localeCompare(b.slot))
    .map(({ slot, name, level }) => [slot, name, level]);
  const skills = record.build.skills.map(({ label, invocationLevel }) => [label, invocationLevel]);
  return JSON.stringify([record.build.job, record.build.rank, record.build.gender, gear, skills]);
}

function allStats(rows: ReturnType<typeof draftStatRows>): Record<string, number> | null {
  const values = Object.fromEntries(rows.map(({ stat, total }) => [stat, total]));
  return STAT_KEYS.every((key) => Number.isFinite(values[key])) ? values as Record<string, number> : null;
}

/**
 * Project only the finite hosted recipe bank onto the player's current profile. This does not
 * search gear combinations and deliberately leaves measured outcomes to the exact evidence matcher.
 */
export function projectHostedRecipeProfileCandidates(
  dataset: HostedEvidenceDataset,
  profile: PlayerProfile,
  sharedData: SharedLoadoutData,
  settings: FarmingPlannerSettings,
  exactOnly = false,
): HostedRecipeProfileCandidate[] {
  if (!settings.useProfile || !Array.isArray(dataset.records)) return [];

  const recipes = new Map<string, { record: HostedRecipeRecord; cohortIds: Set<string>; caseIds: Set<string> }>();
  for (const record of dataset.records) {
    if (record.sourceAudit.strictTraceAuditPassed !== true) continue;
    const key = recipeKey(record);
    const existing = recipes.get(key);
    if (existing) {
      existing.cohortIds.add(record.cohortId);
      existing.caseIds.add(record.caseId);
    } else recipes.set(key, { record, cohortIds: new Set([record.cohortId]), caseIds: new Set([record.caseId]) });
  }

  const candidates: HostedRecipeProfileCandidate[] = [];
  const emitted = new Set<string>();
  for (const [key, recipe] of recipes) {
    const record = recipe.record;
    if (record.scenario.encounterId !== settings.encounterId) continue;
    const skills = record.build.skills.map(({ label }) => label);
    const skillInvocations = record.build.skills.map(({ invocationLevel }) => invocationLevel);
    if (skills.length === 0 || skills.length !== skillInvocations.length ||
        skillInvocations.some((level) => !Number.isInteger(level) || level < 0 || level > 2)) continue;

    for (const gearMode of settings.levelUpGear ? ["owned", "upgrade"] as const : ["owned"] as const) {
      const picks: ProfileGoalBuild["picks"] = [];
      const gear: SavedLoadout["equipment"] = [];
      let addedLevels = 0;
      const requiredUpgrades: ProfileGoalBuild["requiredUpgrades"] = [];
      let blocked = false;
      for (const item of record.build.gear) {
        const slot = SLOT_LABEL[item.slot];
        const ownedLevel = profile.equipment[item.name];
        if (!slot || !Number.isInteger(ownedLevel) || ownedLevel < 1 || settings.reservedEquipment.includes(item.name)) {
          blocked = true;
          break;
        }
        // Use the player's actual level; optional upgrades are a separate candidate, never a downgrade.
        const level = gearMode === "owned" ? ownedLevel : Math.max(ownedLevel, item.level);
        if (level > ownedLevel) {
          const requestedMax = Number.parseInt(settings.maxGearLevel, 10);
          const maxLevel = Number.isFinite(requestedMax) ? Math.min(99, Math.max(1, requestedMax)) : 99;
          if (level > maxLevel) {
            blocked = true;
            break;
          }
          const levelsAdded = level - ownedLevel;
          addedLevels += levelsAdded;
          requiredUpgrades.push({ item: item.name, currentLevel: ownedLevel, requiredLevel: level, addedLevels: levelsAdded });
        }
        picks.push({ slot, item: item.name, level });
        gear.push({ name: item.name, level });
      }
      if (blocked || picks.length !== record.build.gear.length) continue;

      for (const character of profile.characters) {
        if (settings.excludedCharacters.includes(character.id)) continue;
        const loadout: SavedLoadout = {
          id: character.id,
          name: character.jobName,
          jobName: character.jobName,
          rank: character.rank,
          gender: character.gender,
          statLevels: { ...character.statLevels },
          equipment: gear,
          skills,
          skillInvocations,
          residentStatItems: profileResidentStatItems(profile),
        };
        const equipmentResult = loadoutEquipment(loadout, sharedData);
        if (equipmentResult.issues.some(({ category }) => category === "ERROR")) continue;
        const skillResult = loadoutSkills(loadout);
        // A recipe is emitted only when the canonical converter resolves each exact skill without
        // an error or unknown CanSetSkill admission. Rank-mismatch notes are allowed because the
        // recovered CanSetSkill gate has no rank condition. No missing skill is added to legalize gear.
        if (skillResult.issues.some(({ category, code }) => category === "ERROR" || code === "SKILL_JOB_GROUP_UNKNOWN")) continue;
        const stats = allStats(draftStatRows(loadout, sharedData as BuilderSharedData));
        if (!stats) continue;
        if (exactOnly && (stats.atk !== record.build.statsAll12.atk || stats.spd !== record.build.statsAll12.spd ||
            stats.lck !== record.build.statsAll12.lck || stats.dex !== record.build.statsAll12.dex)) continue;

        const fingerprint = `${character.id}|${key}|${JSON.stringify(picks)}`;
        if (emitted.has(fingerprint)) continue;
        emitted.add(fingerprint);
        candidates.push({
          sourceKind: "hosted-recipe",
          recipeId: `hosted-recipe:${key}`,
          cohortIds: [...recipe.cohortIds].sort(),
          caseIds: [...recipe.caseIds].sort(),
          skills: [...skills],
          skillInvocations: [...skillInvocations],
          build: {
            characterId: character.id,
            characterName: character.jobName,
            jobName: character.jobName,
            rank: character.rank,
            skills: [...skills],
            picks,
            stats,
            addedLevels,
            requiredUpgrades,
          },
        });
      }
    }
  }
  return candidates;
}
