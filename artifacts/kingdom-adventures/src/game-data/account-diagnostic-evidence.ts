import { farmingDpsSkills } from "@/lib/farming-planner";
import type { ProfileGoalBuild } from "@/lib/profile-loadout-goal-planner";

type DiagnosticCase = {
  job: string;
  rank: string;
  gender: 0;
  stats: Record<string, number>;
  equipment: Array<{ equipmentName: string; level: number }>;
  skills: string[];
  invocations: number[];
  survivedRuns: number;
  sampleSize: number;
};

/** Compact projection of the audited 60-run account diagnostic; excludes account IDs and traces. */
export const ACCOUNT_DIAGNOSTIC_E3 = {
  encounterId: 3,
  source: "Anonymized account diagnostic; 60 fixed browser-runtime runs across three exact builds.",
  auditedTraceCount: 60,
  strictAnalysisSha256: "9f67a4f8e5da37bf70517e6142a37d5c0cc4338468737659a09e3a0f732d9c56",
  productionRuntimeArchiveSha256: "4a4b6df78674f57b9bf20232128f7c4719621f0c2f5a85f7531dd59d071ab7f3",
  cases: [
    {
      job: "Ninja", rank: "A", gender: 0,
      stats: { hp: 4226, mp: 1184, vig: 2505, atk: 822, def: 1726, spd: 696, lck: 400, int: 28, dex: 11, gth: 22, mov: 65, hrt: 9 },
      equipment: [
        { equipmentName: "D/ Ninja Headband", level: 99 }, { equipmentName: "C/ Silver Scalpel", level: 99 },
        { equipmentName: "S/ Wairo Shield", level: 99 }, { equipmentName: "E/ Durable Garment", level: 1 },
        { equipmentName: "B/ Red Ribbon", level: 19 },
      ],
      skills: ["Counter", "7-Hit Attack", "5-Hit Attack", "4-Hit Attack", "3-Hit Attack", "2-Hit Attack", "Shield Resistance"],
      invocations: [0, 0, 0, 0, 0, 0, 0], survivedRuns: 6, sampleSize: 20,
    },
    {
      job: "Ninja", rank: "A", gender: 0,
      stats: { hp: 4687, mp: 1636, vig: 2505, atk: 822, def: 2192, spd: 696, lck: 399, int: 28, dex: 11, gth: 22, mov: 65, hrt: 9 },
      equipment: [
        { equipmentName: "D/ Ninja Headband", level: 99 }, { equipmentName: "C/ Silver Scalpel", level: 99 },
        { equipmentName: "S/ Wairo Shield", level: 99 }, { equipmentName: "A/ Royal Robe", level: 90 },
        { equipmentName: "B/ Red Ribbon", level: 19 },
      ],
      skills: ["Counter", "7-Hit Attack", "5-Hit Attack", "4-Hit Attack", "3-Hit Attack", "2-Hit Attack", "Shield Resistance"],
      invocations: [0, 0, 0, 0, 0, 0, 0], survivedRuns: 14, sampleSize: 20,
    },
    {
      job: "Ninja", rank: "A", gender: 0,
      stats: { hp: 4727, mp: 1546, vig: 2539, atk: 726, def: 2114, spd: 696, lck: 399, int: 28, dex: 11, gth: 62, mov: 65, hrt: 9 },
      equipment: [
        { equipmentName: "D/ Ninja Headband", level: 99 }, { equipmentName: "C/ Silver Scalpel", level: 99 },
        { equipmentName: "S/ Wairo Shield", level: 99 }, { equipmentName: "A/ Royal Robe", level: 90 },
        { equipmentName: "B/ Charm", level: 5 },
      ],
      skills: ["Counter", "7-Hit Attack", "5-Hit Attack", "4-Hit Attack", "3-Hit Attack", "2-Hit Attack", "Shield Resistance"],
      invocations: [0, 0, 0, 0, 0, 0, 0], survivedRuns: 13, sampleSize: 20,
    },
  ],
  policy: "Fixed synthetic healer and four fodders; at most 10 Holy Herbs at 20% DPS MP using a 200-tick sample window; 0 potions; finite HP/MP.",
} as const satisfies { encounterId: number; source: string; auditedTraceCount: number; strictAnalysisSha256: string; productionRuntimeArchiveSha256: string; cases: readonly DiagnosticCase[]; policy: string };

const STAT_KEYS = ["hp", "mp", "vig", "atk", "def", "spd", "lck", "int", "dex", "gth", "mov", "hrt"] as const;

export function sameOrderedSkillEvidence(actualSkills: readonly string[], actualInvocations: readonly number[], expectedSkills: readonly string[], expectedInvocations: readonly number[]): boolean {
  return JSON.stringify(actualSkills) === JSON.stringify(expectedSkills) &&
    JSON.stringify(actualInvocations) === JSON.stringify(expectedInvocations);
}

/** Only exact scenario identity earns this conditional annotation; nearby builds stay unannotated. */
export function exactAccountDiagnosticCase(
  encounterId: number,
  build: ProfileGoalBuild,
  gender: number | undefined,
): DiagnosticCase | null {
  if (encounterId !== ACCOUNT_DIAGNOSTIC_E3.encounterId || gender === undefined) return null;
  return ACCOUNT_DIAGNOSTIC_E3.cases.find((candidate) => {
    if (build.jobName !== candidate.job || build.rank !== candidate.rank || gender !== candidate.gender) return false;
    if (!STAT_KEYS.every((key) => build.stats[key] === candidate.stats[key])) return false;
    const equipment = build.picks.map(({ item, level }) => ({ equipmentName: item, level }))
      .sort((a, b) => a.equipmentName.localeCompare(b.equipmentName));
    const expectedEquipment = [...candidate.equipment].sort((a, b) => a.equipmentName.localeCompare(b.equipmentName));
    if (JSON.stringify(equipment) !== JSON.stringify(expectedEquipment)) return false;
    const skills = farmingDpsSkills(build.skills ?? []);
    // Profile builds carry required skills, not invocation data; farming defaults are all level 0.
    return sameOrderedSkillEvidence(skills, skills.map(() => 0), candidate.skills, candidate.invocations);
  }) ?? null;
}
