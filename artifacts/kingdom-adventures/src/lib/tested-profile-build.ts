import { farmingDpsSkills } from "@/lib/farming-planner";
import type { PlayerProfile } from "@/lib/player-profile";
import type { ProfileGoalBuild } from "@/lib/profile-loadout-goal-planner";

export type TestedProfileCandidate = {
  status: "pending" | "active";
  encounterId: number;
  job: string;
  rank: string;
  gender: number;
  stats: Record<string, number>;
  equipment: readonly { slot: string; item: string; level: number }[];
  requiredSkills: readonly string[];
  skills: readonly string[];
  invocations: readonly number[];
  sampleSize: number;
  survivedRuns: number | null;
  medianCallbacks?: number | null;
  medianHerbsUsed?: number | null;
  averageCallbacks?: number | null;
  highestCallbacks?: number | null;
  atMostOneCallbackRuns?: number | null;
  evidenceSha256?: string;
  horizonSeconds?: number;
  displayKind?: "primary" | "resource-alternative";
  controlEvidenceSha256?: string;
  pairedCallbackDelta?: { mean: number; lower: number; upper: number };
  completedRuns?: number;
  averageHerbsUsed?: number;
  averagePaidMp?: number;
  policy: { placeholderSupports: boolean; encounterId: number; holyHerbLimit: number; recoveryPotionLimit: number; finiteHpMp: boolean };
};

const STAT_KEYS = ["hp", "mp", "vig", "atk", "def", "spd", "lck", "int", "dex", "gth", "mov", "hrt"] as const;

export function projectTestedProfileBuild(
  profile: PlayerProfile,
  candidate: TestedProfileCandidate,
  calculateStats: (character: PlayerProfile["characters"][number], equipment: readonly { slot: string; item: string; level: number }[]) => Record<string, number> | null,
  legalEquipment: (character: PlayerProfile["characters"][number], item: string) => boolean,
  legalSkills: (character: PlayerProfile["characters"][number], skills: readonly string[]) => boolean,
): ProfileGoalBuild | null {
  const equipment = [...candidate.equipment];
  if (new Set(equipment.map(({ slot }) => slot)).size !== equipment.length || new Set(equipment.map(({ item }) => item)).size !== equipment.length) return null;
  const orderedSkills = farmingDpsSkills([...candidate.requiredSkills]);
  if (JSON.stringify(orderedSkills) !== JSON.stringify(candidate.skills) || candidate.invocations.length !== orderedSkills.length || candidate.invocations.some((level) => level !== 0)) return null;
  for (const character of profile.characters) {
    if (character.jobName !== candidate.job || character.rank !== candidate.rank || character.gender !== candidate.gender) continue;
    if (!equipment.every(({ item, level }) => profile.equipment[item] === level && legalEquipment(character, item))) continue;
    if (!legalSkills(character, candidate.requiredSkills)) continue;
    const stats = calculateStats(character, equipment);
    if (!stats || !STAT_KEYS.every((key) => stats[key] === candidate.stats[key])) continue;
    return {
      characterId: character.id,
      characterName: character.jobName,
      jobName: character.jobName,
      rank: character.rank,
      skills: [...candidate.requiredSkills],
      picks: equipment.map(({ slot, item, level }) => ({ slot, item, level })),
      stats,
      addedLevels: 0,
      requiredUpgrades: [],
    };
  }
  return null;
}

export function projectTestedProfileBuildCandidates(
  profile: PlayerProfile,
  candidates: readonly TestedProfileCandidate[],
  calculateStats: (candidate: TestedProfileCandidate, character: PlayerProfile["characters"][number], equipment: readonly { slot: string; item: string; level: number }[]) => Record<string, number> | null,
  legalEquipment: (candidate: TestedProfileCandidate, character: PlayerProfile["characters"][number], item: string) => boolean,
  legalSkills: (candidate: TestedProfileCandidate, character: PlayerProfile["characters"][number], skills: readonly string[]) => boolean,
) {
  return candidates.flatMap((candidate) => {
    const build = projectTestedProfileBuild(profile, candidate,
      (character, equipment) => calculateStats(candidate, character, equipment),
      (character, item) => legalEquipment(candidate, character, item),
      (character, skills) => legalSkills(candidate, character, skills));
    return build ? [{ candidate, build }] : [];
  });
}

/** Display requires the exact synthetic-support finite-resource scenario and at least 20 audited runs. */
export function testedProfileEvidenceVisible(candidate: TestedProfileCandidate, setup: {
  encounterId: number; placeholderSupports: boolean; allowConsumables: boolean; holyHerbLimit: number; recoveryPotionLimit: number; finiteHpMp: boolean;
}): boolean {
  return candidate.status === "active" && Number.isInteger(candidate.sampleSize) && candidate.sampleSize >= 20 &&
    Number.isInteger(candidate.survivedRuns) && candidate.survivedRuns! >= 0 && candidate.survivedRuns! <= candidate.sampleSize &&
    Number.isFinite(candidate.medianCallbacks) && candidate.medianCallbacks! >= 0 &&
    Number.isFinite(candidate.medianHerbsUsed) && candidate.medianHerbsUsed! >= 0 &&
    Number.isFinite(candidate.averageCallbacks) && candidate.averageCallbacks! >= 0 &&
    Number.isFinite(candidate.highestCallbacks) && candidate.highestCallbacks! >= candidate.averageCallbacks! &&
    Number.isInteger(candidate.atMostOneCallbackRuns) && candidate.atMostOneCallbackRuns! >= 0 && candidate.atMostOneCallbackRuns! <= candidate.sampleSize &&
    /^[a-f0-9]{64}$/.test(candidate.evidenceSha256 ?? "") &&
    setup.encounterId === candidate.encounterId && setup.encounterId === candidate.policy.encounterId &&
    setup.placeholderSupports === candidate.policy.placeholderSupports && setup.placeholderSupports &&
    setup.allowConsumables &&
    setup.holyHerbLimit === candidate.policy.holyHerbLimit && setup.holyHerbLimit === 10 &&
    setup.recoveryPotionLimit === candidate.policy.recoveryPotionLimit && setup.recoveryPotionLimit === 0 &&
    setup.finiteHpMp === candidate.policy.finiteHpMp && setup.finiteHpMp;
}
