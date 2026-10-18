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
  policy: { placeholderSupports: true, encounterId: 3, holyHerbLimit: 10, recoveryPotionLimit: 0, finiteHpMp: true },
} as const;
