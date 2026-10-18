/** Exact profile E3 diagnostic: frozen paired seeds 170200–170219 / 270200–270219.
 * Source: confirmation2-first20-analysis.json. Conditional callbacks, never settled Earned. */
export const TESTED_PROFILE_BUILD_CANDIDATE = {
  status: "active" as const,
  encounterId: 3,
  job: "Ninja",
  rank: "A",
  gender: 0,
  stats: { hp: 6102, mp: 1636, vig: 3100, atk: 747, def: 2818, spd: 615, lck: 98, int: 28, dex: 11, gth: 22, mov: 65, hrt: 9 },
  equipment: [
    { slot: "Head", item: "S/ Golden Headpiece", level: 99 },
    { slot: "Weapon", item: "S/ Blizzard Sword", level: 99 },
    { slot: "Shield", item: "S/ Wairo Shield", level: 99 },
    { slot: "Armor", item: "A/ Royal Robe", level: 90 },
    { slot: "Accessory", item: "B/ Red Ribbon", level: 19 },
  ],
  requiredSkills: ["Shield Resistance"],
  skills: ["Counter", "7-Hit Attack", "5-Hit Attack", "4-Hit Attack", "3-Hit Attack", "2-Hit Attack", "Shield Resistance"],
  invocations: [0, 0, 0, 0, 0, 0, 0],
  sampleSize: 20,
  survivedRuns: 20,
  medianCallbacks: 6.5,
  medianHerbsUsed: 6,
  averageCallbacks: 14.75,
  highestCallbacks: 90,
  atMostOneCallbackRuns: 1,
  evidenceSha256: "06cdec343990b19096a49e65b826b7cd7085d2622487c414dbaf9e4d0341d5de",
  horizonSeconds: 900,
  displayKind: "primary" as const,
  policy: { placeholderSupports: true, encounterId: 3, holyHerbLimit: 10, recoveryPotionLimit: 0, finiteHpMp: true },
} as const;

/** Lower-resource owned alternative. Reward retention versus the primary build remains uncertain. */
export const TESTED_PROFILE_BUILD_ALTERNATIVES = [{
  ...TESTED_PROFILE_BUILD_CANDIDATE,
  stats: { hp: 6102, mp: 1766, vig: 3100, atk: 879, def: 2943, spd: 615, lck: 98, int: 28, dex: 11, gth: 22, mov: 65, hrt: 9 },
  equipment: [
    { slot: "Head", item: "S/ Golden Headpiece", level: 99 },
    { slot: "Weapon", item: "S/ Blizzard Sword", level: 99 },
    { slot: "Shield", item: "S/ Wairo Shield", level: 99 },
    { slot: "Armor", item: "A/ Royal Robe", level: 90 },
    { slot: "Accessory", item: "A/ Ribbon", level: 40 },
  ],
  sampleSize: 20,
  survivedRuns: 20,
  medianCallbacks: 7,
  medianHerbsUsed: 4,
  averageCallbacks: 13.9,
  averageHerbsUsed: 4.65,
  averagePaidMp: 7726.4,
  highestCallbacks: 66,
  atMostOneCallbackRuns: 3,
  completedRuns: 20,
  evidenceSha256: "e9a0e1fdeeb6dedfc39f79b1d39b1f422fa293df497c79ee24ff6e47cd2ec8df",
  controlEvidenceSha256: "d35b56cb1ca2e47fce4a2eca25819d6a7f6ece599699f4718ad63f64949596c3",
  pairedCallbackDelta: { mean: -7.15, lower: -22.15, upper: 4.95 },
  horizonSeconds: 1800,
  displayKind: "resource-alternative" as const,
  policy: { ...TESTED_PROFILE_BUILD_CANDIDATE.policy },
}] as const;

export const TESTED_PROFILE_BUILD_CANDIDATES = [TESTED_PROFILE_BUILD_CANDIDATE, ...TESTED_PROFILE_BUILD_ALTERNATIVES] as const;
