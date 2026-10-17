import { ENCOUNTER_VARIANTS } from "@/lib/battle-setup";

export type FarmingPlannerSettings = {
  version: 1;
  encounterId: number;
  goal: "rewards" | "clear";
  useProfile: boolean;
  levelUpGear: boolean;
  trainCharacters: boolean;
  placeholderSupports: boolean;
  allowConsumables: boolean;
  holyHerbLimit: number;
  recoveryPotionLimit: number;
  startingTeamId: string;
  maxGearLevel: string;
  trainingCap: string;
  targetMatching: "nearby" | "exact";
  excludedCharacters: string[];
  reservedEquipment: string[];
};

export const FARMING_PLANNER_KEY = "ka_farming_planner_settings_v1";
export const ENCOUNTER_FAMILIES = Array.from(new Map(ENCOUNTER_VARIANTS.map((row) => [row.familyId, { id: row.familyId, name: row.familyName }])).values());
export const DEFAULT_FARMING_SETTINGS: FarmingPlannerSettings = {
  version: 1,
  encounterId: ENCOUNTER_VARIANTS.find((row) => row.familyId.includes("wairo") && row.difficulty === 2)?.id ?? ENCOUNTER_VARIANTS[0].id,
  goal: "rewards", useProfile: true, levelUpGear: false, trainCharacters: false,
  placeholderSupports: true, allowConsumables: true, holyHerbLimit: 0, recoveryPotionLimit: 0,
  startingTeamId: "", maxGearLevel: "99", trainingCap: "999", targetMatching: "nearby",
  excludedCharacters: [], reservedEquipment: [],
};

export function normalizeFarmingSettings(value: unknown): FarmingPlannerSettings {
  const raw = value && typeof value === "object" ? value as Partial<FarmingPlannerSettings> : {};
  const result = { ...DEFAULT_FARMING_SETTINGS };
  if (ENCOUNTER_VARIANTS.some((row) => row.id === raw.encounterId)) result.encounterId = raw.encounterId!;
  for (const key of ["useProfile", "levelUpGear", "trainCharacters", "placeholderSupports", "allowConsumables"] as const) {
    if (typeof raw[key] === "boolean") result[key] = raw[key];
  }
  for (const key of ["holyHerbLimit", "recoveryPotionLimit"] as const) {
    if (typeof raw[key] === "number" && Number.isFinite(raw[key])) result[key] = Math.max(0, Math.min(999, Math.trunc(raw[key])));
  }
  if (raw.goal === "clear") result.goal = "clear";
  if (raw.targetMatching === "exact") result.targetMatching = "exact";
  for (const key of ["startingTeamId", "maxGearLevel", "trainingCap"] as const) {
    if (typeof raw[key] === "string") result[key] = raw[key];
  }
  for (const key of ["excludedCharacters", "reservedEquipment"] as const) {
    if (Array.isArray(raw[key])) result[key] = raw[key]!.filter((entry): entry is string => typeof entry === "string");
  }
  return result;
}

export function switchEncounterFamily(settings: FarmingPlannerSettings, familyId: string): FarmingPlannerSettings {
  const current = ENCOUNTER_VARIANTS.find((row) => row.id === settings.encounterId);
  const options = ENCOUNTER_VARIANTS.filter((row) => row.familyId === familyId);
  const next = options.find((row) => row.difficulty === current?.difficulty) ?? options[0];
  return next ? { ...settings, encounterId: next.id } : settings;
}

/** Finite stock enforces the cap throughout a fight, regardless of its duration. */
export function farmingConsumableStock(settings: FarmingPlannerSettings) {
  return { holyHerbStock: settings.allowConsumables ? settings.holyHerbLimit : 0,
    itemStock: { "Recovery Potion (L)": settings.allowConsumables ? settings.recoveryPotionLimit : 0 } };
}

export type FarmingSearchRequest = { id: number; settings: FarmingPlannerSettings };
