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

type LiveBuildPilotCase = DiagnosticCase & {
  caseId: string;
  evidenceClass: "live-build-pilot";
  firstDpsHpZeroTicks: readonly number[];
  firstDpsBossAttackTicks: readonly (number | null)[];
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

/** Separate three-seed live-account build pilot; not pooled with the 60-run diagnostic above. */
export const ACCOUNT_LIVE_BUILD_PILOT_E3 = {
  encounterId: 3,
  source: "Anonymized exact live-profile build; three strict-audited browser-runtime pilot runs with fixed synthetic supports.",
  evidenceClass: "exploratory-three-seed-pilot; not population reliability, settled rewards, or training admission",
  caseId: "live-leading-current",
  auditedTraceCount: 3,
  strictAnalysisSha256: "d712c5e71bdab8040ce3378331d0ee560ca2f3b25d71e6d841d022736fdfe7d8",
  productionRuntimeArchiveSha256: "4a4b6df78674f57b9bf20232128f7c4719621f0c2f5a85f7531dd59d071ab7f3",
  driverSha256: "3368f4c92408c0a900fa7d2c75cfdf36edb8ec9c1e972494c16a3e126920197a",
  seeds: [
    { mathSeed: 170200, libSeed: 270200, traceSha256: "711048f533afa1735971b03f0f7a49df98a2b7dbb6da08ff70026669feb46fd5" },
    { mathSeed: 170201, libSeed: 270201, traceSha256: "58bef7b70679ec5c87bd6f5ea09bee6674e1994d5f8cc3af081e119134ce606e" },
    { mathSeed: 170202, libSeed: 270202, traceSha256: "a14f7ebed3611ae08d2eeaaa06830f70b5a8cf102af604f7785a3dbb50149f45" },
  ],
  policy: "Extreme encounter 3; 18,000-tick horizon; fixed synthetic healer and four fodders; at most 10 Holy Herbs at 20% DPS MP with a 200-tick after-fighters sample window; 0 potions; finite HP/MP.",
  scenarioCaveat: "Three seeds only: the modeled DPS died before its first boss attack in 3/3 runs (first observed HP-zero ticks 583, 1640, and 947). Fixed synthetic supports were used; this is not population reliability, settled reward evidence, or a simulation of the actual account team.",
  cases: [
    {
      job: "Ninja", rank: "A", gender: 0,
      stats: { hp: 3999, mp: 1636, vig: 1711, atk: 542, def: 1499, spd: 412, lck: 218, int: 28, dex: 11, gth: 22, mov: 65, hrt: 9 },
      equipment: [
        { equipmentName: "D/ Ninja Headband", level: 99 }, { equipmentName: "A/ Immortal Sword", level: 1 },
        { equipmentName: "B/ Legendary Shield (B)", level: 60 }, { equipmentName: "A/ Royal Robe", level: 90 },
        { equipmentName: "B/ Red Ribbon", level: 19 },
      ],
      skills: ["Counter", "7-Hit Attack", "5-Hit Attack", "4-Hit Attack", "3-Hit Attack", "2-Hit Attack"],
      invocations: [0, 0, 0, 0, 0, 0], survivedRuns: 0, sampleSize: 3,
      caseId: "live-leading-current", evidenceClass: "live-build-pilot",
      firstDpsHpZeroTicks: [583, 1640, 947], firstDpsBossAttackTicks: [null, null, null],
    },
  ],
} as const satisfies {
  encounterId: number; source: string; evidenceClass: string; caseId: string; auditedTraceCount: number;
  strictAnalysisSha256: string; productionRuntimeArchiveSha256: string; driverSha256: string;
  seeds: readonly { mathSeed: number; libSeed: number; traceSha256: string }[];
  policy: string; scenarioCaveat: string; cases: readonly LiveBuildPilotCase[];
};

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
): DiagnosticCase | LiveBuildPilotCase | null {
  if (gender === undefined) return null;
  const candidates: readonly (DiagnosticCase | LiveBuildPilotCase)[] = [
    ...(encounterId === ACCOUNT_DIAGNOSTIC_E3.encounterId ? ACCOUNT_DIAGNOSTIC_E3.cases : []),
    ...(encounterId === ACCOUNT_LIVE_BUILD_PILOT_E3.encounterId ? ACCOUNT_LIVE_BUILD_PILOT_E3.cases : []),
  ];
  return candidates.find((candidate) => {
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

export function accountDiagnosticLabel(diagnostic: DiagnosticCase | LiveBuildPilotCase): string {
  if ("evidenceClass" in diagnostic && diagnostic.evidenceClass === "live-build-pilot") {
    return "Failed pilot: DPS died before attacking the boss in 3/3 modeled tests";
  }
  return `Fixed-support diagnostic: DPS survived ${diagnostic.survivedRuns}/${diagnostic.sampleSize}`;
}

export function accountDiagnosticScenario(diagnostic: DiagnosticCase | LiveBuildPilotCase): string {
  if ("evidenceClass" in diagnostic && diagnostic.evidenceClass === "live-build-pilot") {
    return `${ACCOUNT_LIVE_BUILD_PILOT_E3.source} ${ACCOUNT_LIVE_BUILD_PILOT_E3.policy} ${ACCOUNT_LIVE_BUILD_PILOT_E3.scenarioCaveat}`;
  }
  return `${ACCOUNT_DIAGNOSTIC_E3.source} ${ACCOUNT_DIAGNOSTIC_E3.policy} User team not measured. This conditional small-sample diagnostic does not change fixed-research reward averages or ranking.`;
}

/** A conservative ordering signal only for the tested finite-resource support setup. */
export function accountDiagnosticFailedPilotApplies(
  diagnostic: DiagnosticCase | LiveBuildPilotCase | null,
  encounterId: number,
  setup?: { encounterId: number; placeholderSupports: boolean; finiteHpMp: boolean; allowConsumables: boolean; holyHerbLimit: number; recoveryPotionLimit: number },
): boolean {
  return !!diagnostic && "evidenceClass" in diagnostic && diagnostic.evidenceClass === "live-build-pilot" &&
    setup?.encounterId === encounterId && setup.placeholderSupports && setup.finiteHpMp &&
    setup.allowConsumables && setup.holyHerbLimit === 10 && setup.recoveryPotionLimit === 0;
}
